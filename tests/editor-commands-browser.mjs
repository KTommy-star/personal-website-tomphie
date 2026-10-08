import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { chromium, webkit } = await import(process.env.TOMPHIE_PLAYWRIGHT_PATH ? pathToFileURL(process.env.TOMPHIE_PLAYWRIGHT_PATH).href : 'playwright');
const base = process.env.TOMPHIE_EDITOR_URL ?? 'http://127.0.0.1:4333/';
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser?.close(); });

async function fixture(width = 390, options = {}) {
  const page = await (options.browser ?? browser).newPage({ viewport: { width, height: 800 }, ...(options.touch ? { hasTouch: true, isMobile: true } : {}), reducedMotion: options.reduced ? 'reduce' : 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__editor-test', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main><section class="editor-panel"><form><div class="markdown-toolbar"></div><label for="body">正文</label><textarea id="body" rows="12" maxlength="150000"></textarea></form></section></main></body></html>' }));
  await page.goto(new URL('__editor-test', base).href);
  await page.evaluate(async ({ base, dark }) => {
    await import(new URL('src/styles/workbench.css', base).href);
    await import(new URL('src/styles/editor-commands.css', base).href);
    const { initMarkdownEditor } = await import(new URL('src/scripts/workbench-editor.ts', base).href);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    window.editorUploads = [];
    window.editorInputs = [];
    const textarea = document.querySelector('textarea');
    initMarkdownEditor({ textarea, toolbar: document.querySelector('.markdown-toolbar'), onImage: () => window.editorUploads.push('image'), onAttachment: kind => window.editorUploads.push(kind) });
    document.querySelector('form').addEventListener('input', event => { if (event.target === textarea) window.editorInputs.push(textarea.value); });
  }, { base, dark: options.dark });
  return { page, textarea: page.locator('#body'), errors };
}

test('slash popup stays inside the viewport at phone, tablet, and desktop widths', async () => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const { page, textarea, errors } = await fixture(width, { reduced: width === 320, dark: width === 390 });
    await textarea.fill('/');
    const geometry = await page.locator('.editor-command-menu').evaluate(menu => {
      const rect = menu.getBoundingClientRect();
      const list = menu.querySelector('.editor-command-list');
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height, innerWidth, innerHeight, scrollable: list.scrollHeight > list.clientHeight, overflow: document.documentElement.scrollWidth - innerWidth, selected: menu.querySelector('[aria-selected="true"]')?.textContent };
    });
    assert(geometry.left >= 7 && geometry.right <= geometry.innerWidth - 7, JSON.stringify({ width, geometry }));
    assert(geometry.top >= 7 && geometry.bottom <= geometry.innerHeight - 7, JSON.stringify({ width, geometry }));
    assert(geometry.height <= 362 && geometry.scrollable, JSON.stringify({ width, geometry }));
    assert(geometry.overflow <= 1, JSON.stringify({ width, geometry }));
    assert(geometry.selected.includes('正文'));
    assert.deepEqual(errors, []);
    if (width === 390) await page.screenshot({ path: '/private/tmp/tomphie-editor-slash-mobile.png' });
    await page.close();
  }
});

test('browser formatting preserves the selection, emits one input, and can be undone', async () => {
  const { page, textarea, errors } = await fixture(1024);
  await textarea.fill('保留原文');
  await textarea.evaluate(field => { field.setSelectionRange(2, 4); window.editorInputs = []; });
  await page.getByRole('button', { name: '粗体', exact: true }).click();
  assert.equal(await textarea.inputValue(), '保留**原文**');
  assert.equal(await textarea.evaluate(field => field.value.slice(field.selectionStart, field.selectionEnd)), '原文');
  assert.deepEqual(await page.evaluate(() => window.editorInputs), ['保留**原文**']);
  await textarea.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  assert.equal(await textarea.inputValue(), '保留原文');
  await textarea.fill('/heading 4'); await textarea.press('Enter');
  assert.equal(await textarea.inputValue(), '#### 标题');
  assert.equal(await textarea.getAttribute('aria-activedescendant'), null);
  assert.deepEqual(errors, []); await page.close();
});

test('touch can scroll the command list and choose a media item without submitting', async () => {
  const { page, textarea, errors } = await fixture(390, { touch: true });
  await textarea.fill('/');
  const box = await page.locator('.editor-command-list').boundingBox();
  const client = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height - 24;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 6; step++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 24 }] });
    await page.waitForTimeout(16);
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert(await page.locator('.editor-command-list').evaluate(list => list.scrollTop > 0));
  assert.equal(await textarea.inputValue(), '/');
  await page.locator('.editor-command-list').evaluate(list => { list.scrollTop = list.scrollHeight; });
  await page.locator('[role="option"][data-editor-command="video"]').tap();
  assert.deepEqual(await page.evaluate(() => window.editorUploads), ['video']);
  assert.equal(await textarea.inputValue(), '');
  await textarea.fill('保留原文');
  await textarea.evaluate(field => field.setSelectionRange(2, 4));
  await page.getByRole('button', { name: '+ 插入', exact: true }).tap();
  await page.getByRole('combobox', { name: '搜索插入命令' }).fill('删除线');
  await page.locator('[role="option"][data-editor-command="strike"]').tap();
  assert.equal(await textarea.inputValue(), '保留~~原文~~');
  assert.deepEqual(errors, []); await page.close();
});

