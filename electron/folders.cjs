const fs = require('node:fs/promises');
const path = require('node:path');
const { within } = require('./files.cjs');

const documentExtension = /\.(md|markdown|mdown|txt)$/i;
const ignoredDirectories = new Set(['.git', 'node_modules']);

async function folderInfo(directory) {
  const real = await fs.realpath(directory);
  if (!(await fs.stat(real)).isDirectory()) throw new Error('请选择文件夹。');
  return { path: real, name: path.basename(real) || real };
}
async function authorizedPath(root, candidate) {
  if (!root || typeof candidate !== 'string' || !within(root, path.resolve(candidate))) throw new Error('路径不在已打开的文件夹内。');
  const real = await fs.realpath(candidate);
  if (!within(root, real)) throw new Error('路径不在已打开的文件夹内。');
  return real;
}
async function listFolder(root, directory) {
  const real = await authorizedPath(root, directory);
  const entries = await fs.readdir(real, { withFileTypes: true });
  return entries.filter(entry => !entry.isSymbolicLink() &&
    (entry.isDirectory() ? !ignoredDirectories.has(entry.name) : entry.isFile() && documentExtension.test(entry.name)))
    .map(entry => ({ name: entry.name, path: path.join(real, entry.name), kind: entry.isDirectory() ? 'folder' : 'file' }))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'folder' ? -1 : 1) || a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
}
async function folderDocument(root, file) {
  const real = await authorizedPath(root, file);
  if (!documentExtension.test(real) || !(await fs.stat(real)).isFile()) throw new Error('请选择 Markdown 或文本文件。');
  return real;
}
module.exports = { folderInfo, listFolder, folderDocument };
