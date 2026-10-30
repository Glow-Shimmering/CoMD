import { markdownLanguage } from '@codemirror/lang-markdown';
import type { SearchMatch } from './searchEngine';

// These source spans do not directly represent rendered text. In particular,
// pairing a URL/title with identically spelled visible text can edit a link
// when the user intended to replace its label. Ambiguous HTML is conservative.
const nonRendered = new Set([
  'URL', 'LinkTitle', 'LinkLabel', 'LinkReference', 'Image', 'HTMLTag', 'HTMLBlock', 'Comment', 'Entity', 'Escape',
  'LinkMark', 'EmphasisMark', 'CodeMark', 'HeaderMark', 'QuoteMark', 'ListMark', 'TaskMarker', 'StrikethroughMark',
  'CodeInfo', 'CodeFence', 'HorizontalRule', 'TableDelimiter', 'HardBreak'
]);

interface Interval { from: number; to: number }

/** Flag matches whose entire source span is conservatively visible text. */
export function markSourceVisibility(text: string, matches: readonly SearchMatch[]): SearchMatch[] {
  const ranges: Interval[] = [];
  markdownLanguage.parser.parse(text).iterate({ enter(node) {
    if (!nonRendered.has(node.name)) return;
    if (node.to > node.from) ranges.push({ from: node.from, to: node.to });
    return false;
  } });
  // The renderer also applies typography and math transforms that the Markdown
  // syntax tree does not mark. Such spans cannot be assumed to map literally
  // to their rendered appearance. A conservative false negative is safer than
  // accidentally editing another occurrence with the same spelling.
  const intersectsMatch = (from: number, to: number) => {
    let low = 0, high = matches.length;
    while (low < high) { const mid = (low + high) >>> 1; if (matches[mid].to <= from) low = mid + 1; else high = mid; }
    return low < matches.length && matches[low].from < to;
  };
  for (const match of text.matchAll(/\((?:c|r|tm)\)|\+-|\.{2,}|[?!]{4,}|,{2,}|-{2,}|["']/gi)) {
    const from = match.index!, to = from + match[0].length;
    if (intersectsMatch(from, to)) ranges.push({ from, to });
  }
  let cursor = 0;
  while (cursor < text.length) {
    const from = text.indexOf('$', cursor);
    if (from < 0) break;
    let precedingSlashes = 0;
    for (let at = from - 1; at >= 0 && text[at] === '\\'; at--) precedingSlashes++;
    if (precedingSlashes % 2) { cursor = from + 1; continue; }
    if (text[from + 1] === '$') {
      const close = text.indexOf('$$', from + 2);
      if (close < 0) { cursor = from + 2; continue; }
      const to = close + 2;
      if (intersectsMatch(from, to)) ranges.push({ from, to });
      cursor = to;
      continue;
    }
    const newline = text.indexOf('\n', from + 1), lineEnd = newline < 0 ? text.length : newline;
    let close = text.indexOf('$', from + 1);
    while (close >= 0 && close < lineEnd && text[close - 1] === '\\') close = text.indexOf('$', close + 1);
    // When no unescaped closing delimiter occurs on this line, no subsequent
    // unescaped dollar on it can start a complete inline expression either.
    if (close < 0 || close >= lineEnd) { cursor = Math.min(text.length, lineEnd + 1); continue; }
    const body = text.slice(from + 1, close);
    if (body && !/\s/.test(body[0]) && !/\s/.test(body[body.length - 1])) {
      const to = close + 1;
      if (intersectsMatch(from, to)) ranges.push({ from, to });
      cursor = to;
    } else cursor = from + 1;
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: Interval[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return matches.map(match => {
    // Find the first excluded span ending strictly after the match's start.
    let low = 0, high = merged.length;
    while (low < high) { const mid = (low + high) >>> 1; if (merged[mid].to <= match.from) low = mid + 1; else high = mid; }
    const forbidden = merged[low];
    return { ...match, visible: !(forbidden && forbidden.from < match.to) };
  });
}
