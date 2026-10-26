import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';

// Compare rendered pixels with and without the selection paint. Checking only
// the presence of CodeMirror's selection DOM misses opaque backgrounds above it.
async function visibleSelection(page, label) {
  await page.waitForFunction(() => document.querySelector('.cm-selectionBackground')?.getBoundingClientRect().width > 0);
  await page.waitForTimeout(80);
  const rectangles = await page.locator('.cm-selectionBackground').evaluateAll(elements => elements.map(element => {
    const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  }).filter(r => r.width > 4 && r.height > 4));
  assert.ok(rectangles.length, `${label}: nonempty selection`);
  const cursor = await page.addStyleTag({ content: '.cm-cursorLayer { visibility: hidden !important; }' });
  const selected = await sharp(await page.screenshot({ scale: 'css' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const hidden = await page.addStyleTag({ content: '.cm-selectionBackground { visibility: hidden !important; }' });
  const without = await sharp(await page.screenshot({ scale: 'css' })).removeAlpha().raw().toBuffer();
  await hidden.evaluate(element => element.remove()); await cursor.evaluate(element => element.remove());
  for (const rect of rectangles) {
    let painted = 0, total = 0;
    for (let y = Math.max(0, Math.ceil(rect.y)); y < Math.min(selected.info.height, Math.floor(rect.y + rect.height)); y++) {
      for (let x = Math.max(0, Math.ceil(rect.x)); x < Math.min(selected.info.width, Math.floor(rect.x + rect.width)); x++) {
        const i = (y * selected.info.width + x) * 3;
        const difference = Math.abs(selected.data[i] - without[i]) + Math.abs(selected.data[i + 1] - without[i + 1]) + Math.abs(selected.data[i + 2] - without[i + 2]);
        if (difference >= 18) painted++;
        total++;
      }
    }
    assert.ok(total > 0 && painted / total > 0.25, `${label}: visible selection area ${(100 * painted / total).toFixed(1)}%`);
  }
}

export async function checkSelection(page, { setText, output }) {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const start = process.platform === 'darwin' ? 'Meta+Home' : 'Control+Home';
  const selectFirst = async (text, offset = 0, length = 4) => {
    await setText(text); await page.keyboard.press(start);
    for (let i = 0; i < offset; i++) await page.keyboard.press('ArrowRight');
    for (let i = 0; i < length; i++) await page.keyboard.press('Shift+ArrowRight');
    assert.equal((await page.evaluate(() => getSelection().toString())).length, length);
  };
  // Keep fixtures in a separate draft: CodeMirror only mounts visible lines,
  // so reading innerText is not a safe snapshot of a long document.
  await page.locator('.tabbar').getByRole('button', { name: '新建文档', exact: true }).click();
  for (const dark of [false, true]) {
    if (dark) await page.getByRole('button', { name: '深色主题', exact: true }).click();
    for (const mode of ['源码', '双栏', '实时']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      await selectFirst('同行选中的文字应该清晰可见。\n第二行文字也应该显示高亮。');
      await visibleSelection(page, `${mode} ${dark ? 'dark' : 'light'} same line`);
      if (mode === '源码') await page.screenshot({ path: path.join(output, `CoMD-selection-${dark ? 'dark' : 'light'}.png`) });
      await page.keyboard.press(`${mod}+a`);
      await visibleSelection(page, `${mode} ${dark ? 'dark' : 'light'} multiple lines`);
    }
    for (const [name, content, offset] of [
      ['quote', '> 引用里的文字需要看见选区。', 2],
      ['inline code', '`代码中的文字需要看见选区。`', 1],
      ['fenced code', '```text\n代码块中的文字需要看见选区。\n```', 8]
    ]) {
      await selectFirst(content, offset);
      await visibleSelection(page, `${name} ${dark ? 'dark' : 'light'}`);
    }
  }
  await page.getByRole('button', { name: '浅色主题', exact: true }).click();
  // A real pointer drag must create the same visible single-line selection.
  await page.getByRole('button', { name: '源码', exact: true }).click();
  await setText('鼠标拖动也应该显示选中的文字。');
  const points = await page.locator('.cm-line').first().evaluate(line => {
    const text = line.firstChild, range = document.createRange();
    range.setStart(text, 0); range.setEnd(text, 4); const r = range.getBoundingClientRect();
    return { from: { x: r.x + 1, y: r.y + r.height / 2 }, to: { x: r.right - 1, y: r.y + r.height / 2 } };
  });
  await page.mouse.move(points.from.x, points.from.y); await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 8 }); await page.mouse.up();
  assert.ok((await page.evaluate(() => getSelection().toString())).length >= 3);
  await visibleSelection(page, 'pointer drag');
  await page.getByRole('button', { name: '实时', exact: true }).click();
  await page.locator('.tab.active .tab-close').click();
  await page.getByRole('button', { name: '丢弃改动', exact: true }).click();
}
