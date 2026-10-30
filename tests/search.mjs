import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// CSS Highlight ranges do not create DOM nodes. Compare real pixels with the
// highlight paint suppressed to ensure a registered range is actually visible.
async function verifyPreviewPaint(page, label) {
  await page.waitForFunction(() => {
    const current = CSS.highlights?.get('comd-search-current');
    const pane = document.querySelector('.preview-pane')?.getBoundingClientRect();
    if (!current || !pane) return false;
    return [...current].some(range => [...range.getClientRects()].some(rect =>
      rect.width > 4 && rect.height > 4 && rect.left < pane.right && rect.right > pane.left && rect.top < pane.bottom && rect.bottom > pane.top));
  });
  // Search navigation scrolls on the next animation frame. Wait for that
  // layout and the resulting compositor paint before measuring pixel bounds.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(100);
  const rectangles = await page.evaluate(() => {
    const current = CSS.highlights.get('comd-search-current');
    const pane = document.querySelector('.preview-pane').getBoundingClientRect();
    return [...current].flatMap(range => [...range.getClientRects()].map(rect => ({
      left: Math.max(rect.left, pane.left), right: Math.min(rect.right, pane.right),
      top: Math.max(rect.top, pane.top), bottom: Math.min(rect.bottom, pane.bottom)
    }))).filter(rect => rect.right - rect.left > 4 && rect.bottom - rect.top > 4);
  });
  assert.ok(rectangles.length, `${label}: current match intersects the preview`);
  const painted = await sharp(await page.screenshot({ scale: 'css' })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const hidden = await page.addStyleTag({ content: '::highlight(comd-search), ::highlight(comd-search-current) { background-color: transparent !important; text-decoration: none !important; }' });
  let unpainted;
  try { unpainted = await sharp(await page.screenshot({ scale: 'css' })).removeAlpha().raw().toBuffer(); }
  finally { await hidden.evaluate(element => element.remove()); }
  let changed = 0, total = 0;
  for (const rect of rectangles) {
    for (let y = Math.max(0, Math.ceil(rect.top)); y < Math.min(painted.info.height, Math.floor(rect.bottom)); y++) {
      for (let x = Math.max(0, Math.ceil(rect.left)); x < Math.min(painted.info.width, Math.floor(rect.right)); x++) {
        const i = (y * painted.info.width + x) * 3;
        const delta = Math.abs(painted.data[i] - unpainted[i]) + Math.abs(painted.data[i + 1] - unpainted[i + 1]) + Math.abs(painted.data[i + 2] - unpainted[i + 2]);
        if (delta >= 18) changed++;
        total++;
      }
    }
  }
  assert.ok(total > 0 && changed / total > 0.15, `${label}: current-match paint changed ${changed}/${total} pixels`);
}

// Exercise the app's real, per-document search UI, rather than only the
// matching function: rendered text spans, editor decorations and document
// switching each use a different integration path.
export async function checkSearch(page, application, { temp, output, setText, until, exportViaUI }) {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const query = page.getByRole('textbox', { name: '查找内容', exact: true });
  const status = page.locator('.document-search-status');
  const searchButton = page.getByRole('button', { name: /^查找文档/ });
  const newDocument = page.locator('.tabbar').getByRole('button', { name: '新建文档', exact: true });
  const originalTabCount = await page.locator('.tabs .tab').count();
  const expectCount = async (count, label) => until(async () => {
    const value = (await status.textContent())?.trim() ?? '';
    return count === 0 ? value === '无匹配结果' : new RegExp(`^\\d+\\s*/\\s*${count}$`).test(value);
  }, label);
  const openSearch = async () => {
    if (!(await query.count())) await searchButton.click();
    await query.waitFor();
  };
  const fillQuery = async (text, count, label = text) => {
    await query.fill(text);
    await expectCount(count, `search count: ${label}`);
  };
  const currentPreviewText = () => page.evaluate(() => {
    const current = CSS.highlights?.get('comd-search-current');
    return current ? [...current].map(range => range.toString()).join('') : '';
  });
  const focusCurrent = async text => {
    await query.press('Enter');
    await until(async () => (await currentPreviewText()).includes(text), `preview highlight: ${text}`);
  };
  const ensureReplaceOpen = async () => {
    const toggle = page.getByRole('button', { name: '展开替换', exact: true });
    if (await toggle.count()) await toggle.click();
  };
  const discardActive = async () => {
    await page.locator('.tab.active .tab-close').click();
    await page.getByRole('button', { name: '丢弃改动', exact: true }).click();
  };

  // An isolated, deliberately long unsaved document keeps all test content
  // out of the user's actual files and exercises off-screen editor lines.
  await newDocument.click();
  await page.getByRole('button', { name: '源码', exact: true }).click();
  const fixture = [
    '# 搜索测试',
    '',
    '正文包含 **重要**内容，以及这条[内部链接](https://example.com/target)文字。',
    '',
    '<details>',
    '<summary>折叠说明</summary>',
    '<p>隐藏的查找目标</p>',
    '</details>',
    '',
    'abc ABC abcde',
    '',
    ...Array.from({ length: 160 }, (_, i) => `普通段落 ${i + 1}。\n`),
    '文末有远端命中。'
  ].join('\n');
  await setText(fixture);

  // Live mode uses the underlying Markdown document as well, including lines
  // not currently mounted by CodeMirror's virtualized viewport.
  await page.getByRole('button', { name: '实时', exact: true }).click();
  await openSearch();
  await fillQuery('普通段落', 160, 'live-mode matches');
  const liveStatus = (await status.textContent())?.trim();
  await query.press('Enter');
  await until(async () => (await status.textContent())?.trim() !== liveStatus, 'live mode jumps to next match');
  await until(async () => (await page.locator('.cm-comd-search-current').count()) > 0, 'live-mode current match is highlighted');

  // Reading search indexes rendered words across inline formatting boundaries.
  await page.getByRole('button', { name: '阅读', exact: true }).click();
  await fillQuery('重要内容', 1, 'text across bold');
  await focusCurrent('重要内容');
  await fillQuery('内部链接文字', 1, 'text across a link');
  await focusCurrent('内部链接文字');
  await fillQuery('隐藏的查找目标', 1, 'text in collapsed details');
  await focusCurrent('隐藏的查找目标');
  await until(() => page.locator('.prose details').evaluate(details => details.open), 'search opens matching details');

  await fillQuery('远端命中', 1, 'off-screen text');
  await focusCurrent('远端命中');
  await until(() => page.locator('.preview-pane').evaluate(pane => pane.scrollTop > 0), 'reading scrolls to off-screen match');
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.getByRole('button', { name: '深色主题', exact: true }).click();
    await until(async () => (await currentPreviewText()).includes('远端命中'), `${theme} preview highlight survives theme change`);
    await verifyPreviewPaint(page, `${theme} reading`);
    await page.screenshot({ path: path.join(output, `CoMD-search-${theme}.png`) });
  }
  await page.getByRole('button', { name: '浅色主题', exact: true }).click();
  const exported = path.join(output, 'search-export.html');
  await exportViaUI('html', exported);
  const html = await fs.readFile(exported, 'utf8');
  assert.match(html, /<strong>重要<\/strong>内容/);
  assert.doesNotMatch(html, /comd-search|<mark\b/i, 'search highlights must not leak into exported HTML');

  // The split view keeps the query, counts a match once, and can search raw
  // Markdown when the requested URL is absent from rendered text.
  await page.getByRole('button', { name: '双栏', exact: true }).click();
  assert.equal(await query.inputValue(), '远端命中', 'query survives mode switch');
  const scope = page.getByRole('combobox', { name: '搜索范围', exact: true });
  await scope.waitFor();
  assert.equal(await scope.inputValue(), 'text');
  await expectCount(1, 'split text count');
  await focusCurrent('远端命中');
  await until(() => page.locator('.editor-pane .cm-scroller').evaluate(element => element.scrollTop > 0), 'split source follows text match');
  await scope.selectOption('source');
  await fillQuery('https://example.com/target', 1, 'source-only URL');
  await query.press('Enter');
  await until(async () => (await page.locator('.cm-comd-search-current').count()) > 0, 'source match is highlighted in split mode');

  // Search options, wrapping and invalid regex are visible and reversible.
  await page.getByRole('button', { name: '源码', exact: true }).click();
  assert.equal(await query.inputValue(), 'https://example.com/target');
  await fillQuery('abc', 3, 'case-insensitive matches');
  const firstStatus = (await status.textContent())?.trim();
  await query.press('Enter');
  await until(async () => (await status.textContent())?.trim() !== firstStatus, 'Enter goes to next match');
  await query.press('Shift+Enter');
  await until(async () => (await status.textContent())?.trim() === firstStatus, 'Shift+Enter returns to previous match');
  await page.getByRole('button', { name: '区分大小写', exact: true }).click();
  await expectCount(2, 'case-sensitive matches');
  await page.getByRole('button', { name: '更多搜索选项', exact: true }).click();
  await page.getByRole('checkbox', { name: '全词匹配', exact: true }).check();
  await expectCount(1, 'whole word');
  await page.getByRole('checkbox', { name: '全词匹配', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: '正则表达式', exact: true }).check();
  await query.fill('(');
  await until(async () => (await status.getAttribute('class'))?.includes('is-error'), 'invalid regular expression is reported');

  // One undo must restore all regex replacements while retaining a keystroke
  // made immediately before the replace transaction.
  await setText('foo-12 foo-34');
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.insertText('!');
  await query.fill('(foo)-(\\d+)');
  await expectCount(2, 'regex capture matches');
  await ensureReplaceOpen();
  await page.getByRole('textbox', { name: '替换为', exact: true }).fill('[$2:$1]');
  await page.getByRole('button', { name: /^全部替换/ }).click();
  assert.match(await page.locator('.cm-content').innerText(), /\[12:foo\] \[34:foo\]!/, 'regex capture replacement');
  // Do not focus the editor manually: a real user typically presses Undo
  // immediately after clicking the replacement button.
  await page.keyboard.press(`${mod}+z`);
  await until(async () => (await page.locator('.cm-content').innerText()).includes('foo-12 foo-34!'), 'one undo restores all replacements and prior typing');
  await expectCount(2, 'matches restored after undo');
  await page.getByRole('textbox', { name: '替换为', exact: true }).fill('X');
  await page.getByRole('button', { name: '替换', exact: true }).click();
  assert.match((await page.locator('.cm-content').innerText()).trim(), /^(?:X foo-34!|foo-12 X!)$/, 'single replace changes exactly one match');
  await page.keyboard.press(`${mod}+z`);
  await until(async () => (await page.locator('.cm-content').innerText()).includes('foo-12 foo-34!'), 'single replacement can be undone');

  // Read-only replacement offers an explicit switch rather than modifying the
  // document behind the reading view.
  await page.getByRole('button', { name: '阅读', exact: true }).click();
  await ensureReplaceOpen();
  await page.getByText('阅读模式仅支持查找。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '切换到源码替换', exact: true }).click();
  await page.locator('.cm-content').waitFor();
  assert.match(await page.locator('.cm-content').innerText(), /foo-12 foo-34!/);

  // Change the query immediately after a prior result. A stale match must not
  // remain actionable while the new query is being processed.
  await page.getByRole('button', { name: '更多搜索选项', exact: true }).click();
  const regexOption = page.getByRole('checkbox', { name: '正则表达式', exact: true });
  if (await regexOption.isChecked()) await regexOption.uncheck();
  await setText('猫 猫');
  await fillQuery('猫', 2);
  await page.getByRole('textbox', { name: '替换为', exact: true }).fill('狗');
  await query.fill('不存在');
  await page.getByRole('button', { name: /^全部替换/ }).evaluate(button => button.click());
  await expectCount(0, 'rapid query change');
  assert.equal((await page.locator('.cm-content').innerText()).trim(), '猫 猫', 'stale query did not replace prior matches');

  // Switch documents immediately after a query and verify the second draft
  // never receives a replacement based on the first draft's match positions.
  await fillQuery('猫', 2);
  await newDocument.click();
  await setText('独立的第二份草稿');
  await openSearch();
  await fillQuery('猫', 0, 'new document search');
  await ensureReplaceOpen();
  assert.equal(await page.getByRole('button', { name: /^全部替换/ }).isDisabled(), true);
  assert.equal((await page.locator('.cm-content').innerText()).trim(), '独立的第二份草稿');
  await discardActive();
  assert.equal((await page.locator('.cm-content').innerText()).trim(), '猫 猫', 'first draft unchanged after document switch');

  // Repeated identical text on the same line must map by occurrence, not just
  // by line. Preserve the second occurrence across both scope changes.
  await page.getByRole('button', { name: '双栏', exact: true }).click();
  await setText('foo foo');
  await openSearch();
  await scope.selectOption('source');
  await fillQuery('foo', 2, 'same-line source occurrences');
  for (let attempt = 0; attempt < 2 && !/^2\s*\/\s*2$/.test((await status.textContent())?.trim() ?? ''); attempt++) await query.press('Enter');
  await until(async () => /^2\s*\/\s*2$/.test((await status.textContent())?.trim() ?? ''), 'second source occurrence selected');
  const currentRangeStart = () => page.evaluate(() => {
    const highlights = CSS.highlights?.get('comd-search-current');
    const range = highlights ? [...highlights][0] : null;
    return range ? { offset: range.startOffset, value: range.startContainer.textContent, text: range.toString() } : null;
  });
  const expectSecondPreview = async label => until(async () => {
    const range = await currentRangeStart();
    return range?.value === 'foo foo' && range.offset === 4 && range.text === 'foo';
  }, label);
  await expectSecondPreview('source scope highlights second matching occurrence in preview');
  await scope.selectOption('text');
  await until(async () => /^2\s*\/\s*2$/.test((await status.textContent())?.trim() ?? ''), 'second occurrence retained in text scope');
  await expectSecondPreview('text scope retains second matching occurrence');
  await scope.selectOption('source');
  await until(async () => /^2\s*\/\s*2$/.test((await status.textContent())?.trim() ?? ''), 'second occurrence retained after switching back to source');
  await expectSecondPreview('source scope retains second occurrence after round trip');

  // A rendered match must not borrow an identically spelled hidden source
  // occurrence. Both fixtures previously risked replacing the wrong character
  // or a link destination instead of the visible text.
  await scope.selectOption('text');
  for (const [source, renderedTerm, label] of [
    ['[f&#111;o](foo.md)', 'foo', 'entity link text versus hidden URL'],
    ['(c) &#99;', 'c', 'typographer output versus encoded visible character']
  ]) {
    await setText(source);
    await fillQuery(renderedTerm, 1, label);
    await focusCurrent(renderedTerm);
    await until(async () => (await page.locator('.cm-comd-search-current').count()) === 0, `${label}: no unrelated source highlight`);
    await page.getByRole('button', { name: '展开替换', exact: true }).click();
    await page.getByText(/无法直接替换/).waitFor();
    assert.equal(await scope.inputValue(), 'text', `${label}: scope does not silently switch`);
    assert.equal(await page.getByRole('textbox', { name: '替换为', exact: true }).count(), 0, `${label}: no misleading replacement control`);
    assert.equal((await page.locator('.cm-content').innerText()).trim(), source, `${label}: source remains untouched`);
  }

  // Live-mode syntax widgets must not hide a matching source token.
  await page.getByRole('button', { name: '实时', exact: true }).click();
  await setText('- [x] done');
  await fillQuery('[x]', 1, 'live task source token');
  await query.press('Enter');
  await until(async () => (await page.locator('.cm-comd-search-current').allTextContents()).some(value => value.includes('[x]')),
    'live task match exposes highlighted Markdown instead of hiding it behind a checkbox');

  // A pathological user regexp is terminated in its Worker rather than
  // freezing the editor; a subsequent plain-text search must still work.
  await setText('a'.repeat(200) + '!\n恢复查找');
  await page.getByRole('button', { name: '更多搜索选项', exact: true }).click();
  if (!(await regexOption.isChecked())) await regexOption.check();
  await query.fill('(a+)+$');
  await until(async () => (await status.textContent())?.includes('搜索耗时过长'), 'pathological regex is timed out safely');
  await regexOption.uncheck();
  await fillQuery('恢复查找', 1, 'plain search after regex timeout');
  await query.press('Enter');
  await until(async () => (await page.locator('.cm-comd-search-current').allTextContents()).some(value => value.includes('恢复查找')),
    'search and editor recover after Worker timeout');

  // Cmd/Ctrl+F starts with an existing editor selection; Escape closes the
  // search bar and restores keyboard focus to the document.
  if (await query.count()) await page.getByRole('button', { name: '关闭搜索', exact: true }).click();
  await setText('搜索测试 剩余文字');
  await page.keyboard.press(`${mod}+Home`);
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
  assert.equal(await page.evaluate(() => getSelection()?.toString()), '搜索测试');
  await page.keyboard.press(`${mod}+f`);
  await query.waitFor();
  assert.equal(await query.inputValue(), '搜索测试', 'shortcut uses selected text');
  await query.press('Escape');
  await until(async () => !(await query.count()), 'Escape closes search');
  await until(() => page.evaluate(() => !!document.activeElement?.closest('.cm-content')), 'Escape returns editor focus');

  // Selection in the split preview also prefills search, instead of using a
  // stale CodeMirror selection from the other pane.
  await page.getByRole('button', { name: '双栏', exact: true }).click();
  await page.locator('.prose p').evaluate(element => {
    const range = document.createRange();
    range.setStart(element.firstChild, 5); range.setEnd(element.firstChild, 9);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  });
  await page.keyboard.press(`${mod}+f`);
  await query.waitFor();
  assert.equal(await query.inputValue(), '剩余文字', 'split preview selection prefills search');
  await page.getByRole('button', { name: '关闭搜索', exact: true }).click();

  await page.getByRole('button', { name: '实时', exact: true }).click();
  await discardActive();
  assert.equal(await page.locator('.tabs .tab').count(), originalTabCount, 'temporary search drafts were removed');
  return [
    'Document search: source/read/split navigation, Unicode text across inline markup, folded details and off-screen matches',
    'Search controls: live task source, repeated-occurrence mapping, inline/typographer safety, navigation, options, selection shortcut and focus recovery',
    'Regex replacement and one-step undo, Worker timeout recovery, read-only safeguards and stale query/document protection',
    'Search highlights render in light/dark themes and never enter exported HTML'
  ];
}
