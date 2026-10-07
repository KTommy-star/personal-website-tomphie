import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.TOMPHIE_PLAYWRIGHT_PATH ? pathToFileURL(process.env.TOMPHIE_PLAYWRIGHT_PATH).href : 'playwright');
const base = process.env.TOMPHIE_PREVIEW_URL ?? 'http://127.0.0.1:4321/';
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser?.close(); });

async function settleView(page, selector) {
  await page.evaluate(async selector => {
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    await Promise.all(document.querySelector(selector).getAnimations().map(animation => animation.finished.catch(() => {})));
  }, selector);
}

async function workbench(width, options = {}) {
  const page = await browser.newPage({ viewport: { width, height: options.height ?? 960 }, colorScheme: options.theme ?? 'light', reducedMotion: options.reduced ? 'reduce' : 'no-preference', ...(options.userAgent ? { userAgent: options.userAgent } : {}) });
  // Exercise the WebKit renderer in Chromium; this is not an iPhone hardware test.
  if (options.userAgent) await page.addInitScript(() => Object.defineProperty(navigator, 'userAgentData', { value: undefined }));
  const owner = '11111111-1111-4111-8111-111111111111';
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-10-07T00:00:00Z' };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: owner, aud: 'authenticated', role: 'authenticated', exp })).toString('base64url'), 'fixture'].join('.');
  let draft = { id: '22222222-2222-4222-8222-222222222222', collection: 'notes', slug: 'layout-fixture', metadata: { title: '界面布局测试', summary: '这篇文章只存在于测试浏览器，不会上传', topic: 'AI', tags: [], related: [], publishedAt: '2026-10-07' }, body: '## 清晰的写作空间\n\n这是用于检查编辑与预览排版的正文', revision: 1, updated_at: '2026-10-07T00:00:00Z' };
  if (options.published) draft = { ...draft, published_commit: 'a'.repeat(40), published_slug: 'layout-fixture', published_collection: 'notes', published_revision: 1, published_url: new URL('notes/layout-fixture/', base).href };
  let saves = 0;
  await page.route(/https:\/\/[^/]+\.supabase\.co\//, async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    let data; let status = 200;
    if (path === '/auth/v1/token') data = { access_token: token, token_type: 'bearer', refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: exp, user };
    else if (path === '/auth/v1/user') data = user;
    else if (path === '/rest/v1/rpc/is_workbench_owner') data = true;
    else if (path === '/rest/v1/workbench_drafts') data = [draft];
    else if (path === '/rest/v1/rpc/save_workbench_draft') {
      const body = request.postDataJSON();
      if (options.failSave) { status = 503; data = { message: '暂时无法保存', code: 'unavailable' }; }
      else { draft = { ...draft, body: body.draft_body, metadata: body.draft_metadata, revision: draft.revision + 1 }; saves++; data = draft; }
    } else if (path === '/auth/v1/logout') data = {};
    else if (path === '/functions/v1/publish-content' && request.postDataJSON().action === 'status') data = { state: options.publicationState ?? 'success', url: 'https://github.com/fixture/actions/runs/1' };
    else { await route.abort(); return; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(new URL('admin/', base).href);
  await page.locator('#login-form button').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#login-form button').disabled);
  await page.locator('#account').fill('tomphie'); await page.locator('#password').fill('fixture-only');
  await page.locator('#login-form button').click();
  await page.locator('#workspace').waitFor({ state: 'visible' });
  if (width <= 800) await page.getByRole('button', { name: '草稿目录', exact: true }).click();
  await page.locator('.draft-item').click();
  await page.locator('#draft-form').waitFor({ state: 'visible' });
  await settleView(page, '.editor-panel');
  return { page, draft: () => draft, saves: () => saves };
}

test('public note filters keep their native semantics with aligned count and inset arrow', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(new URL('notes/', base).href);
  const layout = await page.locator('[data-content-filter]').evaluate(select => {
    const style = getComputedStyle(select); const rect = select.getBoundingClientRect(); const count = document.querySelector('[data-content-count]').getBoundingClientRect();
    return { appearance: style.appearance, padding: parseFloat(style.paddingRight), image: style.backgroundImage, alignment: Math.abs(rect.top + rect.height / 2 - count.top - count.height / 2), gap: count.left - rect.right };
  });
  assert.equal(layout.appearance, 'none'); assert(layout.padding >= 40); assert(layout.image.includes('data:image/svg+xml'));
  assert(layout.alignment <= 2, JSON.stringify(layout)); assert(layout.gap >= 12);
  await page.close();
});

test('workbench controls, readable sheets and shared glass fit phone, tablet and desktop', async () => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    const { page } = await workbench(width);
    const geometry = await page.evaluate(() => {
      const header = document.querySelector('.workbench-header .header-pane');
      const input = document.querySelector('#title').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - innerWidth, header: header.getBoundingClientRect().height, logo: document.querySelector('.workbench-logo').getBoundingClientRect().width, inputVisible: input.width > 0, layers: ['.editor-panel', '.preview-panel'].map(s => ({ background: getComputedStyle(document.querySelector(s)).backgroundColor, glass: document.querySelector(s).classList.contains('glass') })) };
    });
    assert(geometry.overflow <= 1, `${width}px ${JSON.stringify(geometry)}`); assert(geometry.header <= 64); assert(geometry.logo <= 28); assert(geometry.inputVisible);
    assert(geometry.layers.every(layer => !layer.glass && !layer.background.includes('rgba')));
    await page.waitForFunction(() => document.querySelector('.header-pane').dataset.glass === 'refractive');
    if (process.env.TOMPHIE_SCREENSHOT_DIR && [390, 1440].includes(width)) await page.screenshot({ path: `${process.env.TOMPHIE_SCREENSHOT_DIR}/workbench-${width}-light.png` });
    if (width > 800) {
      await page.locator('#body').evaluate(e => e.scrollIntoView({ block: 'start' }));
      await page.locator('#body').focus();
      const clearance = await page.evaluate(() => document.querySelector('#body').getBoundingClientRect().top - document.querySelector('.workspace-controls').getBoundingClientRect().bottom);
      assert(clearance >= 8, `focused editor stays below the sticky controls at ${width}px: ${clearance}`);
      await page.evaluate(() => scrollTo(0, 0));
    }
    if (width <= 800) await page.getByRole('button', { name: '草稿目录', exact: true }).click();
    await settleView(page, '.directory-panel');
    const rhythm = await page.evaluate(() => {
      const rect = s => document.querySelector(s).getBoundingClientRect(); const count = rect('#directory-state'); const create = rect('#new-draft');
      return { gap: count.top - create.bottom, aligned: Math.abs(rect('#collection').left - rect('#draft-filter').left), padding: parseFloat(getComputedStyle(document.querySelector('#draft-filter')).paddingRight) };
    });
    assert(rhythm.gap >= 12 && rhythm.aligned <= 1 && rhythm.padding >= 40, `${width}px ${JSON.stringify(rhythm)}`);
    if (process.env.TOMPHIE_SCREENSHOT_DIR && width === 390) await page.screenshot({ path: `${process.env.TOMPHIE_SCREENSHOT_DIR}/workbench-390-directory.png` });
    await page.close();
  }
});

