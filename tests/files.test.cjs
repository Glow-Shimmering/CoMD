const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { readDocument, writeDocument, within } = require('../electron/files.cjs');
const fixture = async t => { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'comd-unit-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; };
test('UTF-8 BOM and CRLF survive a save; previous disk version is backed up', async t => {
  const dir = await fixture(t), file = path.join(dir, '中文.md'), before = Buffer.from('\ufeff# 标题\r\n原文\r\n');
  await fs.writeFile(file, before); const disk = await readDocument(file);
  assert.equal(disk.content, '# 标题\n原文\n'); assert.equal(disk.bom, true); assert.equal(disk.eol, '\r\n');
  const saved = await writeDocument({ path: file, ...disk, baseHash: disk.hash }, '# 标题\n修改\n', false, path.join(dir, 'backups'));
  assert.equal(saved.conflict, false); assert.deepEqual(await fs.readFile(file), Buffer.from('\ufeff# 标题\r\n修改\r\n'));
  const backups = await fs.readdir(path.join(dir, 'backups')); assert.equal(backups.length, 1); assert.deepEqual(await fs.readFile(path.join(dir, 'backups', backups[0])), before);
});
test('External changes and deletions produce conflicts without overwriting', async t => {
  const dir = await fixture(t), file = path.join(dir, 'note.md'); await fs.writeFile(file, 'original');
  const disk = await readDocument(file), record = { path: file, ...disk, baseHash: disk.hash };
  await fs.writeFile(file, 'external'); const result = await writeDocument(record, 'local');
  assert.equal(result.conflict, true); assert.equal(result.disk, 'external'); assert.equal(await fs.readFile(file, 'utf8'), 'external');
  await fs.rm(file); assert.equal((await writeDocument(record, 'local')).conflict, true);
  await assert.rejects(fs.stat(file));
});
test('Explicit conflict resolution preserves external version as backup', async t => {
  const dir = await fixture(t), file = path.join(dir, 'note.md'); await fs.writeFile(file, 'external');
  const result = await writeDocument({ path: file, baseHash: 'old' }, 'accepted local', true, path.join(dir, 'backups'));
  assert.equal(result.conflict, false); assert.equal(await fs.readFile(file, 'utf8'), 'accepted local');
  const [backup] = await fs.readdir(path.join(dir, 'backups')); assert.equal(await fs.readFile(path.join(dir, 'backups', backup), 'utf8'), 'external');
});
test('Rejects non-UTF8 and binary files instead of corrupting them', async t => {
  const dir = await fixture(t), file = path.join(dir, 'bad.md');
  await fs.writeFile(file, Buffer.from([0xff,0xfe,0x41,0x00])); await assert.rejects(readDocument(file), /UTF-8/);
  await fs.writeFile(file, 'text\0binary'); await assert.rejects(readDocument(file), /文本/);
});
test('Asset directory boundary blocks traversal and sibling-prefix escapes', () => {
  assert.equal(within('/docs', '/docs/image.png'), true); assert.equal(within('/docs', '/docs/sub/image.png'), true);
  assert.equal(within('/docs', '/docs-other/image.png'), false); assert.equal(within('/docs', '/image.png'), false);
});
