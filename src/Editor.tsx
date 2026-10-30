import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorState, Compartment, StateEffect, StateField, Transaction, type Range } from '@codemirror/state';
import { EditorView, Decoration, ViewPlugin, WidgetType, keymap, lineNumbers, drawSelection, highlightActiveLine, placeholder, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap, indentWithTab, isolateHistory } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxTree, syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { highlightSelectionMatches } from '@codemirror/search';
import { markdownLink } from './markdown';
import type { SearchMatch } from './searchEngine';
const states = new Map<string, EditorState>();
export const forgetEditor = (id: string) => states.delete(id);
type SearchHits = { matches: readonly { from: number; to: number }[]; current: number };
const setSearchHits = StateEffect.define<SearchHits>();
const searchHits = StateField.define<SearchHits>({
  create: () => ({ matches: [], current: -1 }),
  update(value, transaction) {
    if (transaction.docChanged) value = { matches: [], current: -1 };
    for (const effect of transaction.effects) if (effect.is(setSearchHits)) value = effect.value;
    return value;
  },
  provide: field => EditorView.decorations.from(field, value => Decoration.set(value.matches
    .flatMap((match, index) => match.to > match.from ? [Decoration.mark({ class: `cm-comd-search-match${index === value.current ? ' cm-comd-search-current' : ''}` }).range(match.from, match.to)] : []), true))
});
class Bullet extends WidgetType {
  toDOM() { const span = document.createElement('span'); span.className = 'live-bullet'; span.textContent = '•'; return span; }
}
class TaskCheckbox extends WidgetType {
  constructor(readonly checked: boolean, readonly from: number) { super(); }
  eq(other: TaskCheckbox) { return other.checked === this.checked && other.from === this.from; }
  toDOM(view: EditorView) {
    const input = document.createElement('input'); input.type = 'checkbox'; input.className = 'live-checkbox'; input.checked = this.checked; input.setAttribute('aria-label', '完成任务');
    input.addEventListener('change', () => view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert: input.checked ? 'x' : ' ' } }));
    return input;
  }
}
function liveDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [], lines = new Map<number, string>();
  const selection = view.state.selection.main;
  const touched = (from: number, to: number) => {
    const first = view.state.doc.lineAt(from), last = view.state.doc.lineAt(to);
    return (view.hasFocus && selection.from <= last.to && selection.to >= first.from) || view.state.field(searchHits).matches.some(hit => hit.from < to && hit.to > from);
  };
  const add = (from: number, to: number, className: string) => { if (to > from) ranges.push(Decoration.mark({ class: className }).range(from, to)); };
  const hide = (from: number, to: number) => {
    const hits = view.state.field(searchHits);
    if (to > from && !touched(from, to) && !hits.matches.some(hit => hit.from < to && hit.to > from)) ranges.push(Decoration.replace({}).range(from, to));
  };
  for (const visible of view.visibleRanges) {
    syntaxTree(view.state).iterate({ from: visible.from, to: visible.to, enter(node) {
      const { from, to, name } = node;
      if (/^ATXHeading[1-6]$/.test(name)) {
        const line = view.state.doc.lineAt(from); lines.set(line.from, `cm-md-heading cm-md-h${name.slice(-1)}`);
        const marker = /^#{1,6}\s+/.exec(line.text); if (marker) hide(from, from + marker[0].length);
      } else if (name === 'TaskMarker' && !touched(from, to)) {
        ranges.push(Decoration.replace({ widget: new TaskCheckbox(/x/i.test(view.state.sliceDoc(from, to)), from) }).range(from, to));
      } else if (name === 'ListMark' && /^[-+*]$/.test(view.state.sliceDoc(from, to)) && !touched(from, to)) {
        ranges.push(Decoration.replace({ widget: new Bullet() }).range(from, to));
      } else if (name === 'StrongEmphasis') add(from, to, 'cm-md-strong');
      else if (name === 'Emphasis') add(from, to, 'cm-md-em');
      else if (name === 'Strikethrough') add(from, to, 'cm-md-strike');
      else if (name === 'InlineCode') add(from, to, 'cm-md-code');
      else if (name === 'Link') add(from, to, 'cm-md-link');
      else if (name === 'Blockquote') {
        const begin = view.state.doc.lineAt(from).number, end = view.state.doc.lineAt(to).number;
        for (let n = begin; n <= end; n++) lines.set(view.state.doc.line(n).from, 'cm-md-quote');
      } else if (name === 'FencedCode') {
        const begin = view.state.doc.lineAt(from).number, end = view.state.doc.lineAt(to).number;
        for (let n = begin; n <= end; n++) lines.set(view.state.doc.line(n).from, 'cm-md-fence');
      } else if (['EmphasisMark', 'StrikethroughMark', 'CodeMark'].includes(name) && node.node.parent?.name !== 'FencedCode') hide(from, to);
      else if (name === 'QuoteMark') hide(from, Math.min(to + 1, view.state.doc.lineAt(to).to));
    } });
  }
  for (const [from, className] of lines) ranges.push(Decoration.line({ class: className }).range(from));
  return Decoration.set(ranges, true);
}
const livePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = liveDecorations(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged || update.focusChanged || update.transactions.some(t => t.effects.some(e => e.is(setSearchHits))) || syntaxTree(update.startState) !== syntaxTree(update.state)) this.decorations = liveDecorations(update.view);
  }
}, { decorations: plugin => plugin.decorations });
export interface EditorHandle {
  focus(): void; wrap(before: string, after?: string): void; insert(text: string): void;
  heading(level: number): void;
  selection(): { from: number; to: number; text: string } | null;
  replace(from: number, to: number, text: string): void; goTo(line: number): void;
  scrollToRatio(ratio: number): void;
  showSearch(matches: readonly { from: number; to: number }[], current: number, scroll?: boolean): void;
  revealLine(line: number): void;
  replaceMatches(matches: readonly SearchMatch[], expected: string): boolean;
  selectSearch(from: number, to: number): void;
}
interface Props { id: string; content: string; mode: string; dark: boolean; fontSize: number; onChange(text: string): void; onCursor(line: number, col: number, selected: number): void; onScroll?(ratio: number): void; onLink(href: string): void }
export const Editor = forwardRef<EditorHandle, Props>((props, ref) => {
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null), latest = useRef(props);
  const synchronizedTop = useRef<number | null>(null);
  latest.current = props;
  const appearance = useRef(new Compartment()), mode = useRef(new Compartment());
  const theme = (dark: boolean, size: number) => [EditorView.theme({ '&': { fontSize: `${size}px`, height: '100%' }, '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.95' }, '.cm-content': { caretColor: dark ? '#9bbdff' : '#2864e8' }, '.cm-cursor': { borderLeftColor: dark ? '#9bbdff' : '#2864e8' } }, { dark }), syntaxHighlighting(HighlightStyle.define([
    { tag: tags.heading, fontWeight: '600' }, { tag: tags.strong, fontWeight: '650' }, { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' }, { tag: tags.link, color: dark ? '#8db4ff' : '#2864e8' },
    { tag: tags.processingInstruction, color: dark ? '#879db9' : '#7b8da6' }, { tag: tags.comment, color: dark ? '#879db9' : '#7b8da6' },
    { tag: [tags.keyword, tags.operator], color: dark ? '#ba9dce' : '#885693' }, { tag: tags.string, color: dark ? '#9bcac3' : '#268074' },
    { tag: [tags.number, tags.bool], color: dark ? '#d2ac79' : '#ad743d' }, { tag: tags.function(tags.variableName), color: dark ? '#9dbfc7' : '#416e7c' }
  ]))];
  useImperativeHandle(ref, () => ({
    focus() { view.current?.focus(); },
    selectSearch(from, to) { const v = view.current; if (v) v.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: 'nearest' }) }); },
    showSearch(matches, current, scroll = false) {
      const v = view.current; if (!v) return;
      const effects = [setSearchHits.of({ matches, current })];
      const hit = matches[current];
      v.dispatch({ effects: [...effects, ...(scroll && hit ? [EditorView.scrollIntoView(hit.from, { y: 'center' })] : [])] });
    },
    revealLine(line) {
      const v = view.current; if (!v) return;
      const from = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines))).from;
      v.dispatch({ effects: EditorView.scrollIntoView(from, { y: 'center' }) });
    },
    replaceMatches(matches, expected) {
      const v = view.current; if (!v || !matches.length || v.state.doc.toString() !== expected) return false;
      v.dispatch({ changes: matches.map(({ from, to, insert }) => ({ from, to, insert })),
        selection: { anchor: matches[0].from + matches[0].insert.length },
        annotations: [isolateHistory.of('full'), Transaction.userEvent.of('input.replace')] });
      v.focus();
      return true;
    },
    heading(level) {
      const v = view.current; if (!v) return; const line = v.state.doc.lineAt(v.state.selection.main.head);
      const old = /^#{1,6}\s+/.exec(line.text)?.[0] ?? '', prefix = level > 0 ? '#'.repeat(level) + ' ' : '';
      v.dispatch({ changes: { from: line.from, to: line.from + old.length, insert: prefix }, selection: { anchor: line.from + prefix.length } }); v.focus();
    },
    wrap(before, after = before) {
      const v = view.current; if (!v) return; const s = v.state.selection.main, text = v.state.sliceDoc(s.from, s.to);
      v.dispatch({ changes: { from: s.from, to: s.to, insert: before + text + after }, selection: { anchor: s.from + before.length, head: s.from + before.length + text.length } }); v.focus();
    },
    insert(text) { const v = view.current; if (!v) return; const s = v.state.selection.main; v.dispatch({ changes: { from: s.from, to: s.to, insert: text }, selection: { anchor: s.from + text.length } }); v.focus(); },
    selection() { const v = view.current; if (!v) return null; const s = v.state.selection.main; return { from: s.from, to: s.to, text: v.state.sliceDoc(s.from, s.to) }; },
    replace(from, to, text) { const v = view.current; if (!v) return; v.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } }); v.focus(); },
    goTo(line) { const v = view.current; if (!v) return; const pos = v.state.doc.line(Math.min(line, v.state.doc.lines)).from; v.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 30 }) }); v.focus(); },
    scrollToRatio(ratio) {
      const element = view.current?.scrollDOM; if (!element) return;
      const top = Math.max(0, Math.min(1, ratio)) * Math.max(0, element.scrollHeight - element.clientHeight);
      synchronizedTop.current = top; element.scrollTop = top;
    }
  }), []);
  useEffect(() => {
    if (!host.current) return;
    const wrap = (delimiter: string) => (v: EditorView) => { const s = v.state.selection.main; v.dispatch({ changes: { from: s.from, to: s.to, insert: delimiter + v.state.sliceDoc(s.from, s.to) + delimiter }, selection: { anchor: s.from + delimiter.length, head: s.to + delimiter.length } }); return true; };
    const followLink = (v: EditorView, position: number) => {
      let node = syntaxTree(v.state).resolveInner(position, 1);
      while (!['Link', 'Autolink'].includes(node.name) && node.parent) node = node.parent;
      if (!['Link', 'Autolink'].includes(node.name)) return false;
      const href = markdownLink(v.state.doc.toString(), node.from, node.to);
      if (href === null) return false;
      latest.current.onLink(href); return true;
    };
    let pointerLink: { position: number; x: number; y: number; modified: boolean } | null = null;
    const extensions = [
      history(), drawSelection(), bracketMatching(), indentOnInput(), highlightSelectionMatches(), searchHits,
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      keymap.of([{ key: 'Mod-Enter', run: v => followLink(v, v.state.selection.main.head) }, { key: 'Mod-b', run: wrap('**') }, { key: 'Mod-i', run: wrap('*') }, ...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.lineWrapping, placeholder('从一个想法开始…'),
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown 编辑器', spellcheck: 'false' }),
      mode.current.of(props.mode === 'live' ? [livePreview] : [lineNumbers(), highlightActiveLine()]),
      appearance.current.of(theme(props.dark, props.fontSize)),
      EditorView.updateListener.of(update => {
        if (update.docChanged) latest.current.onChange(update.state.doc.toString());
        if (update.selectionSet || update.docChanged) { const s = update.state.selection.main, line = update.state.doc.lineAt(s.head); latest.current.onCursor(line.number, s.head - line.from + 1, s.to - s.from); }
      }),
      EditorView.domEventHandlers({ mousedown: (event, v) => {
        pointerLink = null;
        if (event.button !== 0 || event.shiftKey || event.altKey) return false;
        const modified = event.metaKey || event.ctrlKey;
        if (!modified && latest.current.mode !== 'live') return false;
        const position = v.posAtCoords({ x: event.clientX, y: event.clientY });
        if (position !== null) pointerLink = { position, x: event.clientX, y: event.clientY, modified };
        return false;
      }, mouseup: (event, v) => {
        // Live decorations can replace the clicked DOM node on focus. Remember
        // the source position on press, and follow only a click, never a drag.
        const candidate = pointerLink; pointerLink = null;
        if (!candidate || Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) > 4) return false;
        if (!candidate.modified && !v.state.selection.main.empty) return false;
        if (!followLink(v, candidate.position)) return false;
        event.preventDefault(); return true;
      }, scroll: (_event, v) => {
        const el = v.scrollDOM, expected = synchronizedTop.current; synchronizedTop.current = null;
        // Ignore the scroll event generated by the other pane; user scrolls still flow back.
        if (expected !== null && Math.abs(el.scrollTop - expected) < 1) return;
        latest.current.onScroll?.(el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight));
      } })
    ];
    let state = states.get(props.id);
    if (state) { if (state.doc.toString() !== props.content) state = state.update({ changes: { from: 0, to: state.doc.length, insert: props.content } }).state; state = state.update({ effects: [mode.current.reconfigure(props.mode === 'live' ? [livePreview] : [lineNumbers(), highlightActiveLine()]), appearance.current.reconfigure(theme(props.dark, props.fontSize))] }).state; }
    // Recreate extensions to bind fresh callbacks while retaining the document and undo history.
    if (state) {
      const json = state.toJSON({ history: historyField });
      state = EditorState.fromJSON(json, { extensions }, { history: historyField });
    } else state = EditorState.create({ doc: props.content, extensions });
    const v = new EditorView({ state, parent: host.current }); view.current = v;
    return () => { states.set(props.id, v.state); v.destroy(); view.current = null; synchronizedTop.current = null; };
  }, [props.id]);
  useEffect(() => { const v = view.current; if (v && v.state.doc.toString() !== props.content) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: props.content } }); }, [props.content]);
  useEffect(() => { view.current?.dispatch({ effects: mode.current.reconfigure(props.mode === 'live' ? [livePreview] : [lineNumbers(), highlightActiveLine()]) }); }, [props.mode]);
  useEffect(() => { view.current?.dispatch({ effects: appearance.current.reconfigure(theme(props.dark, props.fontSize)) }); }, [props.dark, props.fontSize]);
  return <div className={`editor-host ${props.mode === 'live' ? 'live-editor' : 'source-editor'}`} ref={host}/>;
});
import { historyField } from '@codemirror/commands';
