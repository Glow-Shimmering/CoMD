import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import http from 'node:http';
import { checkOutline } from './outline.mjs';

const root = path.resolve('.'), output = path.join(root, 'test-results');
await fs.mkdir(output, { recursive: true });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'comd-desktop-'));
const userData = path.join(temp, 'profile'), file = path.join(temp, '写作测试.md');
const image = await fs.readFile(path.join(root, 'build/icon.iconset/icon_128x128.png'));
await fs.writeFile(path.join(temp, '本地 图片.png'), image);
const fixture = '# 中文文档\n\n原始内容 **加粗**。\n\n## 第二节\n\n| 项目 | 状态 |\n| --- | --- |\n| 测试 | 通过 |\n\n行内公式 $E=mc^2$\n\n![本地图片](本地%20图片.png)\n\n<script>window.__injected=true</script>\n';
await fs.writeFile(file, '\ufeff' + fixture.replace(/\n/g, '\r\n'));
const errors = [], checks = [];
let application, page;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 12000) { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await delay(120); } throw new Error('Timed out: ' + label); }
async function launch() {
  application = await electron.launch({ ...(process.env.COMD_EXECUTABLE ? { executablePath: process.env.COMD_EXECUTABLE, args: [] } : { args: [root] }), env: { ...process.env, COMD_TEST_DIR: userData, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' } });
  page = await application.firstWindow(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('.editor-host .cm-content').waitFor();
}
async function setText(text) { const editor = page.locator('.editor-host .cm-content'); await editor.click(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a'); await page.keyboard.insertText(text); }
async function nativeSaveTo(destination) { await application.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, destination); }
async function exportViaUI(kind, target) { await fs.rm(target, { force: true }); await nativeSaveTo(target); await page.getByRole('button', { name: '更多操作', exact: true }).click(); await page.getByRole('button', { name: `导出 ${kind.toUpperCase()}`, exact: true }).click(); await until(async () => (await fs.stat(target).catch(() => ({ size: 0 }))).size > 100, kind + ' export', 30000); }
let capturedRequest;
const server = http.createServer((req, res) => { let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => { capturedRequest = JSON.parse(body); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: '经过润色的中文。' } }] })); }); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  await launch();
  assert.match(await page.locator('.cm-content').innerText(), /给想法/);
  await page.screenshot({ path: path.join(output, 'CoMD-light-live.png') });
  checks.push('Desktop boot, sandboxed renderer, welcome live editor');
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await page.getByRole('button', { name: '阅读', exact: true }).click();
  await page.locator('.prose table').waitFor(); assert.equal(await page.locator('.prose .katex').count(), 1);
  await page.screenshot({ path: path.join(output, 'CoMD-light-reading.png') });
  await page.getByRole('button', { name: '深色主题', exact: true }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(output, 'CoMD-dark-reading.png') });
  await page.getByRole('button', { name: '浅色主题', exact: true }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: '实时', exact: true }).click();
  await page.locator('.sidebar-switch').getByRole('button', { name: /大纲/ }).click();
  await page.locator('.outline-item').filter({ hasText: '今天，先写下一点什么' }).click();
  await page.locator('.live-checkbox').first().uncheck();
  await page.getByRole('button', { name: '源码', exact: true }).click();
  assert.match(await page.locator('.cm-content').innerText(), /\[ \] 找到一个舒服/);
  await setText('正文');
  await page.getByRole('combobox', { name: '段落样式', exact: true }).selectOption('2');
  assert.match(await page.locator('.cm-content').innerText(), /## 正文/);
  checks.push('Live task checkbox edits Markdown; paragraph selector applies a heading at line start');
  await checkOutline(page, { setText, until, output });
  checks.push('Separate document/outline views; nested folds, skipped levels, duplicate titles, navigation, keyboard and per-document state');
  await application.evaluate(({ dialog }, target) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] }); }, file);
  await page.getByRole('button', { name: /打开文件/ }).first().click();
  await until(async () => (await page.locator('.cm-content').innerText()).includes('原始内容'), 'open native file');
  await setText(fixture.replace('原始内容', '已自动保存'));
  await until(async () => (await fs.readFile(file, 'utf8')).includes('已自动保存'), 'autosave');
  const bytes = await fs.readFile(file); assert.equal(bytes[0], 0xef); assert.match(bytes.toString(), /\r\n/);
  checks.push('Native file open, typing, autosave, UTF-8 BOM / CRLF preservation');
  await fs.writeFile(file, '# 外部更新\n\n磁盘上的新内容。');
  await until(async () => (await page.locator('.cm-content').innerText()).includes('磁盘上的新内容'), 'external clean reload');
  checks.push('Clean document reloads external edits');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('checkbox', { name: '自动保存', exact: true }).uncheck();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await setText('# 本地修改\n\n尚未写入磁盘。'); await fs.writeFile(file, '# 外部冲突\n\n需要保留的磁盘内容。');
  await page.getByText('文件在外部发生修改。自动保存已暂停。', { exact: true }).waitFor();
  assert.match(await fs.readFile(file, 'utf8'), /需要保留/);
  await page.getByRole('button', { name: '载入磁盘版本', exact: true }).click();
  await until(async () => (await page.locator('.cm-content').innerText()).includes('需要保留'), 'conflict resolution');
  checks.push('Dirty conflict detected without overwriting; explicit reload resolves it');
  await setText(fixture);
  await page.getByRole('button', { name: '阅读', exact: true }).click();
  await page.locator('.prose table').waitFor();
  assert.equal(await page.evaluate(() => window.__injected), undefined);
  await until(async () => page.locator('.prose img').evaluate(img => img.complete && img.naturalWidth > 0), 'relative local image');
  assert.equal(await page.locator('.prose .katex').count(), 1);
  checks.push('Sanitized Markdown, GFM tables, KaTeX, relative image rendering');
  await exportViaUI('html', path.join(output, 'export-test.html'));
  const html = await fs.readFile(path.join(output, 'export-test.html'), 'utf8'); assert.match(html, /data:image\/png;base64/); assert.match(html, /data:font\/woff2;base64|data:application\/font-woff;base64|data:application\/octet-stream;base64/);
  await exportViaUI('pdf', path.join(output, 'export-test.pdf'));
  assert.equal((await fs.readFile(path.join(output, 'export-test.pdf'))).subarray(0,4).toString(), '%PDF');
  checks.push('Standalone HTML export with embedded image/fonts; actual PDF output');
  await page.getByRole('button', { name: '源码', exact: true }).click();
  await page.evaluate(async port => { const result = await window.comd.updateAI({ endpoint: `http://127.0.0.1:${port}/v1`, model: 'mock-model' }); if (!result.ok) throw new Error(result.error); }, server.address().port);
  await setText('待润色的中文。'); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await page.getByRole('button', { name: /AI 编辑/ }).click();
  await page.getByPlaceholder('例如：让表达更简洁，保留原意和 Markdown 格式。').fill('润色');
  await page.getByRole('button', { name: '发送修改要求', exact: true }).click();
  await page.getByRole('button', { name: '接受修改', exact: true }).waitFor();
  assert.match(await page.locator('.cm-content').innerText(), /待润色/);
  await page.getByRole('button', { name: '接受修改', exact: true }).click();
  assert.match(await page.locator('.cm-content').innerText(), /经过润色/);
  assert.match(capturedRequest.messages[1].content, /待润色的中文/); assert.equal(capturedRequest.model, 'mock-model');
  checks.push('AI protocol via local mock, review-before-apply, selected-text payload');
  // Switching documents must retain undo history and current text.
  await page.locator('.tabbar').getByRole('button', { name: '新建文档', exact: true }).click();
  await setText('跨重启保留的未命名草稿。');
  await page.locator('.tab-label').filter({ hasText: '写作测试.md' }).click();
  assert.match(await page.locator('.cm-content').innerText(), /经过润色/);
  await page.locator('.cm-content').click(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  assert.match(await page.locator('.cm-content').innerText(), /待润色/);
  checks.push('Undo history persists across tab switching');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await until(async () => { try { return JSON.parse(await fs.readFile(path.join(userData, 'workspace.json'), 'utf8')).docs.some(doc => doc.content === '跨重启保留的未命名草稿。'); } catch { return false; } }, 'durable workspace');
  await application.close();
  await launch();
  await page.locator('.tab-label').filter({ hasText: '未命名.md' }).click();
  assert.match(await page.locator('.cm-content').innerText(), /跨重启保留/);
  checks.push('Quit/relaunch restores unsaved drafts and open documents');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'desktop-report.json'), JSON.stringify({ passed: checks, rendererErrors: errors, platform: process.platform, arch: process.arch, packagedMacApplicationTested: !!process.env.COMD_EXECUTABLE, realAIProviderTested: false }, null, 2));
  console.log(checks.map(check => 'PASS ' + check).join('\n'));
} catch (error) {
  console.error(error);
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  console.error('Renderer errors:', errors); process.exitCode = 1;
} finally {
  if (application) await application.close().catch(() => {});
  server.close();
  console.log('Test profile:', userData);
}
