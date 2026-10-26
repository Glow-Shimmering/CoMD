const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRecent, rememberRecent } = require('../electron/recent.cjs');
test('Recent history migrates legacy files and the current folder without duplicates', () => {
  assert.deepEqual(normalizeRecent([], ['/docs/a.md', '/docs/b.md', '/docs/a.md'], { path: '/docs' }), [
    { kind: 'folder', path: '/docs' }, { kind: 'file', path: '/docs/a.md' }, { kind: 'file', path: '/docs/b.md' }
  ]);
  const saved = [{ kind: 'file', path: '/docs/b.md' }, { kind: 'folder', path: '/docs' }];
  assert.deepEqual(normalizeRecent(saved, ['/old.md'], { path: '/other' }), saved);
  assert.deepEqual(normalizeRecent([null, { kind: 'bad', path: '/x' }, { kind: 'file', path: '' }]), []);
});
test('Recent history orders successful selections first and retains at most 40 unique items', () => {
  let items = [];
  for (let i = 0; i < 45; i++) items = rememberRecent(items, { kind: i % 2 ? 'file' : 'folder', path: '/item-' + i });
  assert.equal(items.length, 40); assert.equal(items[0].path, '/item-44');
  items = rememberRecent(items, { kind: 'file', path: '/item-7' });
  assert.deepEqual(items[0], { kind: 'file', path: '/item-7' });
  assert.equal(items.length, 40); assert.equal(items.filter(item => item.path === '/item-7').length, 1);
});
