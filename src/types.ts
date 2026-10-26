export interface DocumentState {
  id: string; path: string | null; title: string; content: string; savedContent: string;
  baseHash?: string | null; existing?: boolean; conflict?: { disk: string | null }; error?: string;
}
export interface Preferences { theme: 'light' | 'dark' | 'system'; mode: 'live' | 'source' | 'split' | 'read'; fontSize: number; autosave: boolean; sidebar: boolean }
export interface AIConfig { endpoint: string; model: string; hasKey?: boolean; encryptionAvailable?: boolean; apiKey?: string; clearKey?: boolean }
export interface Folder { path: string; name: string }
export interface FolderEntry extends Folder { kind: 'folder' | 'file' }
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface DesktopAPI {
  platform: string;
  bootstrap(): Promise<Result<{ docs: DocumentState[]; activeId: string; recent: string[]; preferences: Partial<Preferences>; version: string; folder?: Folder | null }>>;
  open(): Promise<Result<DocumentState[]>>;
  openRecent(path: string): Promise<Result<DocumentState>>;
  openFolder(): Promise<Result<Folder | null>>;
  listFolder(path: string): Promise<Result<FolderEntry[]>>;
  openFolderFile(path: string): Promise<Result<DocumentState>>;
  closeFolder(): Promise<Result<boolean>>;
  save(id: string, text: string, saveAs?: boolean, force?: boolean): Promise<Result<DocumentState & { canceled?: boolean; conflict?: any; disk?: string | null }>>;
  reload(id: string): Promise<Result<DocumentState>>;
  persist(data: { docs: DocumentState[]; activeId: string; preferences: Preferences }): Promise<Result<boolean>>;
  closeDoc(id: string): Promise<Result<boolean>>;
  exportFile(kind: string, html: string, title: string): Promise<Result<boolean>>;
  external(url: string): Promise<Result<boolean>>;
  aiSettings(): Promise<Result<AIConfig>>;
  updateAI(config: AIConfig): Promise<Result<boolean>>;
  rewrite(text: string, instruction: string): Promise<Result<string>>;
  onAction(callback: (action: string) => void): () => void;
  onOpened(callback: (doc: DocumentState) => void): () => void;
  onDisk(callback: (event: { id: string; content: string | null }) => void): () => void;
  onClosing(callback: () => void): () => void;
  readyToClose(): void;
}
declare global { interface Window { comd: DesktopAPI } }
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise; if (!result.ok) throw new Error(result.error); return result.value;
}
