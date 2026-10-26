import { useEffect, useState } from 'react';
import { FileText, FolderOpen, Search, ChevronRight, LoaderCircle } from 'lucide-react';
import { unwrap, type RecentItem } from './types';

export default function RecentPicker({ onOpen }: { onOpen(item: RecentItem): Promise<void> }) {
  const [items, setItems] = useState<RecentItem[]>([]), [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(''), [error, setError] = useState(''), [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    unwrap(window.comd.listRecent()).then(result => { if (current) setItems(result); })
      .catch(reason => { if (current) setError(reason.message || '无法读取最近打开记录。'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  async function open(item: RecentItem) {
    setError(''); setOpening(item.kind + ':' + item.path);
    try { await onOpen(item); }
    catch { setError(`无法打开“${item.path.split(/[\\/]/).pop() || item.path}”，请检查它是否已移动、删除或无法访问。`); setOpening(null); }
  }
  const filtered = items.filter(item => item.path.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="recent-picker">
    <label className="recent-search"><Search size={16} aria-hidden="true"/><input autoFocus aria-label="搜索最近打开" placeholder="搜索文件或文件夹…" value={query} onChange={event => setQuery(event.target.value)}/></label>
    <p className="recent-description">文件与文件夹，按最近使用排序。</p>
    {error && <p className="recent-error" role="alert">{error}</p>}
    <div className="recent-results" aria-label="最近打开列表" aria-busy={loading}>
      {loading ? <p className="recent-empty"><LoaderCircle size={16} className="spin"/>正在读取…</p>
        : filtered.length ? filtered.map(item => {
          const key = item.kind + ':' + item.path;
          return <button type="button" key={key} className="recent-entry" title={item.path} disabled={opening !== null} onClick={() => void open(item)}>
            <span className={`recent-icon ${item.kind}`}>{item.kind === 'folder' ? <FolderOpen size={18}/> : <FileText size={18}/>}</span>
            <span className="recent-entry-text"><strong>{item.path.split(/[\\/]/).pop() || item.path}</strong><small>{item.path}</small></span>
            <span className="recent-kind">{item.kind === 'folder' ? '文件夹' : '文件'}</span>
            {opening === key ? <LoaderCircle size={14} className="spin"/> : <ChevronRight size={14}/>}
          </button>;
        }) : <p className="recent-empty">{items.length ? '没有匹配的文件或文件夹。' : '还没有最近打开的记录。打开文件或文件夹后，会出现在这里。'}</p>}
    </div>
  </div>;
}
