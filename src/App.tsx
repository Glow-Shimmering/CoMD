import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, History, FileText, Plus, FolderOpen, PanelLeftClose, PanelLeftOpen, Search, Settings, Sun, Moon, MoreHorizontal, Check, X, Columns2, Code2, Eye, PenLine, Bold, Italic, Link, List, Quote, Braces, Sparkles, ArrowRight, ChevronDown, Focus, Download, Save, Circle, LoaderCircle, AlertTriangle, CornerDownLeft, ChevronRight } from 'lucide-react';
import BrandMark from './BrandMark';
import Outline from './Outline';
import FileTree from './FileTree';
import RecentPicker from './RecentPicker';
import UpdateSettings from './UpdateSettings';
import { useDocumentSearch } from './useDocumentSearch';
import { Editor, forgetEditor, type EditorHandle } from './Editor';
import { renderMarkdown, headings, exportHTML, findAnchor } from './markdown';
import { welcome, guide } from './welcome';
import { unwrap, type DocumentState, type Preferences, type AIConfig, type Folder, type RecentItem, type UpdateState } from './types';

const noCollapsedHeadings: ReadonlySet<string> = new Set();
const initialPreferences: Preferences = { theme: 'light', mode: 'live', fontSize: 16, autosave: true, sidebar: true, autoCheckUpdates: true };
const createDoc = (content = '', title = '未命名.md'): DocumentState => ({ id: crypto.randomUUID(), path: null, title, content, savedContent: '' });
const modes = [{ id: 'live', label: '实时', icon: PenLine }, { id: 'source', label: '源码', icon: Code2 }, { id: 'split', label: '双栏', icon: Columns2 }, { id: 'read', label: '阅读', icon: Eye }] as const;
function IconButton({ title, children, onClick, className = '', disabled = false }: { title: string; children: ReactNode; onClick(): void; className?: string; disabled?: boolean }) { return <button type="button" title={title} aria-label={title} disabled={disabled} className={`icon-button ${className}`} onClick={onClick}>{children}</button>; }
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose(): void }) {
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-title"><h2>{title}</h2><IconButton title="关闭" onClick={onClose}><X size={18}/></IconButton></div>{children}</section></div>;
}
export default function App() {
  const [docs, setDocs] = useState<DocumentState[]>([]), [activeId, setActiveId] = useState('');
  const [preferences, setPreferences] = useState<Preferences>(initialPreferences), [ready, setReady] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'files' | 'outline'>('files');
  const [folder, setFolder] = useState<Folder | null>(null), [folderRevision, setFolderRevision] = useState(0);
  const synchronizedPreviewTop = useRef<number | null>(null);
  const [navigation, setNavigation] = useState<{ id: string; fragment: string } | null>(null);
  const [collapsedOutlines, setCollapsedOutlines] = useState<Record<string, ReadonlySet<string>>>({});
  const [toast, setToast] = useState(''), [saving, setSaving] = useState<string[]>([]), [menu, setMenu] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1, selected: 0 }), [focus, setFocus] = useState(false);
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  const [showSettings, setShowSettings] = useState(false), [settingsTab, setSettingsTab] = useState<'editor' | 'ai' | 'updates'>('editor');
  const [update, setUpdate] = useState<UpdateState | null>(null), [version, setVersion] = useState('');
  const [aiConfig, setAIConfig] = useState<AIConfig>({ endpoint: 'https://api.openai.com/v1', model: '' });
  const [settingsBusy, setSettingsBusy] = useState(false), [closeTarget, setCloseTarget] = useState<string | null>(null);
  const [ai, setAI] = useState<{ id: string; from: number; to: number; original: string; instruction: string; result?: string; busy: boolean; error?: string } | null>(null);
  const editor = useRef<EditorHandle>(null), preview = useRef<HTMLDivElement>(null), state = useRef({ docs, activeId, preferences });
  const inFlight = useRef(new Map<string, Promise<boolean>>());
  state.current = { docs, activeId, preferences };
  const active = docs.find(doc => doc.id === activeId) ?? docs[0];
  const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark);
  const outline = useMemo(() => headings(active?.content ?? ''), [active?.content]);
  const toggleOutline = (key: string) => {
    if (!active) return;
    setCollapsedOutlines(previous => {
      const next = new Set(previous[active.id]);
      if (next.has(key)) next.delete(key); else next.add(key);
      return { ...previous, [active.id]: next };
    });
  };
  const rendered = useMemo(() => renderMarkdown(active?.content ?? '', active?.id ?? ''), [active?.content, active?.id]);
  const mac = window.comd?.platform === 'darwin', mod = mac ? '⌘' : 'Ctrl';
  const notify = (message: string) => setToast(message);
  const fail = (error: unknown) => notify(error instanceof Error ? error.message : String(error));
  const checkUpdates = () => { void unwrap(window.comd.checkUpdates()).then(setUpdate).catch(fail); };
  const openUpdates = () => { setSettingsTab('updates'); setShowSettings(true); };
  const changePreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPreferences(previous => ({ ...previous, [key]: value }));
  const updateDoc = (id: string, patch: Partial<DocumentState> | ((doc: DocumentState) => Partial<DocumentState>)) => setDocs(previous => previous.map(doc => doc.id === id ? { ...doc, ...(typeof patch === 'function' ? patch(doc) : patch) } : doc));
  const addDoc = (doc: DocumentState) => { setDocs(previous => previous.some(item => item.id === doc.id) ? previous : [...previous, doc]); setActiveId(doc.id); };
  const persist = async () => { await unwrap(window.comd.persist(state.current)); };
  async function saveDoc(id: string, saveAs = false, force = false): Promise<boolean> {
    const pending = inFlight.current.get(id); if (pending) return pending;
    const doc = state.current.docs.find(item => item.id === id); if (!doc) return false;
    const operation = (async () => {
      setSaving(previous => [...previous, id]);
      try {
        const result = await unwrap(window.comd.save(id, doc.content, saveAs, force));
        if (result.canceled) return false;
        if (result.conflict) { updateDoc(id, { conflict: { disk: result.disk ?? null }, error: undefined }); return false; }
        updateDoc(id, current => ({ ...result, content: current.content, savedContent: doc.content, conflict: undefined, error: undefined }));
        setFolderRevision(value => value + 1);
        return true;
      } catch (error) { updateDoc(id, { error: error instanceof Error ? error.message : String(error) }); fail(error); return false; }
      finally { inFlight.current.delete(id); setSaving(previous => previous.filter(value => value !== id)); }
    })();
    inFlight.current.set(id, operation); return operation;
  }
  async function open() { try { (await unwrap(window.comd.open())).forEach(addDoc); } catch (error) { fail(error); } }
  async function openLink(href: string) {
    if (!active) return;
    const id = active.id;
    try {
      const result = await unwrap(window.comd.openLink(id, href));
      if (result.kind === 'document') {
        addDoc(result.document);
        setNavigation({ id: result.document.id, fragment: result.fragment });
      } else if (result.kind === 'anchor') setNavigation({ id, fragment: result.fragment });
    } catch (error) { fail(error); }
  }
  function activateFolder(next: Folder) { setFolder(next); setFolderRevision(value => value + 1); setSidebarTab('files'); changePreference('sidebar', true); setFocus(false); }
  async function openFolder() {
    try { const next = await unwrap(window.comd.openFolder()); if (next) activateFolder(next); } catch (error) { fail(error); }
  }
  async function closeFolder() { try { await unwrap(window.comd.closeFolder()); setFolder(null); } catch (error) { fail(error); } }
  async function openFolderFile(file: string) { try { addDoc(await unwrap(window.comd.openFolderFile(file))); } catch (error) { fail(error); } }
  async function openRecent(item: RecentItem) {
    if (item.kind === 'folder') activateFolder(await unwrap(window.comd.openRecentFolder(item.path)));
    else addDoc(await unwrap(window.comd.openRecent(item.path)));
    setShowRecent(false);
  }
  async function reloadDoc(id: string) { try { updateDoc(id, { ...await unwrap(window.comd.reload(id)), conflict: undefined, error: undefined }); } catch (error) { fail(error); } }
  async function removeDoc(id: string) {
    if (inFlight.current.has(id)) await inFlight.current.get(id);
    const current = state.current;
    const remaining = current.docs.filter(doc => doc.id !== id);
    const nextId = current.activeId === id ? remaining[Math.max(0, current.docs.findIndex(doc => doc.id === id) - 1)]?.id ?? '' : current.activeId;
    setDocs(remaining); setActiveId(nextId); setCloseTarget(null); forgetEditor(id);
    setCollapsedOutlines(previous => { const next = { ...previous }; delete next[id]; return next; });
    try {
      await unwrap(window.comd.persist({ docs: remaining, activeId: nextId, preferences: current.preferences }));
      await unwrap(window.comd.closeDoc(id));
    } catch (error) { fail(error); }
  }
  function requestClose(id: string) { const doc = state.current.docs.find(item => item.id === id); if (doc && doc.content !== doc.savedContent) setCloseTarget(id); else void removeDoc(id); }
  async function exportDocument(kind: string) {
    setMenu(false); const doc = state.current.docs.find(item => item.id === state.current.activeId); if (!doc) return;
    notify('正在准备导出…');
    try { const result = await exportHTML(doc.content, doc.id, doc.title); const saved = await unwrap(window.comd.exportFile(kind, result.html, doc.title)); if (saved) notify(result.missing ? `已导出；${result.missing} 张图片未能嵌入，请检查图片来源。` : `已导出 ${kind.toUpperCase()}`); else setToast(''); } catch (error) { fail(error); }
  }
  function startAI() {
    const selection = editor.current?.selection();
    if (!selection?.text.trim() || !active) { notify('请先在编辑器里选中要修改的文字。'); return; }
    setAI({ id: active.id, ...selection, original: selection.text, instruction: '', busy: false });
  }
  async function runAI() {
    if (!ai || !ai.instruction.trim()) return;
    const request = ai; setAI(previous => previous ? { ...previous, busy: true, error: undefined } : null);
    try { const result = await unwrap(window.comd.rewrite(request.original, request.instruction)); setAI(previous => previous ? { ...previous, result, busy: false } : null); }
    catch (error) { setAI(previous => previous ? { ...previous, busy: false, error: error instanceof Error ? error.message : String(error) } : null); }
  }
  function acceptAI() {
    if (!ai?.result) return;
    const doc = state.current.docs.find(item => item.id === ai.id);
    if (!doc || doc.content.slice(ai.from, ai.to) !== ai.original) { notify('原文已经发生变化，请重新选择文字生成修改。'); return; }
    if (activeId === ai.id && editor.current) editor.current.replace(ai.from, ai.to, ai.result);
    else updateDoc(ai.id, { content: doc.content.slice(0, ai.from) + ai.result + doc.content.slice(ai.to), error: undefined });
    setAI(null); notify('已应用修改，可用撤销恢复。');
  }
  const documentSearch = useDocumentSearch({ document: active, mode: preferences.mode, rendered, editor, preview,
    onMode: mode => changePreference('mode', mode), paused: showSettings || showRecent || !!ai || !!closeTarget });
  const actions = useRef<(action: string) => void>(() => {});
  actions.current = action => {
    const id = state.current.activeId;
    switch (action) {
      case 'new': addDoc(createDoc()); break; case 'open': void open(); break; case 'openFolder': void openFolder(); break;
      case 'save': if (id) void saveDoc(id); break; case 'saveAs': if (id) void saveDoc(id, true); break;
      case 'close': if (id) requestClose(id); break; case 'find': documentSearch.open(); break;
      case 'focus': setFocus(value => !value); break;
      case 'theme': changePreference('theme', dark ? 'light' : 'dark'); break;
      case 'settings': setShowSettings(true); break;
      case 'updates': openUpdates(); checkUpdates(); break;
      case 'pdf': case 'html': void exportDocument(action); break;
      case 'guide': addDoc(createDoc(guide, '使用指南.md')); break;
    }
  };
  useEffect(() => {
    if (!window.comd) { notify('请通过 CoMD 桌面应用打开此界面。'); return; }
    unwrap(window.comd.bootstrap()).then(data => {
      const initial = data.docs.length ? data.docs : [createDoc(welcome, '欢迎使用 CoMD.md')];
      setDocs(initial); setActiveId(data.activeId || initial[0].id); setFolder(data.folder ?? null); setPreferences({ ...initialPreferences, ...data.preferences }); setVersion(data.version); setReady(true);
    }).catch(fail);
    const offAction = window.comd.onAction(action => actions.current(action));
    const offUpdate = window.comd.onUpdate(setUpdate);
    unwrap(window.comd.updateStatus()).then(setUpdate).catch(fail);
    const offOpened = window.comd.onOpened(addDoc);
    const offDisk = window.comd.onDisk(event => {
      const doc = state.current.docs.find(item => item.id === event.id); if (!doc || event.content === doc.savedContent) return;
      if (doc.content === doc.savedContent && event.content !== null && !inFlight.current.has(doc.id)) void reloadDoc(doc.id);
      else if (event.content !== doc.content) updateDoc(doc.id, { conflict: { disk: event.content } });
    });
    const offClose = window.comd.onClosing(() => {
      // A durable workspace snapshot preserves even unsaved/conflicted documents on next launch.
      Promise.allSettled([...inFlight.current.values()]).then(persist).then(() => window.comd.readyToClose()).catch(error => { fail(error); notify('草稿保存失败，暂未关闭窗口。请将文档另存为后重试。'); });
    });
    return () => { offAction(); offUpdate(); offOpened(); offDisk(); offClose(); };
  }, []);
  useEffect(() => { const query = matchMedia('(prefers-color-scheme: dark)'); const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches); query.addEventListener('change', listener); return () => query.removeEventListener('change', listener); }, []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 5500); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => { if (!ready) return; const timer = setTimeout(() => void persist().catch(fail), 400); return () => clearTimeout(timer); }, [docs, activeId, preferences, ready]);
  useEffect(() => {
    if (!ready || !preferences.autosave) return;
    const timer = setTimeout(() => { for (const doc of state.current.docs) if (doc.path && doc.content !== doc.savedContent && !doc.conflict && !doc.error) void saveDoc(doc.id); }, 1100);
    return () => clearTimeout(timer);
  }, [docs, preferences.autosave, ready]);
  useEffect(() => { if (showSettings) unwrap(window.comd.aiSettings()).then(setAIConfig).catch(fail); }, [showSettings]);
  useEffect(() => { setCursor({ line: 1, col: 1, selected: 0 }); }, [activeId]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); setShowRecent(false); if (!ai?.busy) setAI(null); setShowSettings(false); setCloseTarget(null); } };
    window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener);
  }, [ai?.busy]);
  useEffect(() => { synchronizedPreviewTop.current = null; }, [activeId, preferences.mode]);
  useEffect(() => {
    if (!navigation || active?.id !== navigation.id) return;
    const frame = requestAnimationFrame(() => {
      const template = document.createElement('template'); template.innerHTML = rendered;
      const target = findAnchor(preview.current ?? template.content, navigation.fragment);
      if (!target && navigation.fragment && navigation.fragment !== 'top') notify('未找到链接中的位置：' + navigation.fragment);
      const line = Number(target?.getAttribute('data-comd-line')) || 1;
      if (preview.current) {
        for (let details = target?.closest('details'); details; details = details.parentElement?.closest('details')) details.open = true;
        const container = preview.current;
        const top = target && target.getAttribute('data-comd-line') !== '1' ? target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop : 0;
        synchronizedPreviewTop.current = Math.max(0, Math.min(top, container.scrollHeight - container.clientHeight));
        if (preferences.mode === 'split') editor.current?.scrollToRatio(synchronizedPreviewTop.current / Math.max(1, container.scrollHeight - container.clientHeight));
        container.scrollTop = top;
      } else editor.current?.goTo(line);
      setNavigation(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [navigation, active?.id, rendered, preferences.mode]);
  const scrollFromEditor = (ratio: number) => {
    if (performance.now() < documentSearch.syncUntil.current) return;
    if (preferences.mode !== 'split' || !preview.current) return;
    const element = preview.current, top = ratio * Math.max(0, element.scrollHeight - element.clientHeight);
    synchronizedPreviewTop.current = top; element.scrollTop = top;
  };
  const scrollFromPreview = () => {
    if (performance.now() < documentSearch.syncUntil.current) return;
    if (preferences.mode !== 'split' || !preview.current) return;
    const element = preview.current, expected = synchronizedPreviewTop.current; synchronizedPreviewTop.current = null;
    if (expected !== null && Math.abs(element.scrollTop - expected) < 1) return;
    editor.current?.scrollToRatio(element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight));
  };
  const jumpTo = (line: number) => { if (preferences.mode === 'read') preview.current?.querySelector(`[data-comd-line="${line}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); else editor.current?.goTo(line); };
  const wordCount = (active?.content.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+/gu) ?? []).length;
  const dirty = active && active.content !== active.savedContent;

  return <div className={`app ${mac ? 'mac' : 'windows'} ${focus ? 'is-focus' : ''}`}>
    <header className="titlebar"><div className="window-space"/><div className="titlebar-brand"><BrandMark className="tiny-logo"/> CoMD <span className="version">/</span><span className="titlebar-caption">Markdown 编辑器</span></div><div className="titlebar-right">{update?.status === 'available' && <button className="update-indicator" onClick={openUpdates}><Download size={13}/>发现新版本</button>}<span className="local-dot"/> 本地工作区<IconButton title="设置" onClick={() => setShowSettings(true)}><Settings size={15}/></IconButton></div></header>
    <div className="workspace">
      {preferences.sidebar && !focus && <aside className="sidebar">
        <div className="sidebar-brand"><BrandMark className="brand-symbol"/><div><strong>CoMD</strong><span>专注文字，自在表达。</span></div></div>
        <button className="new-document" onClick={() => addDoc(createDoc())}><Plus size={17}/><span>新建文档</span><kbd>{mod} N</kbd></button>
        <button className="open-document" onClick={() => void open()}><FileText size={16}/><span>打开文件</span><kbd>{mod} O</kbd></button>
        <button className="open-document open-folder" onClick={() => void openFolder()}><FolderOpen size={16}/><span>打开文件夹</span><kbd>{mod} ⇧ O</kbd></button>
        <button className="open-document open-recent" onClick={() => setShowRecent(true)}><History size={16}/><span>最近打开</span><ChevronRight size={14} className="recent-trigger-chevron"/></button>
        <div className="sidebar-switch"><button aria-pressed={sidebarTab === 'files'} className={sidebarTab === 'files' ? 'selected' : ''} onClick={() => setSidebarTab('files')}>文件</button><button aria-pressed={sidebarTab === 'outline'} className={sidebarTab === 'outline' ? 'selected' : ''} onClick={() => setSidebarTab('outline')}>大纲 <span>{outline.length}</span></button></div>
        <div className="sidebar-content">
          <div hidden={sidebarTab !== 'files'}>
            {folder ? <FileTree key={folder.path} folder={folder} activePath={active?.path ?? null} docs={docs} onOpen={file => void openFolderFile(file)} onClose={() => void closeFolder()} revision={folderRevision}/> : <p className="folder-hint">打开文件夹，在这里浏览文档。</p>}
          </div>
          {sidebarTab === 'outline' && <>
            <div className="section-label">文档结构</div>
            {outline.length ? <Outline headings={outline} collapsed={collapsedOutlines[active?.id ?? ''] ?? noCollapsedHeadings} onToggle={toggleOutline} onJump={jumpTo}/> : <p className="sidebar-empty">用 # 写下标题，<br/>在这里看见文章的结构。</p>}
          </>}
        </div><div className="sidebar-bottom"><span className="workspace-badge"><FileText size={17}/></span><p>你的文字，安心留在本地。<br/><span>随时开始，随时续写。</span></p><IconButton title={dark ? '浅色主题' : '深色主题'} onClick={() => changePreference('theme', dark ? 'light' : 'dark')}>{dark ? <Sun size={17}/> : <Moon size={17}/>}</IconButton></div>
      </aside>}
      <main className="main">
        <div className="tabbar"><IconButton title={preferences.sidebar ? '收起侧栏' : '展开侧栏'} onClick={() => changePreference('sidebar', !preferences.sidebar)}>{preferences.sidebar ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}</IconButton><div className="tabs">{docs.map(doc => <div key={doc.id} className={`tab ${doc.id === activeId ? 'active' : ''}`}><button className="tab-label" onClick={() => setActiveId(doc.id)}><FileText size={14}/><span>{doc.title}</span>{doc.content !== doc.savedContent && <i className="dirty-dot"/>}</button><button title="关闭文档" aria-label={`关闭 ${doc.title}`} className="tab-close" onClick={() => requestClose(doc.id)}><X size={12}/></button></div>)}</div><IconButton title="新建文档" onClick={() => addDoc(createDoc())}><Plus size={17}/></IconButton></div>
        {active ? <>
          <div className="document-toolbar"><div className="breadcrumb"><FileText size={15}/><span>{active.path ? '本地文件' : '草稿'}</span><ChevronRight size={12}/><strong title={active.path ?? active.title}>{active.title}</strong></div><div className="toolbar-actions"><div className="mode-switch" role="group" aria-label="编辑模式">{modes.map(item => <button key={item.id} title={item.label} aria-pressed={preferences.mode === item.id} className={preferences.mode === item.id ? 'selected' : ''} onClick={() => changePreference('mode', item.id)}><item.icon size={14}/><span>{item.label}</span></button>)}</div><IconButton title={`查找文档 (${mod} F)`} onClick={documentSearch.open} className={documentSearch.opened ? 'selected' : ''}><Search size={16}/></IconButton><IconButton title={focus ? '退出专注模式' : '专注模式'} onClick={() => setFocus(!focus)} className={focus ? 'selected' : ''}><Focus size={16}/></IconButton><div className="menu-anchor"><IconButton title="更多操作" onClick={() => setMenu(!menu)}><MoreHorizontal size={18}/></IconButton>{menu && <><div className="menu-dismiss" onClick={() => setMenu(false)}/><div className="dropdown"><button onClick={() => { setMenu(false); void saveDoc(active.id); }}><Save size={15}/>保存文件<kbd>{mod} S</kbd></button><button onClick={() => { setMenu(false); void saveDoc(active.id, true); }}><FileText size={15}/>另存为…</button><hr/><button onClick={() => void exportDocument('pdf')}><Download size={15}/>导出 PDF</button><button onClick={() => void exportDocument('html')}><Code2 size={15}/>导出 HTML</button><hr/><button onClick={() => { setMenu(false); actions.current('guide'); }}>使用指南<ArrowUpRight size={14}/></button></div></>}</div></div></div>
          {preferences.mode !== 'read' && <div className="formatbar"><div className="format-tools"><select className="text-tool" aria-label="段落样式" defaultValue="" onChange={event => { editor.current?.heading(Number(event.target.value)); event.currentTarget.value = ""; }}><option value="" disabled>段落</option><option value="0">正文</option><option value="1">一级标题</option><option value="2">二级标题</option><option value="3">三级标题</option></select><span className="divider"/><IconButton title={`加粗 (${mod} B)`} onClick={() => editor.current?.wrap('**')}><Bold size={15}/></IconButton><IconButton title={`斜体 (${mod} I)`} onClick={() => editor.current?.wrap('*')}><Italic size={15}/></IconButton><IconButton title="插入链接" onClick={() => editor.current?.wrap('[', '](https://)')}><Link size={15}/></IconButton><span className="divider"/><IconButton title="列表" onClick={() => editor.current?.insert('- ')}><List size={16}/></IconButton><IconButton title="引用" onClick={() => editor.current?.insert('> ')}><Quote size={15}/></IconButton><IconButton title="代码" onClick={() => editor.current?.wrap('`')}><Braces size={16}/></IconButton></div><button className="ai-trigger" onClick={startAI}><Sparkles size={14}/>AI 编辑<kbd>选中文字</kbd></button></div>}
          {active.conflict && <div className="conflict-banner"><AlertTriangle size={17}/><span>{active.conflict.disk === null ? '原文件被移除或无法读取。草稿已保留。' : '文件在外部发生修改。自动保存已暂停。'}</span><button disabled={active.conflict.disk === null} onClick={() => void reloadDoc(active.id)}>载入磁盘版本</button><button onClick={() => void saveDoc(active.id, true)}>另存副本</button><button onClick={() => { if (confirm('确定用当前编辑器内容覆盖磁盘文件？磁盘上一版会保留在本地备份中。')) void saveDoc(active.id, false, true); }}>覆盖磁盘</button></div>}
          {active.error && <div className="conflict-banner"><AlertTriangle size={16}/><span>保存失败：{active.error}</span><button onClick={() => void saveDoc(active.id)}>重试</button><button onClick={() => void saveDoc(active.id, true)}>另存为</button></div>}
          {documentSearch.bar}
          <div className={`document-body mode-${preferences.mode}`} onWheelCapture={() => { documentSearch.syncUntil.current = 0; }} style={{ '--font-size': `${preferences.fontSize}px` } as React.CSSProperties}>
            {preferences.mode !== 'read' && <div className="editor-pane"><Editor ref={editor} id={active.id} content={active.content} mode={preferences.mode} dark={dark} fontSize={preferences.fontSize} onChange={content => updateDoc(active.id, { content, error: undefined })} onCursor={(line, col, selected) => setCursor({ line, col, selected })} onScroll={scrollFromEditor} onLink={href => void openLink(href)}/></div>}
            {(preferences.mode === 'split' || preferences.mode === 'read') && <div className="preview-pane" tabIndex={0} aria-label="文档预览" ref={preview} onScroll={scrollFromPreview} onClick={event => { const a = (event.target as HTMLElement).closest('a[href]'); if (a) { event.preventDefault(); void openLink(a.getAttribute('href') ?? ''); } }}><article className="prose" dangerouslySetInnerHTML={{ __html: rendered }}/><div className="end-mark"><span/></div></div>}
          </div>
          <footer className="statusbar"><div>{saving.includes(active.id) ? <><LoaderCircle size={12} className="spin"/>正在保存</> : active.conflict || active.error ? <><AlertTriangle size={12}/>需要处理</> : !active.path ? <><Circle size={9}/>本地草稿</> : dirty ? <><Circle size={9}/>尚未保存</> : <><Check size={13}/>已保存</>}<span className="status-separator"/><span>{preferences.autosave ? '自动保存开启' : '手动保存'}</span></div><div><span>{wordCount.toLocaleString()} 字</span><span className="status-separator"/>{cursor.selected > 0 ? <span>已选 {cursor.selected} 字符</span> : <span>行 {cursor.line}，列 {cursor.col}</span>}<span className="status-separator"/><span>Markdown</span><span className="status-separator"/><span>UTF-8</span></div></footer>
        </> : <div className="empty-state"><BrandMark className="brand-symbol large"/><h1>下一段文字，从这里开始。</h1><p>你的文档，你的节奏。</p><div><button className="primary" onClick={() => addDoc(createDoc())}><Plus size={16}/>新建文档</button><button className="secondary" onClick={() => void open()}><FolderOpen size={16}/>打开文件</button></div></div>}
      </main>
    </div>
    {toast && <div className="toast" role="status">{toast}<button aria-label="关闭提示" onClick={() => setToast('')}><X size={14}/></button></div>}
    {showRecent && <Modal title="最近打开" onClose={() => setShowRecent(false)}><RecentPicker onOpen={openRecent}/></Modal>}
    {showSettings && <Modal title="偏好设置" onClose={() => setShowSettings(false)}><div className="settings-tabs"><button className={settingsTab === 'editor' ? 'active' : ''} onClick={() => setSettingsTab('editor')}>编辑器</button><button className={settingsTab === 'ai' ? 'active' : ''} onClick={() => setSettingsTab('ai')}>AI 服务</button><button className={settingsTab === 'updates' ? 'active' : ''} onClick={() => setSettingsTab('updates')}>更新</button></div>{settingsTab === 'editor' ? <div className="settings-content"><label className="setting-row"><span><strong>外观</strong><small>选择适合你的写作氛围</small></span><select aria-label="外观" value={preferences.theme} onChange={event => changePreference('theme', event.target.value as Preferences['theme'])}><option value="light">浅色 · 云白</option><option value="dark">深色 · 午夜蓝</option><option value="system">跟随系统</option></select></label><label className="setting-row"><span><strong>正文字号</strong><small>编辑与阅读同步调整</small></span><select aria-label="正文字号" value={preferences.fontSize} onChange={event => changePreference('fontSize', Number(event.target.value))}>{[14, 15, 16, 17, 18, 20, 22].map(size => <option key={size} value={size}>{size} px</option>)}</select></label><label className="setting-row"><span><strong>自动保存</strong><small>停止输入后，将已命名文档写入磁盘</small></span><input aria-label="自动保存" type="checkbox" className="toggle" checked={preferences.autosave} onChange={event => changePreference('autosave', event.target.checked)}/></label><p className="settings-note">未命名文档始终保留为本机草稿。<br/>CoMD {version} · 独立开发 · 无需账号</p></div> : settingsTab === 'updates' ? <UpdateSettings update={update} automatic={preferences.autoCheckUpdates} onAutomatic={enabled => changePreference('autoCheckUpdates', enabled)} onCheck={checkUpdates} onOpen={kind => void unwrap(window.comd.openUpdate(kind)).catch(fail)}/> : <form className="settings-content" onSubmit={event => { event.preventDefault(); setSettingsBusy(true); unwrap(window.comd.updateAI(aiConfig)).then(() => { notify('AI 设置已保存'); setShowSettings(false); }).catch(fail).finally(() => setSettingsBusy(false)); }}><p className="form-intro">连接你自己的模型服务。仅在手动发送时，上传选中文字和修改要求。支持兼容 Chat Completions 的接口。</p><label className="field">API 基础地址<input required type="url" value={aiConfig.endpoint} onChange={event => setAIConfig({ ...aiConfig, endpoint: event.target.value })} placeholder="https://api.example.com/v1"/></label><label className="field">模型名称<input required value={aiConfig.model} onChange={event => setAIConfig({ ...aiConfig, model: event.target.value })} placeholder="填写服务商提供的模型 ID"/></label><label className="field">API Key<input type="password" autoComplete="off" value={aiConfig.apiKey ?? ''} onChange={event => setAIConfig({ ...aiConfig, apiKey: event.target.value })} placeholder={aiConfig.hasKey ? '已加密保存；留空保持原密钥' : '本机无鉴权服务可留空'}/></label>{aiConfig.hasKey && <label className="check-row"><input type="checkbox" checked={aiConfig.clearKey ?? false} onChange={event => setAIConfig({ ...aiConfig, clearKey: event.target.checked })}/>删除已保存的密钥</label>}<p className="settings-note">密钥使用系统安全存储加密。模型服务费用由服务商收取，CoMD 不包含 API 额度。</p><button className="primary" type="submit" disabled={settingsBusy}>{settingsBusy ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>}保存设置</button></form>}</Modal>}
    {closeTarget && <Modal title="保存这份文档？" onClose={() => setCloseTarget(null)}><p className="form-intro">「{docs.find(doc => doc.id === closeTarget)?.title}」还有未保存的改动。关闭并丢弃后，将从工作区移除这份草稿。</p><div className="dialog-actions"><button className="secondary" onClick={() => void removeDoc(closeTarget)}>丢弃改动</button><button className="secondary" onClick={() => setCloseTarget(null)}>取消</button><button className="primary" onClick={() => { const id = closeTarget; void saveDoc(id).then(saved => { if (saved) void removeDoc(id); }); }}>保存并关闭</button></div></Modal>}
    {ai && <Modal title="让文字更进一步" onClose={() => { if (!ai.busy) setAI(null); }}><div className="ai-label"><Sparkles size={14}/>AI 编辑 <span>先审阅，再应用</span></div><div className="selected-preview">{ai.original}</div>{ai.result ? <><div className="result-label">建议修改</div><div className="ai-result">{ai.result}</div><div className="dialog-actions"><button className="secondary" onClick={() => setAI(null)}>放弃</button><button className="secondary" onClick={() => setAI({ ...ai, result: undefined })}>调整要求</button><button className="primary" onClick={acceptAI}><Check size={16}/>接受修改</button></div></> : <><label className="field">你希望如何修改？<textarea autoFocus rows={3} value={ai.instruction} onChange={event => setAI({ ...ai, instruction: event.target.value })} placeholder="例如：让表达更简洁，保留原意和 Markdown 格式。" disabled={ai.busy}/></label><div className="prompt-chips">{['润色文字，保持原意', '更简洁地表达', '翻译成英文'].map(prompt => <button key={prompt} disabled={ai.busy} onClick={() => setAI({ ...ai, instruction: prompt })}>{prompt}</button>)}</div>{ai.error && <p className="error-text">{ai.error}</p>}<p className="settings-note">将发送上述选中文字与要求至设置中的 API 服务。</p><div className="dialog-actions"><button className="secondary" disabled={ai.busy} onClick={() => { setAI(null); setSettingsTab('ai'); setShowSettings(true); }}>配置服务</button><button className="primary" disabled={ai.busy || !ai.instruction.trim()} onClick={() => void runAI()}>{ai.busy ? <LoaderCircle size={15} className="spin"/> : <ArrowRight size={15}/>} {ai.busy ? '正在生成…' : '发送修改要求'}</button></div></>}</Modal>}
  </div>;
}
