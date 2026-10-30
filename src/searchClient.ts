import type { SearchOptions, SearchResult } from './searchEngine';

interface Pending { worker: Worker; timer: number; resolve: (result: SearchResult) => void }
let pending: Pending | null = null, nextId = 0;
const empty = (): SearchResult => ({ matches: [], error: null, limited: false });

export function cancelSearch(): void {
  if (!pending) return;
  const old = pending; pending = null;
  window.clearTimeout(old.timer); old.worker.terminate(); old.resolve(empty());
}

/** The caller should also ignore stale promises using its own request counter. */
export function runSearch(text: string, options: SearchOptions, replacement = '', source = false): Promise<SearchResult> {
  cancelSearch();
  if (!options.query) return Promise.resolve(empty());
  return new Promise(resolve => {
    let worker: Worker;
    try { worker = new Worker(new URL('./searchWorker.ts', import.meta.url), { type: 'module' }); }
    catch { resolve({ ...empty(), error: '搜索暂时不可用，请重试。' }); return; }
    const id = ++nextId;
    const finish = (result: SearchResult) => {
      if (pending?.worker !== worker) return;
      window.clearTimeout(pending.timer); pending = null; worker.terminate(); resolve(result);
    };
    const timer = window.setTimeout(() => finish({ ...empty(), error: '搜索耗时过长，请缩小范围或调整正则表达式。' }), options.regexp ? 1200 : 4000);
    pending = { worker, timer, resolve };
    worker.onmessage = (event: MessageEvent<{ id: number; result: SearchResult }>) => {
      if (event.data.id === id) finish(event.data.result);
    };
    worker.onerror = () => finish({ ...empty(), error: '搜索暂时不可用，请重试。' });
    worker.postMessage({ id, text, options, replacement, source });
  });
}
