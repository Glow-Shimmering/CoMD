const path = require('node:path');
const { fileURLToPath } = require('node:url');

// Resolve relative links against the document, never the renderer's index.html.
// Only documents and PDF attachments may be opened from the local filesystem.
function resolveDocumentLink(sourcePath, raw, platform = process.platform) {
  if (typeof raw !== 'string' || raw.length > 8192 || /[\x00-\x1f\x7f]/.test(raw)) throw new Error('链接格式无效。');
  const href = raw.trim();
  const decode = value => { try { return decodeURIComponent(value); } catch { throw new Error('链接中的路径编码无效。'); } };
  if (/^(https?:|mailto:)/i.test(href) || href.startsWith('//')) {
    const url = new URL(href.startsWith('//') ? 'https:' + href : href);
    return { kind: 'external', url: url.href };
  }
  if (!href || href.startsWith('#')) return { kind: 'anchor', fragment: decode(href.slice(1)) };
  const windows = platform === 'win32', paths = windows ? path.win32 : path.posix;
  const isDrive = windows && /^[a-z]:[\\/]/i.test(href);
  let target, fragment = '';
  if (/^file:/i.test(href)) {
    const url = new URL(href);
    if (url.hostname && url.hostname !== 'localhost') throw new Error('不支持网络共享文件链接。');
    fragment = decode(url.hash.slice(1));
    target = fileURLToPath(url, { windows });
  } else {
    if (!isDrive && /^[a-z][a-z\d+.-]*:/i.test(href)) throw new Error('不支持此链接类型。');
    const hash = href.indexOf('#'), location = hash < 0 ? href : href.slice(0, hash);
    fragment = hash < 0 ? '' : decode(href.slice(hash + 1));
    const decoded = decode(location.split('?')[0]);
    if (!decoded) return { kind: 'anchor', fragment };
    if (!paths.isAbsolute(decoded) && !sourcePath) throw new Error('请先保存当前文档，再打开相对路径链接。');
    target = paths.resolve(sourcePath ? paths.dirname(sourcePath) : '.', decoded);
  }
  if (/[\x00-\x1f\x7f]/.test(target) || target.startsWith('\\\\')) throw new Error('链接路径无效。');
  if (/\.(md|markdown|mdown|txt)$/i.test(target)) return { kind: 'document', path: target, fragment };
  if (/\.pdf$/i.test(target)) return { kind: 'attachment', path: target, fragment };
  throw new Error('本地链接支持 Markdown、文本与 PDF 文件。');
}
module.exports = { resolveDocumentLink };
