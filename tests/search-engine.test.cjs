const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findMatches } = require('../src/searchEngine.ts');
const { markSourceVisibility } = require('../src/searchSource.ts');

const options = (query, extra = {}) => ({ query, caseSensitive: false, wholeWord: false, regexp: false, ...extra });
const spans = result => result.matches.map(({ from, to }) => [from, to]);

test('literal search is case-insensitive by default and treats punctuation literally', () => {
  assert.deepEqual(spans(findMatches('a.c A.C abc a.c', options('a.c'))), [[0, 3], [4, 7], [12, 15]]);
  assert.deepEqual(spans(findMatches('a.c A.C abc', options('a.c', { caseSensitive: true }))), [[0, 3]]);
  assert.deepEqual(findMatches('anything', options('')), { matches: [], error: null, limited: false });
});

test('whole-word search respects Chinese segmentation and Latin word boundaries', () => {
  const text = '中文测试 中文 文 Hello helloHelper hello';
  assert.deepEqual(spans(findMatches(text, options('中文', { wholeWord: true }))), [[0, 2], [5, 7]]);
  assert.deepEqual(spans(findMatches(text, options('文', { wholeWord: true }))), [[8, 9]]);
  assert.deepEqual(spans(findMatches(text, options('hello', { wholeWord: true }))), [[10, 15], [28, 33]]);
});

test('invalid or zero-width regular expressions report errors without looping', () => {
  assert.match(findMatches('abc', options('(', { regexp: true })).error, /无效/);
  assert.match(findMatches('abc', options('(?=a)', { regexp: true })).error, /空字符串/);
  assert.match(findMatches('abc', options('a*', { regexp: true })).error, /空字符串/);
});

test('regexp search spans lines and expands numbered and named captures', () => {
  const result = findMatches('匹配 ab-12 z', options('(?<word>[a-z]+)-(\\d+)', { regexp: true }), "[$<word>|$2|$&|$$|$`|$']");
  assert.equal(result.error, null);
  assert.deepEqual(result.matches, [{ from: 3, to: 8, insert: '[ab|12|ab-12|$|匹配 | z]' }]);
  assert.deepEqual(spans(findMatches('one\nTWO', options('one\\s+TWO', { regexp: true }))), [[0, 7]]);
  assert.equal(findMatches('ab', options('(a)(b)', { regexp: true }), '$2 $1 $01 $10 $99').matches[0].insert, 'b a a a0 $99');
});

test('literal replacement does not interpret dollar substitutions', () => {
  const result = findMatches('a a', options('a'), '$&$1$$');
  assert.deepEqual(result.matches.map(m => m.insert), ['$&$1$$', '$&$1$$']);
});

test('the maximum result count distinguishes exact capacity from truncation', () => {
  const exact = findMatches('a '.repeat(5000), options('a'));
  const over = findMatches('a '.repeat(5001), options('a'));
  assert.equal(exact.matches.length, 5000); assert.equal(exact.limited, false);
  assert.equal(over.matches.length, 5000); assert.equal(over.limited, true);
});

test('replacement budget prevents unexpectedly huge replacements', () => {
  const result = findMatches('a a', options('a'), 'z'.repeat(5 * 1024 * 1024));
  assert.match(result.error, /过大/); assert.deepEqual(result.matches, []);
});

test('source mapping excludes a link target while retaining a visible link label', () => {
  const url = '[f&#111;o](foo.md)';
  assert.deepEqual(markSourceVisibility(url, findMatches(url, options('foo')).matches).map(m => m.visible), [false]);
  const label = '[foo](other.md)';
  assert.deepEqual(markSourceVisibility(label, findMatches(label, options('foo')).matches).map(m => m.visible), [true]);
  const repeated = 'foo foo';
  assert.deepEqual(markSourceVisibility(repeated, findMatches(repeated, options('foo')).matches).map(m => m.visible), [true, true]);
});

test('source mapping rejects HTML attributes, entities, references and images', () => {
  for (const [text, query] of [
    ['<span title="foo">f&#111;o</span>', 'foo'],
    ['<span>f&#111;o</span>', '111'],
    ['<div>foo</div>', 'foo'],
    ['![foo](foo.md)', 'foo'],
    ['[label][foo]\n\n[foo]: https://example.com', 'foo']
  ]) {
    const matches = findMatches(text, options(query)).matches;
    assert.ok(matches.length, text);
    assert.ok(markSourceVisibility(text, matches).every(match => !match.visible), text);
  }
});

test('source mapping retains literal code text while excluding code and emphasis markers', () => {
  const text = '**foo** `foo`\n\n```js\nfoo\n```';
  assert.deepEqual(markSourceVisibility(text, findMatches(text, options('foo')).matches).map(m => m.visible), [true, true, true]);
  assert.ok(markSourceVisibility(text, findMatches(text, options('`')).matches).every(m => !m.visible));
  assert.ok(markSourceVisibility(text, findMatches(text, options('*')).matches).every(m => !m.visible));
  assert.equal(markSourceVisibility(text, findMatches(text, options('js')).matches)[0].visible, false);
});

test('source mapping excludes table and horizontal-rule delimiters', () => {
  const text = 'foo | bar\n--- | ---\na | b\n\n---';
  assert.ok(markSourceVisibility(text, findMatches(text, options('|')).matches).every(m => !m.visible));
  assert.ok(markSourceVisibility(text, findMatches(text, options('---')).matches).every(m => !m.visible));
  assert.equal(markSourceVisibility(text, findMatches(text, options('foo')).matches)[0].visible, true);
});

test('source mapping excludes renderer-transformed typography and mathematics', () => {
  const MarkdownIt = require('markdown-it');
  const source = '(c) &#99;';
  assert.match(new MarkdownIt({ typographer: true }).render(source), /© c/);
  assert.deepEqual(markSourceVisibility(source, findMatches(source, options('c')).matches).map(m => m.visible), [false]);
  for (const text of ['$\\alpha$ &alpha;', '$$\n\\alpha\n$$ &alpha;']) {
    const matches = findMatches(text, options('alpha')).matches;
    assert.ok(matches.length);
    assert.ok(markSourceVisibility(text, matches).every(m => !m.visible));
  }
  const escapedDollar = '\\$stuff$alpha$ &#97;lpha';
  assert.deepEqual(markSourceVisibility(escapedDollar, findMatches(escapedDollar, options('alpha')).matches).map(m => m.visible), [false]);
});
