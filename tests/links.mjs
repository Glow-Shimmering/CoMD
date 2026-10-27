import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';

export async function checkLinks(page, application, { temp, output, until, setText, exportViaUI }) {
  const folder = path.join(temp, '链接测试'), nested = path.join(folder, '题库');
  await fs.mkdir(nested, { recursive: true });
  const entry = path.join(folder, '总复习入口.md'), target = path.join(nested, '题目 一.md');
  const index = '# 总复习入口\n\n[打开题目](./题库/题目%20一.md)\n\n[指定小节](./题库/题目%20一.md#第二节)\n\n[不存在](./不存在.md)\n\n[引用链接][questions]\n\n[questions]: ./题库/题目%20一.md\n\n<a href="./题库/题目%20一.md">HTML 链接</a>\n\n[网页](https://example.com/docs)\n\n[自定义锚点](./题库/题目%20一.md#custom-section)\n\n- [x] 已完成\n- [ ] 未完成\n';
  const body = '<a id="top"></a>\n\n# 题目\n\n[返回入口](../总复习入口.md)\n\n' + '复习内容。\n\n'.repeat(30) + '<a id="custom-section"></a>\n\n## 第二节\n\n目标段落。\n\n[返回顶部](#top)\n\n' + '后续内容。\n\n'.repeat(20);
  await fs.writeFile(entry, index); await fs.writeFile(target, body);
  await application.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, entry);
  await page.getByRole('button', { name: /打开文件/ }).first().click();
  await page.getByRole('button', { name: '双栏', exact: true }).click();
  await page.locator('.prose').getByRole('link', { name: '打开题目', exact: true }).click();
  await until(async () => (await page.locator('.tab.active').innerText()).includes('题目 一.md'), 'relative document opens a tab');
  await page.locator('.prose').getByRole('link', { name: '返回入口', exact: true }).click();
  await page.locator('.prose').getByRole('link', { name: '指定小节', exact: true }).click();
  await until(() => page.locator('.prose h2').evaluate(el => {
    const pane = el.closest('.preview-pane').getBoundingClientRect(), offset = el.getBoundingClientRect().top - pane.top;
    return offset >= -1 && offset < 80;
  }), 'cross-document Chinese anchor');
  await page.locator('.prose').getByRole('link', { name: '返回顶部', exact: true }).click();
  await until(() => page.locator('.preview-pane').evaluate(el => el.scrollTop === 0), 'top anchor');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('checkbox', { name: '自动保存', exact: true }).uncheck();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await setText(body + '\n未保存的修改。');
  await page.locator('.tab-label').filter({ hasText: '总复习入口.md' }).click();
  await page.locator('.prose').getByRole('link', { name: 'HTML 链接', exact: true }).click();
  await until(async () => (await page.locator('.tab.active').innerText()).includes('题目 一.md'), 'existing dirty tab activation');
  assert.equal(await page.locator('.tab-label').filter({ hasText: '题目 一.md' }).count(), 1);
  assert.ok(await page.locator('.prose').getByText('未保存的修改。', { exact: true }).count());
  assert.equal(await fs.readFile(target, 'utf8'), body, 'existing dirty tab is not overwritten or saved');

  await page.locator('.tab-label').filter({ hasText: '总复习入口.md' }).click();
  await page.getByRole('button', { name: '阅读', exact: true }).click();
  await page.locator('.prose').getByRole('link', { name: '不存在', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '找不到链接指向的文件' }).waitFor();
  assert.match(await page.locator('.tab.active').innerText(), /总复习入口/);
  await page.locator('.prose').getByRole('link', { name: '引用链接', exact: true }).click();
  await until(async () => (await page.locator('.tab.active').innerText()).includes('题目 一.md'), 'reference link');

  await page.locator('.tab-label').filter({ hasText: '总复习入口.md' }).click();
  await page.getByRole('button', { name: '实时', exact: true }).click();
  await page.locator('.cm-md-link').filter({ hasText: '打开题目' }).click();
  await until(async () => (await page.locator('.tab.active').innerText()).includes('题目 一.md'), 'live link');
  await page.locator('.tab-label').filter({ hasText: '总复习入口.md' }).click();
  await page.locator('.cm-md-link').filter({ hasText: '自定义锚点' }).click();
  const anchorLine = body.split('\n').findIndex(line => line.includes('id="custom-section"')) + 1;
  await until(async () => (await page.locator('.statusbar').innerText()).includes(`行 ${anchorLine}`), 'live custom HTML anchor');
  await page.locator('.tab-label').filter({ hasText: '总复习入口.md' }).click();
  await page.getByRole('button', { name: '源码', exact: true }).click();
  await page.locator('.cm-line').filter({ hasText: '[引用链接][questions]' }).click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'], position: { x: 30, y: 10 } });
  await until(async () => (await page.locator('.tab.active').innerText()).includes('题目 一.md'), 'source modifier click');

  await page.locator('.tab-label').filter({ hasText: '总复习入口.md' }).click();
  const realEntry = await fs.realpath(entry);
  await until(async () => (await page.evaluate(() => window.comd.bootstrap())).value.docs.some(doc => doc.path === realEntry), 'workspace checkpoint before IPC checks');
  const boot = (await page.evaluate(() => window.comd.bootstrap())).value;
  const id = boot.docs.find(doc => doc.path === realEntry).id;
  const unsafe = await page.evaluate(async id => Promise.all(['javascript:alert(1)', './run.exe', './bad%ZZ.md'].map(href => window.comd.openLink(id, href))), id);
  assert.ok(unsafe.every(result => !result.ok));
  assert.equal((await page.evaluate(file => window.comd.openLink('unknown-document', file), target)).ok, false);
  await application.evaluate(({ shell }) => { globalThis.linkOriginalExternal = shell.openExternal; shell.openExternal = async url => { globalThis.linkOpenedExternal = url; }; });
  await page.getByRole('button', { name: '阅读', exact: true }).click();
  await page.locator('.prose').getByRole('link', { name: '网页', exact: true }).click();
  assert.equal(await application.evaluate(() => globalThis.linkOpenedExternal), 'https://example.com/docs');
  await application.evaluate(({ shell }) => { shell.openExternal = globalThis.linkOriginalExternal; });
  if (await page.getByRole('button', { name: '关闭提示', exact: true }).count()) await page.getByRole('button', { name: '关闭提示', exact: true }).click();
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: '深色主题', exact: true }).click();
    for (const mode of ['实时', '双栏', '阅读']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      const checkbox = page.locator(mode === '实时' ? '.live-checkbox:checked' : '.prose input:checked').first();
      await checkbox.scrollIntoViewIfNeeded();
      const pixels = await sharp(await checkbox.screenshot({ scale: 'css' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let blue = 0;
      for (let y = 3; y < 12; y++) for (let x = 4; x < 11; x++) {
        const i = (y * pixels.info.width + x) * 3, [r, g, b] = pixels.data.subarray(i, i + 3);
        if (b > r + 30 && b > g + 20) blue++;
      }
      assert.ok(blue >= 5, `${theme} ${mode}: check mark has visible blue pixels (${blue})`);
      if (mode !== '实时') assert.equal(await checkbox.isDisabled(), true, 'preview checkbox remains read-only');
    }
    await page.screenshot({ path: path.join(output, `CoMD-links-tasks-${theme}.png`) });
  }
  await page.getByRole('button', { name: '浅色主题', exact: true }).click();
  await exportViaUI('html', path.join(output, 'links-tasks-export.html'));
  const html = await fs.readFile(path.join(output, 'links-tasks-export.html'), 'utf8');
  assert.match(html, /:checked::after/);
  await page.getByRole('button', { name: '实时', exact: true }).click();
  await page.locator('.live-checkbox').first().uncheck();
  await page.getByRole('button', { name: '源码', exact: true }).click();
  assert.match(await page.locator('.cm-content').innerText(), /\[ \] 已完成/);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('checkbox', { name: '自动保存', exact: true }).check();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  return ['Local links: relative/parent/Chinese/space paths, HTML/reference links, cross-file anchors and missing files',
    'Link navigation in live/read/split/source modes; existing dirty tabs retain content without duplicate tabs',
    'Blue task check marks verified in rendered pixels in live/split/read modes and both themes; toggling and export preserved'];
}
