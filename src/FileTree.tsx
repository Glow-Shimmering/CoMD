import { useEffect, useId, useState } from 'react';
import { ChevronRight, FileText, Folder as FolderIcon, FolderOpen, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { unwrap, type Folder, type FolderEntry, type DocumentState } from './types';

type TreeProps = { activePath: string | null; docs: DocumentState[]; onOpen(path: string): void; revision: number };
function Directory({ entry, root = false, ...props }: TreeProps & { entry: Folder; root?: boolean }) {
  const [expanded, setExpanded] = useState(root), [children, setChildren] = useState<FolderEntry[] | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const childrenId = useId();
  useEffect(() => {
    if (!expanded) return;
    let current = true; setBusy(true); setError('');
    unwrap(window.comd.listFolder(entry.path)).then(result => { if (current) setChildren(result); })
      .catch(reason => { if (current) { setChildren(null); setError(reason.message || '无法读取文件夹'); } })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [entry.path, expanded, props.revision]);
  return <li>
    <button type="button" className={`file-tree-row directory-row ${root ? 'root-directory' : ''}`} title={entry.path}
      aria-label={`${expanded ? '收起' : '展开'}文件夹 ${entry.name}`} aria-expanded={expanded} aria-controls={childrenId}
      onClick={() => setExpanded(value => !value)}>
      <ChevronRight className="directory-chevron" size={12}/>
      {busy ? <LoaderCircle size={14} className="spin"/> : expanded ? <FolderOpen size={14}/> : <FolderIcon size={14}/>}
      <span>{entry.name}</span>
    </button>
    <ul id={childrenId} hidden={!expanded}>
      {error ? <li className="file-tree-message error-text" role="status">{error}</li> : children?.length === 0 ? <li className="file-tree-message">没有 Markdown 或文本文件</li> : children?.map(child => child.kind === 'folder'
        ? <Directory key={child.path} entry={child} {...props}/>
        : <li key={child.path}><button type="button" className={`file-tree-row file-row ${child.path === props.activePath ? 'active' : ''}`} title={child.path}
            aria-current={child.path === props.activePath ? 'page' : undefined} onClick={() => props.onOpen(child.path)}>
            <FileText size={14}/><span>{child.name}</span>
            {props.docs.some(doc => doc.path === child.path && doc.content !== doc.savedContent) && <i className="dirty-dot"/>}
          </button></li>)}
    </ul>
  </li>;
}
export default function FileTree({ folder, onClose, ...props }: TreeProps & { folder: Folder; onClose(): void }) {
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { const reload = () => setRefresh(value => value + 1); window.addEventListener('focus', reload); return () => window.removeEventListener('focus', reload); }, []);
  return <section className="folder-section">
    <div className="section-label folder-label">文件夹<div className="folder-actions">
      <button type="button" className="icon-button" title="刷新文件夹" aria-label="刷新文件夹" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={12}/></button>
      <button type="button" className="icon-button" title="关闭文件夹（保留已打开文件）" aria-label="关闭文件夹" onClick={onClose}><X size={13}/></button>
    </div></div>
    <nav aria-label="文件夹树"><ul className="file-tree"><Directory root entry={folder} {...props} revision={props.revision + refresh}/></ul></nav>
  </section>;
}
