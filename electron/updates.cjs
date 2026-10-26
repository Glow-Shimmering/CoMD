const REPOSITORY = 'Glow-Shimmering/CoMD';
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;
const API_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
function versionParts(value) {
  const match = typeof value === 'string' && /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
function newerVersion(candidate, current) {
  const a = versionParts(candidate), b = versionParts(current);
  if (!a || !b) throw new Error('版本信息格式无效，请前往发布页面查看。');
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function releaseInfo(data, platform, arch) {
  if (!data || data.draft || data.prerelease || !versionParts(data.tag_name)) throw new Error('暂未找到有效的正式版本，请前往发布页面查看。');
  const tag = data.tag_name, version = versionParts(tag).join('.');
  const pageUrl = `${RELEASES_URL}/tag/${encodeURIComponent(tag)}`;
  // Accept only uploaded assets for this repository, tag and supported architecture.
  const assets = (Array.isArray(data.assets) ? data.assets : []).filter(asset => {
    if (asset.state !== 'uploaded' || !(asset.size > 0) || typeof asset.name !== 'string') return false;
    return asset.browser_download_url === `${RELEASES_URL}/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset.name)}`;
  });
  const names = platform === 'darwin' && arch === 'arm64'
    ? [`CoMD-${version}-macOS-AppleSilicon.dmg`, `CoMD-${version}-mac-arm64.dmg`, `CoMD-${version}-macOS-AppleSilicon.zip`, `CoMD-${version}-mac-arm64.zip`]
    : platform === 'win32' && arch === 'x64'
      ? [`CoMD-${version}-Windows-x64-Setup.exe`, `CoMD-${version}-Windows-x64-Portable.zip`, `CoMD-${version}-win-x64.zip`] : [];
  const asset = names.map(name => assets.find(item => item.name === name)).find(Boolean);
  return { version, pageUrl, notes: typeof data.body === 'string' ? data.body.slice(0, 16000) : '', downloadUrl: asset?.browser_download_url ?? null, assetName: asset?.name ?? null };
}
function createUpdateChecker({ currentVersion, platform, arch, fetch, onChange = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout, requestTimeout = 15000 }) {
  let state = { status: 'idle', currentVersion, release: null, checkedAt: null, message: '' };
  let pending = null, timer = null, automatic = false, disposed = false, controller = null;
  const publish = next => { state = { ...state, ...next }; if (!disposed) onChange(state); return state; };
  function check() {
    if (pending) return pending;
    publish({ status: 'checking', message: '' });
    pending = (async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), requestTimeout); timeout.unref?.();
      try {
        const response = await fetch(API_URL, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': `CoMD/${currentVersion}` }, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal });
        if (response.status === 404) return publish({ status: 'unavailable', release: null, checkedAt: now(), message: '暂未找到公开的正式版本，请稍后重试或前往发布页面查看。' });
        if (response.status === 403 || response.status === 429) throw new Error('GitHub 暂时限制了请求频率，请稍后再试。');
        if (!response.ok) throw new Error(`更新服务暂不可用（HTTP ${response.status}），请稍后重试。`);
        const release = releaseInfo(await response.json(), platform, arch);
        return publish({ status: newerVersion(release.version, currentVersion) ? 'available' : 'current', release, checkedAt: now(), message: '' });
      } catch (error) {
        const message = controller.signal.aborted ? '检查更新超时，请检查网络后重试。'
          : /版本|GitHub|更新服务/.test(error.message ?? '') ? error.message : '无法连接更新服务，请检查网络后重试。';
        return publish({ status: 'error', release: null, checkedAt: now(), message });
      } finally { clearTimeout(timeout); controller = null; }
    })().finally(() => { pending = null; });
    return pending;
  }
  function queue(delay) {
    timer = schedule(async () => {
      timer = null;
      if (!automatic || disposed) return;
      await check();
      if (automatic && !disposed && timer === null) queue(CHECK_INTERVAL);
    }, delay);
    timer?.unref?.();
  }
  function setAutomatic(enabled) {
    if (automatic === enabled || disposed) return;
    automatic = enabled;
    if (timer !== null) { cancel(timer); timer = null; }
    if (enabled) queue(10000);
  }
  return {
    check, setAutomatic, getState: () => state,
    openTarget: kind => kind === 'download' && state.status === 'available' && state.release?.downloadUrl ? state.release.downloadUrl : state.release?.pageUrl ?? RELEASES_URL,
    dispose() { disposed = true; automatic = false; if (timer !== null) cancel(timer); controller?.abort(); }
  };
}
module.exports = { API_URL, RELEASES_URL, CHECK_INTERVAL, newerVersion, releaseInfo, createUpdateChecker };
