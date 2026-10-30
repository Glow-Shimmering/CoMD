import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CaseSensitive, ChevronDown, ChevronRight, ChevronUp, MoreHorizontal, Search, X } from 'lucide-react';
import './search.css';

export type SearchOptions = { query: string; caseSensitive: boolean; wholeWord: boolean; regexp: boolean };
export type SearchScope = 'text' | 'source';
export type SearchBarHandle = { focus(): void };

export type SearchBarProps = {
  options: SearchOptions;
  replacement: string;
  scope: SearchScope;
  showScope: boolean;
  replaceOpen: boolean;
  readOnly: boolean;
  count: number;
  current: number;
  error: string | null;
  notice: string;
  limited: boolean;
  onOptions(next: Partial<SearchOptions>): void;
  onReplacement(text: string): void;
  onScope(scope: SearchScope): void;
  onToggleReplace(): void;
  onNavigate(direction: 1 | -1): void;
  onReplace(): void;
  onReplaceAll(): void;
  onEdit(): void;
  onClose(): void;
};

const SearchBar = forwardRef<SearchBarHandle, SearchBarProps>(function SearchBar(props, ref) {
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const focus = () => { input.current?.focus(); input.current?.select(); };

  useImperativeHandle(ref, () => ({ focus }), []);
  useEffect(() => { focus(); }, []);
  useEffect(() => {
    if (!moreOpen) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [moreOpen]);

  const hasQuery = props.options.query.length > 0;
  const canNavigate = hasQuery && !props.error && props.count > 0;
  const status = props.error || (!hasQuery ? '输入关键词查找' : props.count === 0
    ? '无匹配结果' : `${props.current} / ${props.count}${props.limited ? '+' : ''}`);

  return <div ref={root} className="document-search" role="search" aria-label="文档搜索" onKeyDown={event => {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    if (moreOpen) { setMoreOpen(false); input.current?.focus(); }
    else props.onClose();
  }}>
    <div className="document-search-row">
      <button type="button" className="document-search-icon" aria-label={props.replaceOpen ? '收起替换' : '展开替换'}
        aria-expanded={props.replaceOpen} onClick={props.onToggleReplace} title={props.replaceOpen ? '收起替换' : '展开替换'}>
        {props.replaceOpen ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
      </button>
      <label className="document-search-field">
        <Search size={15} aria-hidden="true"/>
        <input ref={input} aria-label="查找内容" placeholder="查找文档中的文字…" value={props.options.query}
          onChange={event => props.onOptions({ query: event.target.value })}
          onKeyDown={event => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault(); event.stopPropagation();
            if (canNavigate) props.onNavigate(event.shiftKey ? -1 : 1);
          }}/>
      </label>
      {props.showScope && <select className="document-search-scope" aria-label="搜索范围" value={props.scope}
        onChange={event => props.onScope(event.target.value as SearchScope)}>
        <option value="text">正文</option><option value="source">源码</option>
      </select>}
      <span className={`document-search-status${props.error ? ' is-error' : ''}`} aria-live="polite" aria-atomic="true">{status}</span>
      <button type="button" className="document-search-icon" aria-label="上一处" title="上一处 (Shift+Enter)"
        disabled={!canNavigate} onClick={() => props.onNavigate(-1)}><ChevronUp size={16}/></button>
      <button type="button" className="document-search-icon" aria-label="下一处" title="下一处 (Enter)"
        disabled={!canNavigate} onClick={() => props.onNavigate(1)}><ChevronDown size={16}/></button>
      <span className="document-search-divider" aria-hidden="true"/>
      <button type="button" className={`document-search-icon${props.options.caseSensitive ? ' is-active' : ''}`}
        aria-label="区分大小写" aria-pressed={props.options.caseSensitive} title="区分大小写"
        onClick={() => props.onOptions({ caseSensitive: !props.options.caseSensitive })}><CaseSensitive size={17}/></button>
      <div className="document-search-more">
        <button type="button" className={`document-search-icon${moreOpen ? ' is-active' : ''}`} aria-label="更多搜索选项"
          aria-expanded={moreOpen} aria-controls="document-search-options" title="更多搜索选项"
          onClick={() => setMoreOpen(open => !open)}><MoreHorizontal size={17}/></button>
        {moreOpen && <div id="document-search-options" className="document-search-options">
          <label><input type="checkbox" checked={props.options.wholeWord}
            onChange={event => props.onOptions({ wholeWord: event.target.checked })}/>全词匹配</label>
          <label><input type="checkbox" checked={props.options.regexp}
            onChange={event => props.onOptions({ regexp: event.target.checked })}/>正则表达式</label>
        </div>}
      </div>
      <button type="button" className="document-search-icon" aria-label="关闭搜索" title="关闭搜索 (Esc)"
        onClick={props.onClose}><X size={16}/></button>
    </div>
    {props.replaceOpen && <div className="document-search-replace">
      {props.readOnly ? <><span>阅读模式仅支持查找。</span><button type="button" className="document-search-action" onClick={props.onEdit}>切换到源码替换</button></>
        : <><label className="document-search-field document-search-replacement"><span aria-hidden="true">替换</span>
          <input aria-label="替换为" placeholder="替换为…" value={props.replacement} onChange={event => props.onReplacement(event.target.value)}/></label>
          <button type="button" className="document-search-action" disabled={!canNavigate} onClick={props.onReplace}>替换</button>
          <button type="button" className="document-search-action" disabled={!canNavigate || props.limited} onClick={props.onReplaceAll}>全部替换 ({props.count})</button>
          {props.limited && <span className="document-search-limit">匹配过多，无法全部替换</span>}
        </>}
    </div>}
    {props.notice && <div className="document-search-notice" role="status">{props.notice}</div>}
  </div>;
});

export default SearchBar;
