const LIMIT = 40;
const valid = item => item && ['file', 'folder'].includes(item.kind) && typeof item.path === 'string' && item.path.length > 0;
function normalizeRecent(items, legacyFiles = [], folder = null) {
  const source = Array.isArray(items) && items.length ? items : [
    ...(folder?.path ? [{ kind: 'folder', path: folder.path }] : []),
    ...(Array.isArray(legacyFiles) ? legacyFiles.filter(file => typeof file === 'string').map(file => ({ kind: 'file', path: file })) : [])
  ];
  const seen = new Set();
  return source.filter(item => {
    if (!valid(item)) return false;
    const key = JSON.stringify([item.kind, item.path]);
    if (seen.has(key)) return false; seen.add(key); return true;
  }).slice(0, LIMIT).map(({ kind, path }) => ({ kind, path }));
}
function rememberRecent(items, item) {
  if (!valid(item)) throw new Error('最近打开记录无效。');
  return normalizeRecent([item, ...items]);
}
module.exports = { normalizeRecent, rememberRecent };
