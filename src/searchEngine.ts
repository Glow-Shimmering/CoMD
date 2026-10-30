export interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

export interface SearchMatch { from: number; to: number; insert: string; visible?: boolean }
export interface SearchResult { matches: SearchMatch[]; error: string | null; limited: boolean }

const LIMIT = 5000;
const REPLACEMENT_LIMIT = 8 * 1024 * 1024;
const wordCharacter = /[\p{L}\p{N}\p{M}_]/u;
const failure = (error: string): SearchResult => ({ matches: [], error, limited: false });

function before(text: string, index: number): string {
  if (!index) return '';
  const last = text.charCodeAt(index - 1);
  const from = last >= 0xdc00 && last <= 0xdfff && index >= 2 ? index - 2 : index - 1;
  return text.slice(from, index);
}

function after(text: string, index: number): string {
  const point = text.codePointAt(index);
  return point === undefined ? '' : String.fromCodePoint(point);
}

// Segment Chinese and other scripts where words are not separated by spaces.
// Keep a Unicode-aware boundary fallback for environments without Segmenter.
function wordBoundaries(text: string): ((match: RegExpExecArray) => boolean) {
  let starts: Set<number> | undefined, ends: Set<number> | undefined;
  if (typeof Intl.Segmenter === 'function') {
    starts = new Set(); ends = new Set();
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    for (const part of segmenter.segment(text)) {
      if (part.isWordLike) { starts.add(part.index); ends.add(part.index + part.segment.length); }
    }
  }
  return match => {
    const value = match[0], from = match.index, to = from + value.length;
    const first = after(value, 0), last = before(value, value.length);
    const startOK = !wordCharacter.test(first) || (starts ? starts.has(from) : !wordCharacter.test(before(text, from)));
    const endOK = !wordCharacter.test(last) || (ends ? ends.has(to) : !wordCharacter.test(after(text, to)));
    return startOK && endOK;
  };
}

// ECMAScript replacement substitutions, including named groups and the text
// before/after a match. Enforce a total output budget before appending strings.
function expandReplacement(template: string, match: RegExpExecArray, text: string, budget: number): string | null {
  const chunks: string[] = [];
  let length = 0;
  const append = (part: string) => {
    length += part.length;
    if (length > budget) return false;
    chunks.push(part); return true;
  };
  for (let i = 0; i < template.length; i++) {
    if (template[i] !== '$' || i + 1 >= template.length) {
      if (!append(template[i])) return null;
      continue;
    }
    const next = template[i + 1];
    let part: string | undefined, consumed = 1;
    if (next === '$') part = '$';
    else if (next === '&') part = match[0];
    else if (next === '`') part = text.slice(0, match.index);
    else if (next === "'") part = text.slice(match.index + match[0].length);
    else if (next === '<' && match.groups) {
      const close = template.indexOf('>', i + 2);
      if (close !== -1) { part = match.groups[template.slice(i + 2, close)] ?? ''; consumed = close - i; }
    } else if (/[0-9]/.test(next)) {
      const second = template[i + 2];
      const firstNum = Number(next);
      const twoNum = second && /[0-9]/.test(second) ? Number(next + second) : 0;
      const count = match.length - 1;
      if (twoNum > 0 && twoNum <= count) { part = match[twoNum] ?? ''; consumed = 2; }
      else if (firstNum > 0 && firstNum <= count) part = match[firstNum] ?? '';
    }
    if (part === undefined) { if (!append('$')) return null; }
    else { if (!append(part)) return null; i += consumed; }
  }
  return chunks.join('');
}

export function findMatches(text: string, options: SearchOptions, replacement = ''): SearchResult {
  if (!options.query) return { matches: [], error: null, limited: false };
  let expression: RegExp;
  try {
    const pattern = options.regexp ? options.query : options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expression = new RegExp(pattern, `gmu${options.caseSensitive ? '' : 'i'}`);
  } catch {
    return failure('正则表达式无效，请检查输入。');
  }

  const isWholeWord = options.wholeWord ? wordBoundaries(text) : null;
  const matches: SearchMatch[] = [];
  let used = 0, match: RegExpExecArray | null;
  while ((match = expression.exec(text)) !== null) {
    if (!match[0].length) return failure('不支持匹配空字符串的正则表达式。');
    if (isWholeWord && !isWholeWord(match)) continue;
    if (matches.length === LIMIT) return { matches, error: null, limited: true };
    const remaining = REPLACEMENT_LIMIT - used;
    const insert = options.regexp ? expandReplacement(replacement, match, text, remaining) : replacement;
    if (insert === null || insert.length > remaining) return failure('替换结果过大，请缩小范围或修改替换内容。');
    used += insert.length;
    matches.push({ from: match.index, to: match.index + match[0].length, insert });
  }
  return { matches, error: null, limited: false };
}
