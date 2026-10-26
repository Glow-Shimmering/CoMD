const { app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol, net, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { readDocument, writeDocument, atomicWrite, within } = require('./files.cjs');
const { folderInfo, listFolder, folderDocument } = require('./folders.cjs');
const { normalizeRecent, rememberRecent } = require('./recent.cjs');
const { createUpdateChecker } = require('./updates.cjs');

app.setName('CoMD');
if (process.env.COMD_TEST_DIR) app.setPath('userData', process.env.COMD_TEST_DIR);
protocol.registerSchemesAsPrivileged([{ scheme: 'comd-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let win, state = { docs: [], activeId: null, recent: [], recentItems: [], preferences: {}, folder: null }, closing = false, pollBusy = false, quitting = false;
const records = new Map();
let stateQueue = Promise.resolve(), saveQueue = Promise.resolve();
const dataFile = () => path.join(app.getPath('userData'), 'workspace.json');
const aiFile = () => path.join(app.getPath('userData'), 'ai.json');
const filters = [{ name: 'Markdown / 文本', extensions: ['md', 'markdown', 'mdown', 'txt'] }, { name: '所有文件', extensions: ['*'] }];
const allowedExtensions = /\.(md|markdown|mdown|txt)$/i;
const pendingPaths = process.argv.slice(1).filter(p => path.isAbsolute(p) && allowedExtensions.test(p));
const send = (name, value) => { if (win && !win.isDestroyed()) win.webContents.send(name, value); };
const updates = createUpdateChecker({ currentVersion: app.getVersion(), platform: process.platform, arch: process.arch, fetch: (...args) => net.fetch(...args), onChange: value => send('update-status', value) });
const configureUpdateChecks = () => updates.setAutomatic(state.preferences.autoCheckUpdates !== false && (!process.env.COMD_TEST_DIR || process.env.COMD_TEST_UPDATE_CHECK === '1'));
async function checkpoint() {
  stateQueue = stateQueue.catch(() => {}).then(async () => {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await atomicWrite(dataFile(), JSON.stringify(state));
  });
  return stateQueue;
}
function rememberItem(item) {
  state.recentItems = rememberRecent(state.recentItems, item);
  // Keep the old file-only field readable by earlier CoMD versions.
  state.recent = state.recentItems.filter(entry => entry.kind === 'file').map(entry => entry.path);
}
function remember(filePath) { rememberItem({ kind: 'file', path: filePath }); }
async function selectFolder(directory) {
  state.folder = await folderInfo(directory);
  rememberItem({ kind: 'folder', path: state.folder.path });
  await checkpoint(); return state.folder;
}
function snapshot(id, record, content = record.content) {
  return { id, path: record.path, title: path.basename(record.path), content, savedContent: record.content, baseHash: record.baseHash, eol: record.eol, bom: record.bom };
}
async function openPath(filePath) {
  const realPath = await fs.realpath(filePath);
  for (const [id, record] of records) if (record.path === realPath) {
    remember(realPath); await checkpoint(); return { ...snapshot(id, record), existing: true };
  }
  const disk = await readDocument(realPath), id = randomUUID();
  const record = { path: realPath, ...disk, baseHash: disk.hash, observedHash: disk.hash };
  records.set(id, record); remember(realPath);
  await checkpoint();
  return snapshot(id, record);
}
function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('请求来源无效。');
    try { return { ok: true, value: await callback(...args) }; }
    catch (error) { return { ok: false, error: error.message || '操作失败。' }; }
  });
}
async function readAI() { try { return JSON.parse(await fs.readFile(aiFile(), 'utf8')); } catch { return { endpoint: 'https://api.openai.com/v1', model: '', key: null }; } }
function validateEndpoint(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) throw new Error('API 地址不能包含登录信息、查询参数或锚点。');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('API 地址需要 HTTPS；本机服务可使用 HTTP。');
  return url.href.replace(/\/$/, '');
}
function installHandlers() {
  handle('bootstrap', async () => ({ ...state, version: app.getVersion() }));
  handle('update-status', () => updates.getState());
  handle('check-updates', () => updates.check());
  handle('open-update', async kind => {
    if (!['release', 'download'].includes(kind)) throw new Error('无效的更新操作。');
    await shell.openExternal(updates.openTarget(kind)); return true;
  });
  handle('open', async () => {
    const result = await dialog.showOpenDialog(win, { filters, properties: ['openFile', 'multiSelections'] });
    if (result.canceled) return [];
    const docs = []; for (const file of result.filePaths) docs.push(await openPath(file));
    return docs;
  });
  handle('open-recent', async file => {
    if (!state.recent.includes(file)) throw new Error('该文件不在最近打开列表中。');
    return openPath(file);
  });
  handle('list-recent', () => state.recentItems);
  handle('open-recent-folder', async directory => {
    if (!state.recentItems.some(item => item.kind === 'folder' && item.path === directory)) throw new Error('该文件夹不在最近打开列表中。');
    return selectFolder(directory);
  });
  handle('open-folder', async () => {
    const result = await dialog.showOpenDialog(win, { title: '打开文件夹', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    return selectFolder(result.filePaths[0]);
  });
  handle('list-folder', directory => listFolder(state.folder?.path, directory));
  handle('open-folder-file', async file => openPath(await folderDocument(state.folder?.path, file)));
  handle('close-folder', async () => { state.folder = null; await checkpoint(); return true; });
  handle('persist', async next => {
    if (!Array.isArray(next.docs) || next.docs.length > 100) throw new Error('工作区数据无效。');
    const docs = next.docs.map(doc => {
      if (typeof doc.id !== 'string' || typeof doc.content !== 'string' || Buffer.byteLength(doc.content) > 20 * 1024 * 1024) throw new Error('文档数据无效。');
      const record = records.get(doc.id);
      return { id: doc.id, title: String(doc.title).slice(0, 300), content: doc.content, path: record?.path ?? null,
        savedContent: record?.content ?? doc.savedContent ?? '', baseHash: record?.baseHash ?? null,
        eol: record?.eol ?? '\n', bom: record?.bom ?? false };
    });
    state = { ...state, docs, activeId: next.activeId, preferences: next.preferences ?? state.preferences };
    configureUpdateChecks();
    await checkpoint(); return true;
  });
  handle('save', (id, content, saveAs = false, force = false) => {
    const operation = saveQueue.catch(() => {}).then(async () => {
      let record = records.get(id);
      let candidate = record;
      if (!record || saveAs) {
        const result = await dialog.showSaveDialog(win, { defaultPath: record?.path ?? '未命名.md', filters: [filters[0]] });
        if (result.canceled || !result.filePath) return { canceled: true };
        const target = path.resolve(result.filePath);
        for (const [otherId, other] of records) if (otherId !== id && other.path === target) throw new Error('此文件已在其他标签页打开，请先关闭该标签页。');
        let disk; try { disk = await readDocument(target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        candidate = { path: target, eol: record?.eol ?? '\n', bom: record?.bom ?? false, baseHash: disk?.hash ?? null, content: disk?.content ?? '' };
        // The native Save dialog handles explicit replacement confirmation. Still detect edits after the dialog.
        force = false;
      }
      const result = await writeDocument(candidate, content, force === true, path.join(app.getPath('userData'), 'backups'));
      if (result.conflict) return result;
      Object.assign(candidate, { content, baseHash: result.hash, observedHash: result.hash });
      records.set(id, candidate); remember(candidate.path);
      return { ...snapshot(id, candidate), conflict: false };
    });
    saveQueue = operation; return operation;
  });
  handle('reload', async id => {
    const record = records.get(id); if (!record) throw new Error('文件尚未保存。');
    const disk = await readDocument(record.path);
    Object.assign(record, disk, { baseHash: disk.hash, observedHash: disk.hash });
    return snapshot(id, record);
  });
  handle('close-doc', async id => { records.delete(id); return true; });
  handle('external', async raw => {
    const url = new URL(raw); if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw new Error('不支持此链接类型。');
    await shell.openExternal(url.href); return true;
  });
  handle('export', async (kind, html, title) => {
    if (!['html', 'pdf'].includes(kind) || typeof html !== 'string' || html.length > 40 * 1024 * 1024) throw new Error('导出数据无效。');
    const result = await dialog.showSaveDialog(win, { defaultPath: String(title).replace(/\.[^.]+$/, '') + '.' + kind, filters: [{ name: kind.toUpperCase(), extensions: [kind] }] });
    if (result.canceled) return false;
    if (kind === 'html') await atomicWrite(result.filePath, html);
    else {
      const printer = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
      try {
        printer.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        await printer.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        const pdf = await printer.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 } });
        await atomicWrite(result.filePath, pdf);
      } finally { printer.destroy(); }
    }
    return true;
  });
  handle('ai-settings', async () => { const config = await readAI(); return { endpoint: config.endpoint, model: config.model, hasKey: !!config.key }; });
  handle('ai-update', async config => {
    const previous = await readAI(), endpoint = validateEndpoint(config.endpoint);
    let key = config.clearKey ? null : previous.key;
    if (config.apiKey) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法保存 API Key。');
      key = safeStorage.encryptString(config.apiKey).toString('base64');
    }
    await atomicWrite(aiFile(), JSON.stringify({ endpoint, model: String(config.model).trim(), key }));
    return true;
  });
  handle('ai-rewrite', async (selection, instruction) => {
    if (typeof selection !== 'string' || !selection.trim() || selection.length > 50000) throw new Error('请选择 1–50,000 字符的文本。');
    if (typeof instruction !== 'string' || !instruction.trim() || instruction.length > 5000) throw new Error('请填写修改要求（最多 5,000 字符）。');
    const config = await readAI(); if (!config.model) throw new Error('请先在设置中填写模型名称。');
    const endpoint = validateEndpoint(config.endpoint);
    const key = config.key ? safeStorage.decryptString(Buffer.from(config.key, 'base64')) : '';
    const response = await net.fetch(endpoint + '/chat/completions', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model: config.model, stream: false, messages: [
        { role: 'system', content: 'You edit selected Markdown. Follow the editing instruction. Preserve meaning and Markdown structure unless asked otherwise. Return only the replacement Markdown, with no explanation and no enclosing code fence.' },
        { role: 'user', content: `Editing instruction:\n${instruction}\n\nSelected Markdown:\n${selection}` }
      ] })
    });
    if (!response.ok) throw new Error(`AI 服务返回 HTTP ${response.status}，请检查地址、模型与密钥。`);
    const body = await response.json(), output = body.choices?.[0]?.message?.content;
    if (typeof output !== 'string' || !output.trim() || output.length > 200000) throw new Error('AI 服务没有返回有效的文本内容。');
    return output;
  });
}
function menu() {
  const action = name => () => send('action', name);
  const template = [
    ...(process.platform === 'darwin' ? [{ label: 'CoMD', submenu: [{ role: 'about' }, { label: '检查更新…', click: action('updates') }, { type: 'separator' }, { label: '设置…', accelerator: 'CmdOrCtrl+,', click: action('settings') }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: '文件', submenu: [{ label: '新建', accelerator: 'CmdOrCtrl+N', click: action('new') }, { label: '打开…', accelerator: 'CmdOrCtrl+O', click: action('open') }, { label: '打开文件夹…', accelerator: 'CmdOrCtrl+Shift+O', click: action('openFolder') }, { label: '保存', accelerator: 'CmdOrCtrl+S', click: action('save') }, { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: action('saveAs') }, { type: 'separator' }, { label: '导出 PDF…', click: action('pdf') }, { label: '导出 HTML…', click: action('html') }, { type: 'separator' }, { label: '关闭文档', accelerator: 'CmdOrCtrl+W', click: action('close') }, ...(process.platform === 'darwin' ? [] : [{ role: 'quit' }])] },
    { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' }, { label: '查找与替换', accelerator: 'CmdOrCtrl+F', click: action('find') }] },
    { label: '视图', submenu: [{ label: '专注模式', accelerator: 'CmdOrCtrl+Shift+F', click: action('focus') }, { label: '切换主题', click: action('theme') }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: '帮助', submenu: [{ label: '检查更新…', click: action('updates') }, { label: '使用指南', click: action('guide') }, { label: '关于 CoMD', click: () => dialog.showMessageBox(win, { message: `CoMD ${app.getVersion()}`, detail: '专注文字，自在表达。\n基于开源组件独立开发的 Markdown 桌面编辑器。', buttons: ['好'] }) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
async function restore() {
  try { state = { ...state, ...JSON.parse(await fs.readFile(dataFile(), 'utf8')) }; } catch {}
  state.recentItems = normalizeRecent(state.recentItems, state.recent, state.folder);
  state.recent = state.recentItems.filter(item => item.kind === 'file').map(item => item.path);
  for (const doc of state.docs) {
    if (!doc.path) continue;
    try {
      const disk = await readDocument(doc.path);
      const dirty = doc.content !== doc.savedContent;
      records.set(doc.id, { path: doc.path, ...disk, content: dirty ? doc.savedContent : disk.content, baseHash: dirty ? doc.baseHash : disk.hash, observedHash: disk.hash });
      if (!dirty) Object.assign(doc, { content: disk.content, savedContent: disk.content, baseHash: disk.hash });
      else if (disk.hash !== doc.baseHash) doc.conflict = { disk: disk.content };
    } catch { doc.conflict = { disk: null }; records.set(doc.id, { path: doc.path, content: doc.savedContent, baseHash: doc.baseHash, eol: doc.eol, bom: doc.bom, observedHash: null }); }
  }
  for (const file of pendingPaths) {
    try { const doc = await openPath(file); if (!doc.existing) state.docs.push(doc); state.activeId = doc.id; } catch (e) { console.error(e.message); }
  }
}
async function createWindow() {
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 840, minHeight: 560, backgroundColor: '#ffffff', title: 'CoMD',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', trafficLightPosition: { x: 18, y: 20 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.on('close', event => { if (!closing) { event.preventDefault(); send('closing'); } });
  win.on('closed', () => { win = null; });
  if (process.env.COMD_DEV_URL) await win.loadURL(process.env.COMD_DEV_URL);
  else await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', async (_event, argv) => {
    for (const file of argv.filter(p => path.isAbsolute(p) && allowedExtensions.test(p))) {
      try { send('opened', await openPath(file)); } catch (e) { dialog.showErrorBox('无法打开文件', e.message); }
    }
    win?.show(); win?.focus();
  });
  app.on('open-file', async (event, file) => {
    event.preventDefault();
    if (!win) pendingPaths.push(file);
    else try { send('opened', await openPath(file)); } catch (e) { dialog.showErrorBox('无法打开文件', e.message); }
  });
  app.whenReady().then(async () => {
    protocol.handle('comd-asset', async request => {
      try {
        const url = new URL(request.url), parts = url.pathname.split('/').filter(Boolean), id = parts.shift();
        const record = records.get(id); if (!record) return new Response('', { status: 403 });
        const root = await fs.realpath(path.dirname(record.path));
        const target = await fs.realpath(path.resolve(root, decodeURIComponent(parts.join('/'))));
        if (!within(root, target) || !/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(target)) return new Response('', { status: 403 });
        return net.fetch(pathToFileURL(target).href);
      } catch { return new Response('', { status: 404 }); }
    });
    installHandlers(); menu(); await restore(); await createWindow(); configureUpdateChecks();
    ipcMain.on('ready-to-close', async event => { if (event.sender !== win?.webContents) return; await stateQueue; closing = true; if (quitting) app.quit(); else win?.close(); });
    setInterval(async () => {
      if (pollBusy) return; pollBusy = true;
      try {
        for (const [id, record] of records) {
          try {
            const disk = await readDocument(record.path);
            if (disk.hash !== record.observedHash) { record.observedHash = disk.hash; send('disk', { id, content: disk.content }); }
          } catch (error) {
            if (error.code === 'ENOENT' && record.observedHash !== null) { record.observedHash = null; send('disk', { id, content: null }); }
          }
        }
      } finally { pollBusy = false; }
    }, 1800).unref();
  });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => updates.dispose());
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', async () => { if (!win) { closing = false; await createWindow(); } });
}
