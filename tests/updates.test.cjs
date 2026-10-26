const { test } = require('node:test');
const assert = require('node:assert/strict');
const { API_URL, RELEASES_URL, CHECK_INTERVAL, newerVersion, releaseInfo, createUpdateChecker } = require('../electron/updates.cjs');
const asset = (name, extra = {}) => ({ name, state: 'uploaded', size: 100, browser_download_url: `${RELEASES_URL}/download/v0.4.0/${name}`, ...extra });
const release = extra => ({ tag_name: 'v0.4.0', draft: false, prerelease: false, body: '新版说明', assets: [asset('CoMD-0.4.0-macOS-AppleSilicon.dmg'), asset('CoMD-0.4.0-Windows-x64-Setup.exe')], ...extra });
const options = extra => ({ currentVersion: '0.3.2', platform: 'darwin', arch: 'arm64', fetch: async () => new Response(JSON.stringify(release())), ...extra });

test('Update versions compare numeric components and reject malformed or preview versions', () => {
  assert.equal(newerVersion('v0.10.0', '0.9.12'), true);
  assert.equal(newerVersion('1.0.0', '0.99.99'), true);
  assert.equal(newerVersion('0.3.2', '0.3.2'), false);
  assert.equal(newerVersion('0.3.1', '0.3.2'), false);
  for (const value of ['v0.4', '0.4.0-beta.1', '01.4.0', '0.4.9007199254740992', 'latest']) assert.throws(() => newerVersion(value, '0.3.2'));
});
test('Update downloads choose the matching platform and reject untrusted or incomplete assets', () => {
  assert.equal(releaseInfo(release(), 'darwin', 'arm64').assetName, 'CoMD-0.4.0-macOS-AppleSilicon.dmg');
  assert.equal(releaseInfo(release(), 'win32', 'x64').assetName, 'CoMD-0.4.0-Windows-x64-Setup.exe');
  assert.equal(releaseInfo(release(), 'win32', 'arm64').downloadUrl, null);
  for (const extra of [{ browser_download_url: 'https://evil.example/setup.exe' }, { state: 'new' }, { size: 0 }]) {
    const result = releaseInfo(release({ assets: [asset('CoMD-0.4.0-macOS-AppleSilicon.dmg', extra)] }), 'darwin', 'arm64');
    assert.equal(result.downloadUrl, null); assert.equal(result.pageUrl, `${RELEASES_URL}/tag/v0.4.0`);
  }
  for (const extra of [{ prerelease: true }, { draft: true }, { tag_name: 'beta' }]) assert.throws(() => releaseInfo(release(extra), 'darwin', 'arm64'));
});
test('Update checks coalesce requests, send no document payload and produce verified download targets', async () => {
  let calls = 0, finish;
  const gate = new Promise(resolve => finish = resolve), events = [];
  const updater = createUpdateChecker(options({ onChange: state => events.push(state.status), now: () => 123, fetch: async (url, request) => {
    calls++; assert.equal(url, API_URL); assert.equal(request.credentials, 'omit'); assert.equal(request.body, undefined); assert.equal(request.headers.Authorization, undefined);
    await gate; return new Response(JSON.stringify(release()));
  } }));
  const a = updater.check(), b = updater.check(); assert.equal(a, b); assert.equal(calls, 1);
  finish(); const result = await a; assert.equal(result.status, 'available'); assert.equal(result.checkedAt, 123);
  assert.deepEqual(events, ['checking', 'available']);
  assert.match(updater.openTarget('download'), /AppleSilicon\.dmg$/); updater.dispose();
});
test('Update service distinguishes current, missing release, rate limits, server errors and offline', async () => {
  const cases = [
    [async () => new Response(JSON.stringify(release({ tag_name: 'v0.3.1' }))), 'current'],
    [async () => new Response('', { status: 404 }), 'unavailable'],
    [async () => new Response('', { status: 403 }), 'error'],
    [async () => new Response('', { status: 429 }), 'error'],
    [async () => new Response('', { status: 500 }), 'error'],
    [async () => { throw new Error('offline'); }, 'error'],
    [async () => new Response('not json'), 'error'],
    [async () => new Response(JSON.stringify(release({ prerelease: true }))), 'error']
  ];
  for (const [fetch, status] of cases) { const checker = createUpdateChecker(options({ fetch })); assert.equal((await checker.check()).status, status); assert.ok(!checker.openTarget('download').endsWith('.dmg')); checker.dispose(); }
});
test('Automatic update schedule runs at startup and every six hours, and disabling preserves manual checks', async () => {
  let calls = 0, id = 0; const timers = new Map();
  const checker = createUpdateChecker(options({ fetch: async () => { calls++; return new Response(JSON.stringify(release())); }, schedule: (callback, delay) => { timers.set(++id, { callback, delay }); return id; }, cancel: id => timers.delete(id) }));
  checker.setAutomatic(true); checker.setAutomatic(true); assert.equal(timers.size, 1);
  const first = timers.get(1); assert.equal(first.delay, 10000); timers.delete(1); await first.callback();
  assert.equal(calls, 1); assert.equal(timers.get(2).delay, CHECK_INTERVAL);
  checker.setAutomatic(false); assert.equal(timers.size, 0);
  await checker.check(); assert.equal(calls, 2); assert.equal(timers.size, 0);
  checker.setAutomatic(true); assert.equal(timers.size, 1); checker.dispose(); assert.equal(timers.size, 0);
});
test('Update request timeouts end checking and allow a later retry', async () => {
  const keepAlive = setTimeout(() => {}, 500);
  const checker = createUpdateChecker(options({ requestTimeout: 10, fetch: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) }));
  try { const result = await checker.check(); assert.equal(result.status, 'error'); assert.match(result.message, /超时/); assert.equal((await checker.check()).status, 'error'); }
  finally { checker.dispose(); clearTimeout(keepAlive); }
});
