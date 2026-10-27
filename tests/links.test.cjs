const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveDocumentLink: resolve } = require('../electron/links.cjs');

test('document links resolve Chinese, spaces, parent directories and encoded fragments', () => {
  assert.deepEqual(resolve('/notes/索引/入口.md', '../章节/题目%20一.md#%E7%AC%AC%E4%BA%8C%E8%8A%82', 'darwin'),
    { kind: 'document', path: '/notes/章节/题目 一.md', fragment: '第二节' });
  assert.equal(resolve('/notes/入口.md', './百分号%25%23.md?view=1#top', 'darwin').path, '/notes/百分号%#.md');
  assert.equal(resolve('/notes/入口.md', '/other/题目.MD', 'darwin').path, '/other/题目.MD');
  assert.equal(resolve('/notes/入口.md', 'file:///other/题目%20一.md#top', 'darwin').path, '/other/题目 一.md');
  assert.deepEqual(resolve(null, '#中文'), { kind: 'anchor', fragment: '中文' });
});

test('Windows drive paths and relative paths keep Windows semantics', () => {
  assert.equal(resolve('C:\\notes\\index.md', './章节/题目%20一.md', 'win32').path, 'C:\\notes\\章节\\题目 一.md');
  assert.equal(resolve('C:\\notes\\index.md', '../题目.md', 'win32').path, 'C:\\题目.md');
  assert.equal(resolve('C:\\notes\\index.md', 'D:\\题目.md', 'win32').path, 'D:\\题目.md');
  assert.equal(resolve('C:\\notes\\index.md', 'file:///D:/题目.md', 'win32').path, 'D:\\题目.md');
});

test('external URLs stay external and only PDF attachments may use a system viewer', () => {
  for (const href of ['https://example.com/a.md#b', 'http://example.com', 'mailto:user@example.com', '//example.com/notes']) assert.equal(resolve(null, href).kind, 'external');
  assert.deepEqual(resolve('/notes/入口.md', './简历.pdf', 'darwin'), { kind: 'attachment', path: '/notes/简历.pdf', fragment: '' });
});

test('invalid encodings, executable schemes/files and unsaved relative paths fail clearly', () => {
  for (const href of ['javascript:alert(1)', 'data:text/html,hello', './app.exe', './script.sh', 'file://server/share/a.md', 'file:///tmp/a%00.md', './%00.md', './a%QQ.md', './a.md#%QQ', '\u0000.md']) {
    assert.throws(() => resolve('/notes/index.md', href, 'darwin'), undefined, href);
  }
  assert.throws(() => resolve('C:\\notes\\index.md', '\\\\server\\a.md', 'win32'));
  assert.throws(() => resolve(null, './a.md'), /先保存/);
});