test('shared mode navigation saves writing and keeps the theme and session in both directions', async () => {
  const { page, draft, saves } = await workbench(1440);
  await page.locator('[data-theme-toggle]').click();
  await page.locator('#body').fill('切换之前的新正文');
  await page.getByRole('link', { name: '浏览网站', exact: true }).click();
  await page.waitForURL(base);
  assert.equal(draft().body, '切换之前的新正文'); assert(saves() >= 1);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.getByRole('link', { name: '写作工作台', exact: true }).click();
  await page.locator('#workspace').waitFor({ state: 'visible' });
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.locator('.draft-item').click();
  assert.equal(await page.locator('#body').inputValue(), '切换之前的新正文');
  await page.close();
});

test('phone views remain operable with reduced motion and dark mode', async () => {
  const { page } = await workbench(390, { reduced: true, theme: 'dark' });
  await page.getByRole('button', { name: '预览', exact: true }).click();
  await page.locator('#preview h1').waitFor({ state: 'visible' });
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(await page.getByRole('button', { name: '预览', exact: true }).getAttribute('aria-pressed'), 'true');
  const motion = await page.locator('.preview-panel').evaluate(e => e.getAnimations().length);
  assert.equal(motion, 0);
  if (process.env.TOMPHIE_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.TOMPHIE_SCREENSHOT_DIR}/workbench-390-dark-preview.png` });
  await page.close();
});

test('published feedback and update actions remain aligned and contained on narrow screens', async () => {
  for (const width of [320, 390, 1440]) {
    const { page } = await workbench(width, { published: true });
    await page.locator('#published-link').waitFor({ state: 'visible' });
    const spacing = await page.evaluate(() => {
      const publish = document.querySelector('#publish-draft'); const range = document.createRange(); range.selectNodeContents(publish);
      const controls = document.querySelector('.workspace-controls').getBoundingClientRect();
      const actions = [...document.querySelectorAll('.publication-actions > :not([hidden])')].map(e => e.getBoundingClientRect());
      return { text: range.getBoundingClientRect().width, button: publish.clientWidth, aligned: Math.max(...actions.map(e => e.top + e.height / 2)) - Math.min(...actions.map(e => e.top + e.height / 2)), contained: actions.every(e => e.left >= controls.left && e.right <= controls.right) };
    });
    assert(spacing.text <= spacing.button - 8, `${width}px update button overflows: ${JSON.stringify(spacing)}`);
    assert(spacing.contained); if (width >= 768) assert(spacing.aligned <= 2);
    await page.close();
  }
});

test('discarding an unsaved draft asks once when switching back to the website', async () => {
  const { page } = await workbench(1440, { failSave: true });
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.accept(); });
  await page.locator('#body').fill('明确放弃的测试正文');
  await page.getByRole('link', { name: '浏览网站', exact: true }).click();
  await page.waitForURL(base);
  assert.deepEqual(dialogs, ['confirm'], 'do not ask again with a native unload prompt after explicit confirmation');
  await page.close();
});

test('the iPhone compatibility path shares one landscape without scenery copies in workbench panels', async () => {
  const { page } = await workbench(390, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await page.waitForFunction(() => document.querySelector('.landscape')?.hasAttribute('data-glass-scene'));
  assert.equal(await page.locator('.landscape-glass-canvas').count(), 1);
  assert.equal(await page.locator('.liquid-glass-scenery').count(), 0);
  await page.getByRole('button', { name: '草稿目录', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.directory-panel').dataset.glass === 'refractive');
  await page.evaluate(() => scrollBy(0, 220));
  assert.equal(await page.locator('.landscape-glass-canvas').count(), 1);
  await page.close();
});

test('scrolling into a published article leaves one compact toolbar without moving the writing', async () => {
  const { page } = await workbench(1440, { published: true });
  await page.locator('#published-link').waitFor({ state: 'visible' });
  await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); });
  const original = await page.locator('#body').evaluate(e => e.getBoundingClientRect().top + scrollY);
  await page.evaluate(() => scrollTo(0, 620));
  await settleView(page, '.workspace-controls');
  const geometry = await page.evaluate(() => {
    const toolbar = document.querySelector('.workspace-controls').getBoundingClientRect();
    return { height: toolbar.height, top: toolbar.top, bottom: toolbar.bottom, body: document.querySelector('#body').getBoundingClientRect().top + scrollY };
  });
  assert(geometry.height <= 60 && geometry.bottom <= 80, `the floating UI still blocks writing: ${JSON.stringify(geometry)}`);
  assert(Math.abs(geometry.body - original) <= 1, 'collapsing must not change the article position');
  assert.equal(await page.locator('.workbench-header').isVisible(), false);
  assert.equal(await page.locator('#save-draft').isVisible(), true);
  assert.equal(await page.locator('#publish-draft').isVisible(), true);
  assert.equal(await page.locator('#delete-draft').isVisible(), false);
  assert.equal(await page.locator('#published-link').isVisible(), false);
  await page.locator('#workbench-more').click();
  assert.equal(await page.locator('#workbench-more').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#published-link').isVisible(), true);
  assert.equal(await page.getByRole('link', { name: '浏览网站', exact: true }).isVisible(), true);
  await page.locator('#deployment-link').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#workbench-more').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#workbench-more').evaluate(e => e === document.activeElement), true);
  assert.equal(await page.locator('#published-link').isVisible(), false);
  await page.evaluate(() => scrollTo(0, 0));
  await settleView(page, '.workspace-controls');
  assert.equal(await page.locator('.workbench-header').isVisible(), true);
  assert.equal(await page.locator('#published-link').isVisible(), true);
  if (process.env.TOMPHIE_SCREENSHOT_DIR) {
    await page.evaluate(() => scrollTo(0, 620)); await settleView(page, '.workspace-controls');
    await page.screenshot({ path: `${process.env.TOMPHIE_SCREENSHOT_DIR}/workbench-1440-compact.png` });
  }
  await page.close();
});

test('phone focus mode keeps saving within one touch-sized row and preserves reduced motion', async () => {
  for (const width of [320, 390]) {
    const { page } = await workbench(width, { published: true, reduced: true, theme: 'dark' });
    await page.locator('#published-link').waitFor({ state: 'visible' });
    await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 620); });
    await settleView(page, '.workspace-controls');
    const layout = await page.evaluate(() => {
      const bar = document.querySelector('.workspace-controls'); const rect = bar.getBoundingClientRect();
      const buttons = ['#save-draft', '#publish-draft', '#workbench-more'].map(s => document.querySelector(s).getBoundingClientRect());
      return { height: rect.height, bottom: rect.bottom, overflow: document.documentElement.scrollWidth - innerWidth, buttons: buttons.map(b => ({ height: b.height, top: b.top, right: b.right })), animations: bar.getAnimations().length };
    });
    assert(layout.height <= 60 && layout.bottom <= 80, `${width}px ${JSON.stringify(layout)}`);
    assert(layout.overflow <= 1 && layout.buttons.every(b => b.height >= 44 && b.right <= width));
    assert(Math.max(...layout.buttons.map(b => b.top)) - Math.min(...layout.buttons.map(b => b.top)) <= 1);
    assert.equal(layout.animations, 0);
    await page.locator('#workbench-more').click();
    assert.equal(await page.getByRole('link', { name: '浏览网站', exact: true }).isVisible(), true);
    assert.equal(await page.locator('#delete-draft').isVisible(), true);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('#workbench-more').click();
    if (process.env.TOMPHIE_SCREENSHOT_DIR && width === 390) await page.screenshot({ path: `${process.env.TOMPHIE_SCREENSHOT_DIR}/workbench-390-compact.png` });
    await page.close();
  }
});

test('compacting never hides failed deployment instructions or unsaved-writing errors', async () => {
  const { page } = await workbench(1440, { published: true, publicationState: 'failure', failSave: true });
  await page.waitForFunction(() => document.querySelector('#publish-status').textContent.includes('部署失败'));
  await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 620); });
  await settleView(page, '.workspace-controls');
  assert.equal(await page.locator('.workbench-header').isVisible(), false);
  assert.equal(await page.locator('#publish-status').isVisible(), true);
  assert.equal(await page.locator('#deployment-link').isVisible(), true);
  await page.locator('#body').fill('保存失败时不能丢失的正文');
  await page.locator('#save-draft').click();
  await page.locator('#workbench-error').filter({ hasText: '暂时无法保存' }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('#workbench-error').isVisible(), true);
  assert.equal(await page.locator('#body').inputValue(), '保存失败时不能丢失的正文');
  await page.close();
});

test('scrolling after a pointer click still compacts, while keyboard navigation retains its focused control', async () => {
  const { page } = await workbench(1440, { published: true });
  await page.locator('#published-link').waitFor({ state: 'visible' });
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('[data-theme-toggle]').click();
  await page.evaluate(() => scrollTo(0, 620));
  await settleView(page, '.workspace-controls');
  assert.equal(await page.locator('.workbench-header').isVisible(), false, 'a previously clicked navigation control must not keep both large bars pinned');
  assert.equal(await page.locator('#workbench-more').evaluate(e => e === document.activeElement), true);
  await page.evaluate(() => scrollTo(0, 0));
  await settleView(page, '.workspace-controls');
  await page.locator('.workbench-brand').focus();
  await page.keyboard.press('Tab');
  await page.evaluate(() => scrollTo(0, 620));
  await settleView(page, '.workspace-controls');
  assert.equal(await page.getByRole('link', { name: '浏览网站', exact: true }).evaluate(e => e === document.activeElement), true);
  assert.equal(await page.locator('.workbench-header').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#workbench-more').evaluate(e => e === document.activeElement), true);
  assert.equal(await page.locator('.workbench-header').isVisible(), false);
  await page.close();
});

test('long conflict feedback remains reachable in a short phone or desktop viewport', async () => {
  for (const width of [390, 1440]) {
    const { page } = await workbench(width, { published: true, publicationState: 'failure', height: 480 });
    await page.waitForFunction(() => document.querySelector('#publish-status').textContent.includes('部署失败'));
    await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 620); });
    await settleView(page, '.workspace-controls');
    await page.evaluate(() => {
      document.querySelector('#workbench-error').textContent = Array(12).fill('其他设备已更新，当前修改仍保留，请先备份').join('\n');
      document.querySelector('#conflict-actions').hidden = false;
    });
    await settleView(page, '.workspace-controls');
    const panel = await page.locator('.workspace-controls').evaluate(e => ({ bottom: e.getBoundingClientRect().bottom, overflow: getComputedStyle(e).overflowY, scrolls: e.scrollHeight > e.clientHeight }));
    assert(panel.bottom <= 480 && panel.overflow === 'auto' && panel.scrolls, `${width}px ${JSON.stringify(panel)}`);
    await page.locator('#reload-draft').evaluate(e => e.scrollIntoView({ block: 'nearest' }));
    const button = await page.locator('#reload-draft').boundingBox();
    assert(button.y >= 0 && button.y + button.height <= 480, 'conflict recovery action must stay within reach');
    await page.close();
  }
});
