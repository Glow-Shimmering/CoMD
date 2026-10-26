import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkUpdates(page, application, { until, output }) {
  await application.evaluate(({ net, shell }) => {
    globalThis.updateTest = { originalFetch: net.fetch, originalOpen: shell.openExternal, calls: [], opened: [], mode: 'available' };
    const fixture = { tag_name: 'v0.4.0', draft: false, prerelease: false, body: '## 新版体验\n\n- 更流畅的编辑体验\n- 改进文件夹与文档导航\n\n<script>window.__updateInjected = true</script>', assets: ['CoMD-0.4.0-macOS-AppleSilicon.dmg', 'CoMD-0.4.0-Windows-x64-Setup.exe'].map(name => ({ name, state: 'uploaded', size: 100, browser_download_url: 'https://github.com/Glow-Shimmering/CoMD/releases/download/v0.4.0/' + name })) };
    net.fetch = async (url, request) => {
      if (!String(url).startsWith('https://api.github.com/repos/Glow-Shimmering/CoMD/releases/latest')) return globalThis.updateTest.originalFetch(url, request);
      const test = globalThis.updateTest; test.calls.push({ url, body: request.body, authorization: request.headers.Authorization });
      if (test.mode === 'offline') throw new Error('offline');
      if (test.mode === 'missing') return new Response('', { status: 404 });
      if (test.mode === 'current') return new Response(JSON.stringify({ ...fixture, tag_name: 'v0.3.2' }));
      if (test.mode === 'no-asset') return new Response(JSON.stringify({ ...fixture, assets: [] }));
      return new Response(JSON.stringify(fixture));
    };
    shell.openExternal = async url => { globalThis.updateTest.opened.push(url); };
  });
  const modal = page.getByRole('dialog', { name: '偏好设置', exact: true });
  const indicator = page.getByRole('button', { name: '发现新版本', exact: true });
  const mode = value => application.evaluate((_electron, value) => { globalThis.updateTest.mode = value; }, value);
  const check = () => modal.getByRole('button', { name: '检查更新', exact: true }).click();
  await until(async () => await indicator.count() === 1, 'automatic update after startup', 18000);
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal((await application.evaluate(() => globalThis.updateTest.calls)).length, 1);
  await indicator.click();
  await modal.getByRole('heading', { name: '发现新版本 0.4.0', exact: true }).waitFor();
  assert.equal(await modal.getByRole('checkbox', { name: '自动检查更新', exact: true }).isChecked(), true);
  assert.equal(await page.evaluate(() => window.__updateInjected), undefined);
  await page.screenshot({ path: path.join(output, 'CoMD-updates.png') });
  await modal.getByRole('button', { name: '下载安装包', exact: true }).click();
  await modal.getByRole('button', { name: '前往发布页面', exact: true }).click();
  const opened = await application.evaluate(() => globalThis.updateTest.opened);
  assert.match(opened[0], process.platform === 'darwin' ? /AppleSilicon\.dmg$/ : /Windows-x64-Setup\.exe$/);
  assert.equal(opened[1], 'https://github.com/Glow-Shimmering/CoMD/releases/tag/v0.4.0');
  assert.equal((await page.evaluate(() => window.comd.openUpdate('https://evil.example'))).ok, false);
  await modal.getByRole('checkbox', { name: '自动检查更新', exact: true }).uncheck();
  await until(async () => (await page.evaluate(() => window.comd.bootstrap())).value.preferences.autoCheckUpdates === false, 'persist automatic update switch');
  await mode('offline'); await check();
  await modal.getByText('无法连接更新服务，请检查网络后重试。', { exact: true }).waitFor();
  assert.equal(await indicator.count(), 0);
  await mode('missing'); await check();
  await modal.getByRole('heading', { name: '暂无可用的发布信息', exact: true }).waitFor();
  await mode('no-asset'); await check();
  await modal.getByText('当前系统的安装包尚未提供，可前往发布页面查看。', { exact: true }).waitFor();
  assert.equal(await modal.getByRole('button', { name: '下载安装包', exact: true }).count(), 0);
  await mode('current'); await check();
  await modal.getByRole('heading', { name: '当前无需更新', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await application.evaluate(({ Menu }) => { Menu.getApplicationMenu().items.find(item => item.label === '帮助').submenu.items.find(item => item.label === '检查更新…').click(); });
  await modal.getByRole('heading', { name: '当前无需更新', exact: true }).waitFor();
  const calls = await application.evaluate(() => globalThis.updateTest.calls);
  assert.ok(calls.every(call => call.body === undefined && call.authorization === undefined));
  await page.keyboard.press('Escape');
  // Leave the existing settings tests on their expected editor tab.
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await modal.getByRole('button', { name: '编辑器', exact: true }).click();
  await page.keyboard.press('Escape');
  await application.evaluate(({ net, shell }) => { net.fetch = globalThis.updateTest.originalFetch; shell.openExternal = globalThis.updateTest.originalOpen; });
  return [
    'Automatic update check after startup, quiet new-version indicator and safe release notes',
    'Manual checks, native menu, automatic preference, matching download and official release links',
    'Update offline/missing-release/current-version/missing-installer states and retry recovery'
  ];
}
