import assert from 'node:assert/strict';

export async function checkOutline(page, { setText, until, output }) {
  const titles = ['文档总览', '第一章', '跳级小节', '详细说明', '第二章', '重复标题', '细节甲', '重复标题', '细节乙', '附录', '参考'];
  const content = '# 文档总览\n\n写下清晰的结构。\n\n## 第一章\n\n#### 跳级小节\n\n##### 详细说明\n\n## 第二章\n\n### 重复标题\n\n#### 细节甲\n\n### 重复标题\n\n#### 细节乙\n\n# 附录\n\n## 参考\n';
  const visible = () => page.locator('.outline-text:visible').allTextContents();
  const toggle = (verb, title) => page.getByRole('button', { name: `${verb} ${title} 的下级标题`, exact: true });
  const openOutline = () => page.locator('.sidebar-switch').getByRole('button', { name: /大纲/ }).click();
  const openFiles = () => page.locator('.sidebar-switch').getByRole('button', { name: '文件', exact: true }).click();

  await openFiles();
  assert.equal(await page.getByText('本页大纲', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('navigation', { name: '文档大纲' }).count(), 0);
  await setText(content);
  await openOutline();
  await until(async () => (await visible()).length === titles.length, 'heading hierarchy');
  assert.deepEqual(await visible(), titles);
  assert.equal(await toggle('收起', '详细说明').count(), 0, 'Leaves have no misleading toggle');

  await toggle('收起', '跳级小节').click();
  await toggle('收起', '第一章').click();
  assert.deepEqual(await visible(), titles.filter(title => !['跳级小节', '详细说明'].includes(title)));
  await toggle('展开', '第一章').click();
  assert.deepEqual(await visible(), titles.filter(title => title !== '详细说明'), 'Nested fold survives parent collapse/expand');
  await page.locator('.outline-item').getByText('第一章', { exact: true }).click();
  assert.match(await page.locator('.statusbar').innerText(), /行 5/);
  assert.equal(await toggle('展开', '跳级小节').count(), 1, 'Heading navigation does not expand children');

  await toggle('收起', '重复标题').first().click();
  assert.ok(!(await visible()).includes('细节甲'));
  assert.ok((await visible()).includes('细节乙'), 'Duplicate heading names have independent fold state');
  await openFiles();
  await openOutline();
  assert.equal(await toggle('展开', '跳级小节').count(), 1);
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  assert.equal(await toggle('展开', '跳级小节').count(), 1);

  await page.locator('.tabbar').getByRole('button', { name: '新建文档', exact: true }).click();
  await setText(content);
  await until(async () => (await visible()).length === titles.length, 'new document independent folds');
  await page.locator('.tab-label').filter({ hasText: '欢迎使用 CoMD.md' }).click();
  assert.equal(await toggle('展开', '跳级小节').count(), 1, 'Switching documents preserves individual fold states');
  await page.getByRole('button', { name: '关闭 未命名.md', exact: true }).click();
  await page.getByRole('button', { name: '丢弃改动', exact: true }).click();
  await setText('引言。\n\n' + content);
  await until(async () => (await page.locator('.cm-content').innerText()).startsWith('引言。'), 'body edit');
  assert.equal(await toggle('展开', '跳级小节').count(), 1, 'Moving headings by body edits preserves folds');
  await page.locator('.outline-item').getByText('第一章', { exact: true }).click();
  assert.match(await page.locator('.statusbar').innerText(), /行 7/);
  await toggle('展开', '跳级小节').focus();
  await page.keyboard.press('Enter');
  assert.ok((await visible()).includes('详细说明'), 'Keyboard activates fold control');
  await toggle('收起', '文档总览').click();
  assert.deepEqual(await visible(), ['文档总览', '附录', '参考'], 'Folding stops at next equal-level heading');
  await toggle('展开', '文档总览').click();

  await page.screenshot({ path: `${output}/CoMD-outline.png` });
  await page.getByRole('button', { name: '阅读', exact: true }).click();
  await page.locator('.outline-item').getByText('第一章', { exact: true }).click();
  assert.equal(await toggle('展开', '重复标题').count(), 1, 'Reading mode preserves folds');
  await page.getByRole('button', { name: '源码', exact: true }).click();
  await setText('没有标题的正文。');
  await page.getByText('用 # 写下标题，', { exact: false }).waitFor();
  await openFiles();
}
