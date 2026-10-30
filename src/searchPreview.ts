export interface RenderedTextIndex {
  text: string;
  range(from: number, to: number): Range | null;
  lineAt(offset: number): number;
  offsetAtLine(line: number): number;
  elementAtLine(line: number): HTMLElement | null;
}

interface TextPart { start: number; end: number; node: Text; nodeStart: number; line: number }
interface Anchor { line: number; offset: number; element: HTMLElement }
interface DeferredSpace { node: Text; offset: number; line: number }
interface LineContext { line: number }

const documents = new WeakMap<RenderedTextIndex, Document>();
const blockTags = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FOOTER',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY',
  'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL'
]);
const omittedTags = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
const asciiWhitespace = /^[ \t\r\n\f]+$/;

/** Build a searchable rendering without changing the rendered DOM. */
export function indexRenderedText(root: HTMLElement): RenderedTextIndex {
  const doc = root.ownerDocument;
  const parts: TextPart[] = [], anchors: Anchor[] = [], chunks: string[] = [];
  const newlines = new WeakMap<Text, number[]>();
  let length = 0, lastCharacter = '', pending: DeferredSpace | null = null, lastBreakWasBlock = false;

  const appendPart = (node: Text, nodeStart: number, value: string, line: number) => {
    if (!value) return;
    const previous = parts[parts.length - 1];
    // Only merge if the document offsets and source offsets are both contiguous.
    if (previous && previous.node === node && previous.end === length &&
        previous.nodeStart + previous.end - previous.start === nodeStart) previous.end += value.length;
    else parts.push({ start: length, end: length + value.length, node, nodeStart, line });
    chunks.push(value); length += value.length; lastCharacter = value[value.length - 1]; lastBreakWasBlock = false;
  };
  const flushSpace = () => {
    if (pending && length && lastCharacter !== '\n' && lastCharacter !== ' ') appendPart(pending.node, pending.offset, ' ', pending.line);
    pending = null;
  };
  const addBreak = (block: boolean) => {
    pending = null;
    if ((!block || (length > 0 && lastCharacter !== '\n'))) {
      chunks.push('\n'); length++; lastCharacter = '\n'; lastBreakWasBlock = block;
    }
  };
  const appendText = (node: Text, context: LineContext, preserve: boolean) => {
    const text = node.data;
    if (!text) return;
    let line = context.line;
    if (preserve) {
      flushSpace(); appendPart(node, 0, text, line);
      for (let i = 0; i < text.length; i++) if (text[i] === '\n') line++;
      context.line = line;
      return;
    }
    const tokens = /[ \t\r\n\f]+|[^ \t\r\n\f]+/g;
    let token: RegExpExecArray | null;
    while ((token = tokens.exec(text))) {
      const value = token[0];
      if (asciiWhitespace.test(value)) {
        if (!pending) pending = { node, offset: token.index, line };
        for (let i = 0; i < value.length; i++) if (value[i] === '\n') line++;
      } else {
        flushSpace(); appendPart(node, token.index, value, line);
      }
    }
    context.line = line;
  };

  function visit(node: Node, inherited: LineContext, preserve: boolean): void {
    if (node.nodeType === 3) { appendText(node as Text, inherited, preserve); return; }
    if (node.nodeType !== 1) return;
    const element = node as HTMLElement, tag = element.tagName.toUpperCase();
    if (omittedTags.has(tag) || element.hasAttribute('hidden') || element.classList.contains('katex-mathml')) return;
    let style: CSSStyleDeclaration | null = null;
    try { style = doc.defaultView?.getComputedStyle(element) ?? null; } catch { /* Detached test document. */ }
    if (element.style?.display === 'none' || element.style?.visibility === 'hidden' ||
        style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return;
    if (tag === 'BR') { addBreak(false); return; }
    const display = style?.display || element.style?.display || '';
    // CSS display overrides a tag's default: a div can participate in inline
    // text, while a block-styled span starts a new rendered block.
    const inlineDisplay = /^(?:inline(?:-block|-flex|-grid|-table)?|contents|ruby(?:-base|-text)?)$/;
    const isBlock = display ? !inlineDisplay.test(display) : blockTags.has(tag);
    if (isBlock) addBreak(true);
    const attr = element.getAttribute('data-comd-line');
    const parsed = attr === null ? NaN : Number(attr);
    const hasAnchor = Number.isInteger(parsed) && parsed > 0;
    const context = hasAnchor ? { line: parsed } : inherited;
    if (Number.isInteger(parsed) && parsed > 0) anchors.push({ line: parsed, offset: length, element });
    const keepWhitespace = preserve || tag === 'PRE' || tag === 'CODE' ||
      style?.whiteSpace === 'pre' || style?.whiteSpace === 'pre-wrap' || style?.whiteSpace === 'break-spaces';
    // A closed <details> still has searchable children; finding a match opens it later.
    for (const child of element.childNodes) visit(child, context, !!keepWhitespace);
    if (isBlock) addBreak(true);
    if (hasAnchor) inherited.line = Math.max(inherited.line, context.line);
  }
  visit(root, { line: 1 }, false);
  if (lastBreakWasBlock) { chunks.pop(); length--; }
  const text = chunks.join('');
  anchors.sort((a, b) => a.line - b.line || a.offset - b.offset);

  // Find the first part whose end is greater than an offset. Synthetic block
  // separators do not have text nodes, so callers handle gaps explicitly.
  const firstPartAfter = (offset: number) => {
    let low = 0, high = parts.length;
    while (low < high) { const mid = (low + high) >>> 1; if (parts[mid].end <= offset) low = mid + 1; else high = mid; }
    return low;
  };
  const sourceLine = (part: TextPart, offset: number) => {
    const end = part.nodeStart + Math.max(0, Math.min(part.end - part.start, offset - part.start));
    let positions = newlines.get(part.node);
    if (!positions) {
      positions = [];
      let at = -1;
      while ((at = part.node.data.indexOf('\n', at + 1)) !== -1) positions.push(at);
      newlines.set(part.node, positions);
    }
    // Number of newlines before each offset, using a cached index per Text node.
    const lowerBound = (target: number) => {
      let low = 0, high = positions.length;
      while (low < high) { const mid = (low + high) >>> 1; if (positions[mid] < target) low = mid + 1; else high = mid; }
      return low;
    };
    return part.line + lowerBound(end) - lowerBound(part.nodeStart);
  };
  const anchorForLine = (line: number): Anchor | null => {
    if (!anchors.length) return null;
    let low = 0, high = anchors.length;
    while (low < high) { const mid = (low + high) >>> 1; if (anchors[mid].line <= line) low = mid + 1; else high = mid; }
    const target = anchors[Math.max(0, low - 1)].line;
    low = 0; high = anchors.length;
    while (low < high) { const mid = (low + high) >>> 1; if (anchors[mid].line < target) low = mid + 1; else high = mid; }
    return anchors[low];
  };
  const index: RenderedTextIndex = {
    text,
    range(from, to) {
      if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
      const start = Math.max(0, Math.floor(from)), end = Math.min(text.length, Math.floor(to));
      if (start >= end) return null;
      const firstIndex = firstPartAfter(start);
      const first = parts[firstIndex];
      if (!first || first.start >= end) return null;
      let lastIndex = firstPartAfter(end - 1);
      if (lastIndex === parts.length || parts[lastIndex].start >= end) lastIndex--;
      const last = parts[lastIndex];
      if (!last || lastIndex < firstIndex) return null;
      try {
        const result = doc.createRange();
        result.setStart(first.node, first.nodeStart + Math.max(0, start - first.start));
        result.setEnd(last.node, last.nodeStart + Math.min(last.end - last.start, end - last.start));
        return result;
      } catch { return null; }
    },
    lineAt(offset) {
      if (!parts.length) return 1;
      const at = Math.max(0, Math.min(text.length, Number.isFinite(offset) ? Math.floor(offset) : 0));
      const position = firstPartAfter(at);
      const part = parts[position] ?? parts[parts.length - 1];
      return sourceLine(part, at);
    },
    offsetAtLine(line) { return Math.min(text.length, anchorForLine(line)?.offset ?? 0); },
    elementAtLine(line) { return anchorForLine(line)?.element ?? null; }
  };
  documents.set(index, doc);
  return index;
}

type HighlightRegistry = { set(name: string, value: unknown): unknown; delete(name: string): unknown };
type HighlightInstance = { priority: number };
type HighlightView = { CSS?: { highlights?: HighlightRegistry }; Highlight?: new (...ranges: Range[]) => HighlightInstance };
const activeRegistries = new Set<HighlightRegistry>();

export function clearPreviewMatches(): void {
  for (const registry of activeRegistries) { registry.delete('comd-search'); registry.delete('comd-search-current'); }
  activeRegistries.clear();
}

/** Highlight without inserting marks or disturbing links, selection, or React's DOM. */
export function paintPreviewMatches(index: RenderedTextIndex, matches: { from: number; to: number }[], current: number): Range | null {
  clearPreviewMatches();
  const ranges = matches.map(match => index.range(match.from, match.to));
  const currentRange = ranges[current] ?? null;
  const view = documents.get(index)?.defaultView as unknown as HighlightView | null;
  const registry = view?.CSS?.highlights, HighlightConstructor = view?.Highlight;
  if (!registry || !HighlightConstructor) return currentRange;
  const visible = ranges.filter((range): range is Range => range !== null);
  try {
    if (visible.length) registry.set('comd-search', new HighlightConstructor(...visible));
    if (currentRange) { const highlight = new HighlightConstructor(currentRange); highlight.priority = 1; registry.set('comd-search-current', highlight); }
    activeRegistries.add(registry);
  } catch { registry.delete('comd-search'); registry.delete('comd-search-current'); }
  return currentRange;
}
