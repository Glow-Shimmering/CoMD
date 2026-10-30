import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import SearchBar, { type SearchBarHandle, type SearchOptions, type SearchScope } from './SearchBar';
import { runSearch, cancelSearch } from './searchClient';
import { indexRenderedText, paintPreviewMatches, clearPreviewMatches, type RenderedTextIndex } from './searchPreview';
import type { SearchResult } from './searchEngine';
import type { EditorHandle } from './Editor';
import type { DocumentState, Preferences } from './types';

interface Props {
  document: DocumentState | undefined;
  mode: Preferences['mode'];
  rendered: string;
  editor: RefObject<EditorHandle | null>;
  preview: RefObject<HTMLDivElement | null>;
  onMode(mode: Preferences['mode']): void;
  paused: boolean;
}
type Position = { from: number; to: number };
type Frame = { key: string; content: string; result: SearchResult; preview: RenderedTextIndex | null; sourcePositions: Position[]; previewPositions: Position[] };
type Anchor = { id: string; source: number; text: number };
const defaults: SearchOptions = { query: '', caseSensitive: false, wholeWord: false, regexp: false };
const empty: SearchResult = { matches: [], error: null, limited: false };

export function useDocumentSearch(props: Props) {
  const [opened, setOpened] = useState(false), [options, setOptions] = useState(defaults);
  const [replacement, setReplacement] = useState(''), [replaceOpen, setReplaceOpen] = useState(false);
  const [splitScope, setSplitScope] = useState<SearchScope>('text');
  const [frame, setFrame] = useState<Frame | null>(null), [current, setCurrent] = useState(0);
  const [notice, setNotice] = useState('');
  const bar = useRef<SearchBarHandle>(null), restoreFocus = useRef<HTMLElement | null>(null);
  const anchor = useRef<Anchor | null>(null), syncUntil = useRef(0);
  const latest = useRef(props); latest.current = props;
  const scope: SearchScope = props.mode === 'read' ? 'text' : props.mode === 'split' ? splitScope : 'source';
  const content = props.document?.content ?? '', id = props.document?.id ?? '';
  const key = JSON.stringify([id, props.mode, scope, options, replacement, replaceOpen]);
  const valid = opened && frame?.key === key && frame.content === content;
  const result = valid ? frame.result : empty;
  const lineStarts = useMemo(() => [0, ...[...content.matchAll(/\n/g)].map(match => match.index! + 1)], [content]);
  const lineAt = (offset: number) => {
    let low = 0, high = lineStarts.length;
    while (low < high) { const mid = (low + high) >>> 1; if (lineStarts[mid] <= offset) low = mid + 1; else high = mid; }
    return Math.max(1, low);
  };
  const lineOffset = (line: number) => lineStarts[Math.min(lineStarts.length - 1, Math.max(0, line - 1))];

  function open() {
    if (props.paused || !props.document) return;
    if (!opened) {
      restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      let selected = '';
      const previewSelection = window.getSelection();
      if (previewSelection?.anchorNode && previewSelection.focusNode &&
          props.preview.current?.contains(previewSelection.anchorNode) && props.preview.current.contains(previewSelection.focusNode)) {
        selected = previewSelection.toString();
        if (selected) anchor.current = null;
      }
      if (!selected && props.mode !== 'read') {
        const selection = props.editor.current?.selection(); selected = selection?.text ?? '';
        anchor.current = { id, source: selection?.from ?? 0, text: 0 };
      }
      if (selected && selected.length <= 1000 && !/[\r\n]/.test(selected)) setOptions(previous => ({ ...previous, query: selected, regexp: false }));
      setNotice(''); setOpened(true);
    } else bar.current?.focus();
  }
  function close() {
    const position = valid ? frame.sourcePositions[current] : null;
    if (position && props.mode !== 'read' && position.to > position.from) props.editor.current?.selectSearch(position.from, position.to);
    else if (valid && props.mode !== 'read' && anchor.current?.id === id) props.editor.current?.selectSearch(anchor.current.source, anchor.current.source);
    setOpened(false); cancelSearch(); clearPreviewMatches(); props.editor.current?.showSearch([], -1);
    requestAnimationFrame(() => {
      // Return to the document instead of a hidden format/search button.
      const target = restoreFocus.current;
      if (target?.isConnected && !target.closest('.document-search') && target.closest('.document-body')) target.focus({ preventScroll: true });
      else if (latest.current.mode === 'read') latest.current.preview.current?.focus({ preventScroll: true });
      else latest.current.editor.current?.focus();
    });
  }
  function changeOptions(next: Partial<SearchOptions>) {
    anchor.current = null; setCurrent(0); setNotice(''); setOptions(previous => ({ ...previous, ...next }));
  }
  function navigate(direction: 1 | -1) {
    if (!result.matches.length) return;
    const next = current + direction;
    setNotice(next >= result.matches.length ? '已回到第一处' : next < 0 ? '已回到最后一处' : '');
    setCurrent((next + result.matches.length) % result.matches.length);
    // A one-result search also needs to reveal the same result again.
    if (result.matches.length === 1) setFrame(previous => previous && { ...previous });
  }
  function toggleReplace() {
    const sourcePosition = valid ? frame.sourcePositions[current] : null;
    if (!replaceOpen && props.mode === 'split' && scope === 'text' && result.matches[current] &&
        !(sourcePosition && sourcePosition.to > sourcePosition.from)) {
      setNotice('这处正文包含格式转换，无法直接替换。请切换到源码范围，核对高亮后再替换。'); return;
    }
    if (!replaceOpen && props.mode === 'split' && scope === 'text') {
      setSplitScope('source'); setNotice('替换作用于源码，可一次撤销。');
    }
    setReplaceOpen(value => !value);
  }
  function replace(all: boolean) {
    if (props.mode === 'read' || scope !== 'source' || !valid || result.error || (all && result.limited)) return;
    const matches = all ? result.matches : result.matches.slice(current, current + 1);
    if (!matches.length) return;
    const applied = props.editor.current?.replaceMatches(matches, content);
    if (!applied) { setNotice('文档已变化，请等待搜索结果刷新后重试。'); return; }
    anchor.current = { id, source: matches[0].from + matches[0].insert.length, text: 0 };
    setNotice(`已替换 ${matches.length} 处，可用 ${window.comd?.platform === 'darwin' ? '⌘Z' : 'Ctrl+Z'} 撤销。`);
  }

  useEffect(() => {
    let canceled = false;
    props.editor.current?.showSearch([], -1); clearPreviewMatches();
    if (!opened || !id || !options.query) { setFrame(null); cancelSearch(); return; }
    const timer = setTimeout(() => {
      const article = props.preview.current?.querySelector<HTMLElement>('.prose');
      const preview = article ? indexRenderedText(article) : null;
      const text = scope === 'text' ? preview?.text ?? '' : content;
      void (async () => {
        const result = await runSearch(text, options, scope === 'source' && replaceOpen ? replacement : '', scope === 'source');
        if (canceled) return;
        const other = preview && !result.error ? await runSearch(scope === 'source' ? preview.text : content, options, '', scope !== 'source') : empty;
        if (canceled) return;
        const sourceResult = scope === 'source' ? result : other, textResult = scope === 'text' ? result : other;
        const sourcePositions: Position[] = result.matches.map(() => ({ from: 0, to: 0 }));
        const previewPositions: Position[] = result.matches.map(() => ({ from: 0, to: 0 }));
        if (scope === 'source') sourcePositions.splice(0, sourcePositions.length, ...result.matches);
        else previewPositions.splice(0, previewPositions.length, ...result.matches);
        // Pair occurrences once per query, in source order within a line. If
        // hidden markup creates extra matches, fall back to the source block
        // rather than falsely highlighting a different rendered occurrence.
        if (preview && !other.error && !other.limited && !result.limited) {
          const groups = new Map<string, { source: number[]; text: number[] }>();
          const groupKey = (line: number, value: string) => JSON.stringify([line, options.caseSensitive ? value : value.toLowerCase()]);
          sourceResult.matches.forEach((match, i) => {
            if (match.visible !== true) return;
            const k = groupKey(lineAt(match.from), content.slice(match.from, match.to));
            const group = groups.get(k) ?? { source: [], text: [] }; group.source.push(i); groups.set(k, group);
          });
          textResult.matches.forEach((match, i) => {
            const k = groupKey(preview.lineAt(match.from), preview.text.slice(match.from, match.to));
            const group = groups.get(k) ?? { source: [], text: [] }; group.text.push(i); groups.set(k, group);
          });
          for (const group of groups.values()) if (group.source.length === group.text.length) group.source.forEach((s, n) => {
            const t = group.text[n];
            if (scope === 'source') previewPositions[s] = textResult.matches[t];
            else sourcePositions[t] = sourceResult.matches[s];
          });
        }
        const saved = anchor.current?.id === id ? anchor.current : null;
        const offset = scope === 'source' ? saved?.source ?? 0 : saved?.text || (saved && preview ? preview.offsetAtLine(lineAt(saved.source)) : 0);
        const selected = result.matches.findIndex(match => match.from >= offset);
        setCurrent(selected < 0 ? 0 : selected);
        setFrame({ key, content, result, preview, sourcePositions, previewPositions });
      })();
    }, 80);
    return () => { canceled = true; clearTimeout(timer); cancelSearch(); };
  }, [opened, key, content, props.rendered, replaceOpen]);

  useEffect(() => {
    if (!valid) return;
    const hit = result.matches[current];
    const index = frame.preview;
    if (!hit) { clearPreviewMatches(); props.editor.current?.showSearch([], -1); return; }
    syncUntil.current = performance.now() + 350;
    let range: Range | null = null;
    let element: HTMLElement | null = null;
    if (scope === 'source') {
      props.editor.current?.showSearch(result.matches, current, true);
      const line = lineAt(hit.from);
      const projected = frame.previewPositions[current];
      anchor.current = { id, source: hit.from, text: projected?.to > projected?.from ? projected.from : index?.offsetAtLine(line) ?? 0 };
      if (index) {
        range = paintPreviewMatches(index, frame.previewPositions, current);
        element = index.elementAtLine(line);
      }
    } else if (index) {
      range = paintPreviewMatches(index, result.matches, current);
      const line = index.lineAt(hit.from), projected = frame.sourcePositions[current];
      const source = projected?.to > projected?.from ? projected.from : lineOffset(line);
      anchor.current = { id, source, text: hit.from };
      props.editor.current?.showSearch(frame.sourcePositions, current, projected?.to > projected?.from);
      if (!(projected?.to > projected?.from)) props.editor.current?.revealLine(line);
      element = index.elementAtLine(line);
    }
    const parent = range?.startContainer.parentElement ?? element;
    for (let details = parent?.closest('details'); details; details = details.parentElement?.closest('details')) details.open = true;
    // CodeMirror measures asynchronously. Keep ratio sync suspended while both
    // panes independently reveal the same source block.
    const raf = requestAnimationFrame(() => {
      const pane = props.preview.current;
      if (!pane) return;
      const rect = range?.getBoundingClientRect() ?? element?.getBoundingClientRect();
      if (rect) pane.scrollTop = pane.scrollTop + rect.top - pane.getBoundingClientRect().top - pane.clientHeight / 3;
    });
    return () => cancelAnimationFrame(raf);
  }, [frame, current, valid]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (props.paused || event.isComposing || event.defaultPrevented) return;
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault(); open();
      } else if (opened && event.key === 'Escape') { event.preventDefault(); close(); }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  });
  useEffect(() => () => { cancelSearch(); clearPreviewMatches(); }, []);
  useEffect(() => { if (props.mode === 'split' && scope === 'text') setReplaceOpen(false); }, [props.mode, scope]);

  return {
    opened, open, syncUntil,
    bar: opened && props.document ? <SearchBar ref={bar} options={options} replacement={replacement} scope={scope}
      showScope={props.mode === 'split'} replaceOpen={replaceOpen} readOnly={props.mode === 'read'}
      count={result.matches.length} current={result.matches.length ? current + 1 : 0} error={result.error} limited={result.limited}
      notice={!valid && options.query ? '正在查找…' : notice || (props.mode === 'live' ? '搜索 Markdown 源码，包括格式标记。' : props.mode === 'split' && scope === 'text' ? '搜索正文；源码同步定位到对应段落。' : '')}
      onOptions={changeOptions} onReplacement={setReplacement}
      onScope={value => { setSplitScope(value); if (value === 'text') setReplaceOpen(false); setNotice(''); }}
      onToggleReplace={toggleReplace} onNavigate={navigate} onReplace={() => replace(false)} onReplaceAll={() => replace(true)}
      onEdit={() => { props.onMode('source'); setNotice('已切换到源码，请核对高亮位置后再替换；修改可撤销。'); }} onClose={close}/> : null
  };
}
