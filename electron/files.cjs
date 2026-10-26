const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const LIMIT = 20 * 1024 * 1024;
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
async function readDocument(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > LIMIT) throw new Error('请选择小于 20 MB 的文本文件。');
  const bytes = await fs.readFile(filePath);
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = bom ? bytes.subarray(3) : bytes;
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(body); }
  catch { throw new Error('文件不是 UTF-8 编码，请先转换为 UTF-8 再打开。'); }
  if (text.includes('\0')) throw new Error('该文件似乎不是文本文件。');
  return { content: text.replace(/\r\n/g, '\n'), hash: hash(bytes), bom, eol: text.includes('\r\n') ? '\r\n' : '\n', mode: stat.mode };
}
async function atomicWrite(filePath, data, mode) {
  const temp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  try {
    const fd = await fs.open(temp, 'wx', mode ?? 0o600);
    try { await fd.writeFile(data); await fd.sync(); } finally { await fd.close(); }
    await fs.rename(temp, filePath);
  } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
}
function encode(content, record) {
  const text = content.replace(/\r\n/g, '\n').replace(/\n/g, record.eol ?? '\n');
  return Buffer.from((record.bom ? '\ufeff' : '') + text, 'utf8');
}
async function writeDocument(record, content, force = false, backupDir) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > LIMIT) throw new Error('文档超过 20 MB 限制。');
  let current;
  try { current = await readDocument(record.path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!force && (current?.hash ?? null) !== (record.baseHash ?? null)) {
    return { conflict: true, disk: current?.content ?? null, hash: current?.hash ?? null };
  }
  if (current && backupDir) {
    await fs.mkdir(backupDir, { recursive: true });
    await atomicWrite(path.join(backupDir, hash(record.path) + '.md'), encode(current.content, current));
  }
  // Verify again after backup I/O so an observed external change never gets overwritten.
  let latest;
  try { latest = hash(await fs.readFile(record.path)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!force && (latest ?? null) !== (current?.hash ?? null)) return { conflict: true, disk: (await readDocument(record.path)).content };
  const bytes = encode(content, record);
  await atomicWrite(record.path, bytes, current?.mode ?? record.mode);
  return { conflict: false, hash: hash(bytes), content };
}
function within(root, target) {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
module.exports = { readDocument, atomicWrite, writeDocument, encode, hash, within };
