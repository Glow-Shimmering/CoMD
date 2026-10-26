const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { folderInfo, listFolder, folderDocument } = require('../electron/folders.cjs');
async function fixture(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'comd-folders-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = await fs.realpath(temp); await fs.mkdir(path.join(root, 'docs'));
  return { temp: root, folder: await folderInfo(path.join(root, 'docs')) };
}
test('Folder listing is lazy, folders first, and includes Markdown and text files', async t => {
  const { folder } = await fixture(t);
  for (const name of ['子目录', '.git', 'node_modules']) await fs.mkdir(path.join(folder.path, name));
  for (const name of ['笔记10.md', '笔记2.MD', '说明.txt', 'photo.png']) await fs.writeFile(path.join(folder.path, name), 'text');
  const entries = await listFolder(folder.path, folder.path);
  assert.deepEqual(entries.map(entry => entry.name), ['子目录', '笔记2.MD', '笔记10.md', '说明.txt']);
  assert.equal(entries[0].kind, 'folder'); assert.equal(entries[1].kind, 'file');
  assert.deepEqual(await listFolder(folder.path, entries[0].path), []);
  assert.equal(await folderDocument(folder.path, entries[1].path), entries[1].path);
  await assert.rejects(folderDocument(folder.path, path.join(folder.path, 'photo.png')), /Markdown/);
});
test('Folder authorization rejects outside paths and symlink escapes', async t => {
  const { temp, folder } = await fixture(t);
  const outside = path.join(temp, 'outside.md'); await fs.writeFile(outside, 'private');
  await assert.rejects(listFolder(null, folder.path), /已打开/);
  await assert.rejects(listFolder(folder.path, temp), /已打开/);
  await assert.rejects(folderDocument(folder.path, path.join(folder.path, '..', 'outside.md')), /已打开/);
  try { await fs.symlink(outside, path.join(folder.path, 'escape.md')); }
  catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') return; throw error; }
  assert.equal((await listFolder(folder.path, folder.path)).length, 0);
  await assert.rejects(folderDocument(folder.path, path.join(folder.path, 'escape.md')), /已打开/);
});