test('native heading select and slash keyboard navigation keep ordinary text intact', async () => {
  const { page, textarea, errors } = await fixture();
  await textarea.fill('真实段落');
  await page.getByRole('combobox', { name: '段落格式' }).selectOption('heading2');
  assert.equal(await textarea.inputValue(), '## 真实段落');
  await textarea.fill('/heading'); await textarea.press('ArrowDown'); await textarea.press('Enter');
  assert.equal(await textarea.inputValue(), '## 标题');
  await textarea.fill('/bold'); await textarea.press('Escape'); await textarea.press('Enter');
  assert.equal(await textarea.inputValue(), '/bold\n');
  await textarea.fill('https://example.test/bold'); await textarea.press('Enter');
  assert.equal(await textarea.inputValue(), 'https://example.test/bold\n');
  assert.deepEqual(errors, []); await page.close();
});

test('popup fits a reduced visual viewport when the mobile keyboard occupies the screen', async () => {
  const { page, textarea, errors } = await fixture(390, { touch: true });
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 300 });
    Object.defineProperty(window.visualViewport, 'offsetTop', { configurable: true, value: 160 });
    window.visualViewport.dispatchEvent(new Event('resize'));
  });
  await textarea.fill('/');
  const geometry = await page.locator('.editor-command-menu').evaluate(menu => {
    const rect = menu.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height, viewportTop: visualViewport.offsetTop, viewportHeight: visualViewport.height, compact: menu.dataset.compact };
  });
  assert(geometry.top >= geometry.viewportTop + 7, JSON.stringify(geometry));
  assert(geometry.bottom <= geometry.viewportTop + geometry.viewportHeight - 7, JSON.stringify(geometry));
  assert(geometry.height <= 181 && geometry.compact === 'true', JSON.stringify(geometry));
  assert.deepEqual(errors, []); await page.close();
});

test('mobile quick toolbar fits two rows with full touch targets and the complete searchable catalog', async () => {
  for (const width of [320, 390]) {
    const { page, textarea, errors } = await fixture(width, { touch: true });
    const toolbar = await page.locator('.markdown-toolbar').evaluate(bar => {
      const visible = [...bar.querySelectorAll('button,select')].filter(control => getComputedStyle(control).display !== 'none');
      return { height: bar.getBoundingClientRect().height, width: bar.getBoundingClientRect().width, controls: visible.map(control => ({ id: control.dataset.editorCommand ?? (control.tagName === 'SELECT' ? 'paragraph' : 'insert'), height: control.getBoundingClientRect().height, width: control.getBoundingClientRect().width })) };
    });
    assert(toolbar.height <= 107, JSON.stringify({ width, toolbar }));
    assert.deepEqual(toolbar.controls.map(control => control.id), ['paragraph', 'bold', 'italic', 'bullet-list', 'link', 'insert']);
    assert(toolbar.controls.every(control => control.height >= 44 && control.width >= 44), JSON.stringify({ width, toolbar }));
    await textarea.fill('/删除线'); await textarea.press('Enter');
    assert.equal(await textarea.inputValue(), '~~文字~~');
    assert.deepEqual(errors, []); await page.close();
  }
});

test('real WebKit keeps the mobile toolbar compact and its Markdown commands usable', async () => {
  const webkitBrowser = await webkit.launch({ headless: true });
  try {
    for (const width of [320, 390]) {
      const { page, textarea, errors } = await fixture(width, { touch: true, browser: webkitBrowser });
      const geometry = await page.locator('.markdown-toolbar').evaluate(bar => ({ height: bar.getBoundingClientRect().height, width: bar.getBoundingClientRect().width, overflow: document.documentElement.scrollWidth - innerWidth }));
      assert(geometry.height <= 107 && geometry.overflow <= 1, JSON.stringify({ width, geometry }));
      await textarea.fill('保留原文'); await textarea.evaluate(field => field.setSelectionRange(2, 4));
      await page.screenshot({ path: '/private/tmp/tomphie-editor-webkit-mobile.png' });
      await page.getByRole('button', { name: '粗体', exact: true }).tap({ timeout: 5000 });
      assert.equal(await textarea.inputValue(), '保留**原文**');
      await textarea.fill('/heading 4'); await textarea.press('Enter');
      assert.equal(await textarea.inputValue(), '#### 标题');
      await textarea.fill('/');
      const menu = await page.locator('.editor-command-menu').boundingBox();
      assert(menu.x >= 7 && menu.x + menu.width <= width - 7 && menu.y >= 7 && menu.y + menu.height <= 793 && menu.height <= 362, JSON.stringify({ width, menu }));
      assert.deepEqual(errors, []); await page.close();
    }
  } finally { await webkitBrowser.close(); }
});
