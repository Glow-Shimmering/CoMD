const { contextBridge, ipcRenderer } = require('electron');
const invoke = channel => (...args) => ipcRenderer.invoke(channel, ...args);
const subscribe = channel => callback => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('comd', {
  platform: process.platform,
  bootstrap: invoke('bootstrap'), open: invoke('open'), openRecent: invoke('open-recent'),
  listRecent: invoke('list-recent'), openRecentFolder: invoke('open-recent-folder'),
  openFolder: invoke('open-folder'), listFolder: invoke('list-folder'), openFolderFile: invoke('open-folder-file'), closeFolder: invoke('close-folder'),
  save: invoke('save'), reload: invoke('reload'), persist: invoke('persist'),
  closeDoc: invoke('close-doc'), exportFile: invoke('export'), external: invoke('external'),
  aiSettings: invoke('ai-settings'), updateAI: invoke('ai-update'), rewrite: invoke('ai-rewrite'),
  onAction: subscribe('action'), onOpened: subscribe('opened'), onDisk: subscribe('disk'),
  onClosing: subscribe('closing'), readyToClose: () => ipcRenderer.send('ready-to-close'),
});
