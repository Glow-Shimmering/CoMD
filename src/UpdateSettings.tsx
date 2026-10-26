import { ArrowUpCircle, CheckCircle2, Download, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import type { UpdateState } from './types';

export default function UpdateSettings({ update, automatic, onAutomatic, onCheck, onOpen }: {
  update: UpdateState | null; automatic: boolean; onAutomatic(value: boolean): void;
  onCheck(): void; onOpen(kind: 'release' | 'download'): void;
}) {
  const busy = !update || update.status === 'checking';
  const available = update?.status === 'available' && update.release;
  const heading = !update ? '正在读取版本…' : update.status === 'checking' ? '正在检查更新…'
    : available ? `发现新版本 ${available.version}` : update.status === 'current' ? '当前无需更新'
    : update.status === 'error' ? '暂时无法检查更新' : update.status === 'unavailable' ? '暂无可用的发布信息' : '让 CoMD 保持更新';
  return <div className="settings-content update-settings">
    <div className={`update-summary ${available ? 'available' : ''}`} role="status">
      <span className="update-symbol">{busy ? <LoaderCircle size={24} className="spin"/> : available ? <ArrowUpCircle size={24}/> : update?.status === 'current' ? <CheckCircle2 size={24}/> : <RefreshCw size={24}/>}</span>
      <div><h3>{heading}</h3><p>当前版本 {update?.currentVersion || '…'}</p></div>
    </div>
    {update?.message && <p className="update-message">{update.message}</p>}
    <label className="setting-row"><span><strong>自动检查更新</strong><small>启动后检查，运行期间每 6 小时检查一次</small></span><input aria-label="自动检查更新" type="checkbox" className="toggle" checked={automatic} onChange={event => onAutomatic(event.target.checked)}/></label>
    {available && <div className="update-release">
      <div className="update-release-heading"><strong>更新说明</strong><span>v{available.version}</span></div>
      <div className="update-notes">{available.notes || '此版本没有提供更新说明，可前往发布页面了解详情。'}</div>
      <p className="settings-note">{available.downloadUrl ? '将在浏览器中下载安装包，下载完成后手动安装。' : '当前系统的安装包尚未提供，可前往发布页面查看。'}</p>
      {available.downloadUrl && <button className="primary" onClick={() => onOpen('download')}><Download size={15}/>下载安装包</button>}
    </div>}
    <div className="update-actions"><button className="secondary" disabled={busy} onClick={onCheck}>{busy ? <LoaderCircle size={14} className="spin"/> : <RefreshCw size={14}/>}检查更新</button><button className="update-release-link" onClick={() => onOpen('release')}>前往发布页面<ExternalLink size={13}/></button></div>
    <p className="settings-note">{update?.checkedAt ? `上次检查：${new Date(update.checkedAt).toLocaleString()}。` : ''}更新来自 GitHub Releases，仅检查正式版本。检查时不会发送文档内容。</p>
  </div>;
}
