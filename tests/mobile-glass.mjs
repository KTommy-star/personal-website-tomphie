import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { webkit, chromium } = await import(process.env.TOMPHIE_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.TOMPHIE_PLAYWRIGHT_PATH).href : 'playwright');
const url = process.env.TOMPHIE_PREVIEW_URL ?? 'http://127.0.0.1:4321/';
let safari, chrome;
before(async () => {
  safari = await webkit.launch();
  chrome = await chromium.launch({ channel: 'chrome', headless: true });
});
after(async () => { await Promise.all([safari?.close(), chrome?.close()]); });

test('phone glass highlights originate at the finger instead of the fixed desktop hover point', async () => {
  for (const browser of [safari, chrome]) {
    const page = await browser.newPage({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true });
    await page.goto(url);
    const panel = page.locator('.story-atlas'); await panel.scrollIntoViewIfNeeded();
    const box = await panel.boundingBox();
    await page.touchscreen.tap(box.x + box.width * .76, box.y + box.height * .35);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const light = await panel.evaluate(e => ({ x: parseFloat(e.style.getPropertyValue('--pointer-x')), y: parseFloat(e.style.getPropertyValue('--pointer-y')) }));
    assert(Math.abs(light.x - 76) < 2 && Math.abs(light.y - 35) < 2, `highlight follows the actual touch: ${JSON.stringify(light)}`);
    await page.close();
  }
});

test('a stationary phone tap does not start a continuous optical rendering loop', async () => {
  const page = await safari.newPage({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true });
  await page.goto(url);
  const panel = page.locator('.story-atlas'); await panel.scrollIntoViewIfNeeded();
  await panel.locator('.liquid-glass-rim').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const box = await panel.boundingBox();
  await page.touchscreen.tap(box.x + box.width * .76, box.y + box.height * .35);
  const copies = await page.evaluate(async () => {
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    const original = CanvasRenderingContext2D.prototype.drawImage;
    const scratch = document.querySelector('.landscape-glass-canvas'); let copies = 0;
    CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) { if (source === scratch) copies++; return original.call(this, source, ...args); };
    for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame);
    CanvasRenderingContext2D.prototype.drawImage = original;
    return copies;
  });
  assert(copies <= 1, `no optical redraws after a stationary tap has ended: ${copies}`);
  await page.close();
});

test('phone navigation ink settles with the material during a day-to-night transition', async () => {
  for (const browser of [safari, chrome]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'light' });
    await page.goto(url);
    await page.locator('[data-theme-toggle]').tap();
    await page.waitForTimeout(1050);
    const colors = await page.locator('.header-pane').evaluate(e => ({ ink: getComputedStyle(e.querySelector('.brand-link')).color, target: getComputedStyle(e.querySelector('[data-theme-toggle]')).color }));
    assert.equal(colors.ink, colors.target, 'inherited navigation ink must not lag behind the finished glass/theme transition');
    await page.close();
  }
});

test('scrolling content behind the phone navigation adds separation without intercepting controls', async () => {
  for (const browser of [safari, chrome]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await page.goto(url);
    assert.equal(await page.locator('html').getAttribute('data-scroll-edge'), null);
    await page.locator('.route-card').first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-scroll-edge'), null, { timeout: 2000 });
    const edge = await page.locator('.site-header').evaluate(e => {
      const style = getComputedStyle(e, '::before');
      return { visible: Number(style.opacity) > .9, transparentEnd: style.backgroundImage.includes('rgba(0, 0, 0, 0)'), receivesTouches: style.pointerEvents !== 'none' };
    });
    assert(edge.visible && edge.transparentEnd && !edge.receivesTouches, 'the soft scroll edge protects navigation without covering the controls');
    await page.locator('.mobile-menu summary').tap();
    await page.locator('.mobile-menu-pane').getByRole('link', { name: '科研', exact: true }).tap();
    await page.waitForURL(location => /\/research\/?$/.test(location.pathname));
    assert.equal(await page.locator('html').getAttribute('data-scroll-edge'), null, 'return to the top restores the clear scene');
    await page.close();
  }
});

test('phone menu links respond to touch and the selected item follows the inset rounded outline', async () => {
  for (const browser of [safari, chrome]) {
    const page = await browser.newPage({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true });
    await page.goto(new URL('notes/', url).href);
    await page.locator('.mobile-menu summary').tap();
    const current = page.locator('.mobile-menu-pane [aria-current="page"]');
    await current.waitFor({ state: 'visible' });
    const shape = await current.evaluate(e => {
      const menu = e.closest('nav'); const style = getComputedStyle(e); const container = getComputedStyle(menu);
      const rect = e.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { radius: parseFloat(style.borderTopLeftRadius), outer: parseFloat(container.borderTopLeftRadius), inset: parseFloat(container.paddingLeft), clickable: e.contains(hit) };
    });
    assert(shape.clickable, 'menu must receive touches instead of passing them through the header');
    assert(shape.radius >= 10 && Math.abs(shape.outer - shape.inset - shape.radius) <= 3, 'selected row has a concentric rounded outline');
    const target = page.locator('.mobile-menu-pane').getByRole('link', { name: '科研', exact: true });
    await target.tap({ timeout: 2000 });
    await page.waitForURL(location => /\/research\/?$/.test(location.pathname), { timeout: 10000 });
    assert.equal(await page.locator('h1').textContent(), '科研');
    await page.close();
  }
});

test('phone refraction stays thin and shares only one GPU readback per rendered frame', async () => {
  const page = await safari.newPage({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await page.goto(url);
  const card = page.locator('.route-card').first(); await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.route-card .liquid-glass-rim'));
  const budget = await page.evaluate(async () => {
    const scratch = document.querySelector('.landscape-glass-canvas');
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    let readbacks = 0;
    CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) { if (source === scratch) readbacks++; return draw.call(this, source, ...args); };
    scrollBy(0, 40); dispatchEvent(new Event('scroll'));
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    CanvasRenderingContext2D.prototype.drawImage = draw;
    const top = document.querySelector('.route-card .liquid-glass-rim').getBoundingClientRect();
    return { readbacks, thickness: top.height, pixels: scratch.width * scratch.height };
  });
  assert(budget.readbacks > 0 && budget.readbacks <= 2, `at most one GPU snapshot in each of two possible render frames: ${JSON.stringify(budget)}`);
  assert(budget.thickness <= 18, `no broad picture frame: ${JSON.stringify(budget)}`);
  assert(budget.pixels < 440 * 956, 'edge atlas is smaller than a viewport');
  await page.close();
});

test('starting a touch scroll on a glass card does not shrink the entire card', async () => {
  const page = await chrome.newPage({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true });
  await page.goto(url);
  const card = page.locator('.route-card').first(); await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox(); const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + 120 }] });
  await page.waitForTimeout(140);
  assert.equal(await card.evaluate(e => getComputedStyle(e).transform), 'none', 'scrolling should not trigger a card-wide squeeze');
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.close();
});

test('WebKit glass edges stay attached during scrolling even when rendering callbacks are delayed', async () => {
  const page = await safari.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await page.goto(url);
  const card = page.locator('.route-card').first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.route-card')?.dataset.glass === 'refractive');
  const optics = await card.evaluate(e => {
    const canvases = [...e.querySelectorAll('.liquid-glass-rim')];
    const painted = canvases.reduce((sum, canvas) => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      return sum + pixels.filter((_, i) => i % 4 === 3 && pixels[i] > 0).length;
    }, 0);
    return { count: canvases.length, painted };
  });
  assert(optics.painted > 100, 'curved refraction must be painted inside the card, not detached in the fixed wallpaper');
  assert.equal(optics.count, 4, 'only four narrow edge strips, never a full-size photograph copy');
  const before = await card.boundingBox();
  await page.evaluate(() => {
    // Native scroll still changes layout while the optical renderer cannot run.
    window.savedRAF = requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    scrollBy(0, 180);
  });
  const after = await card.boundingBox();
  assert(Math.abs(before.y - after.y - 180) < 2);
  const attached = await card.evaluate(e => {
    const box = e.getBoundingClientRect();
    return [...e.querySelectorAll('.liquid-glass-rim')].every(canvas => {
      const rim = canvas.getBoundingClientRect();
      return rim.left >= box.left - 1 && rim.right <= box.right + 1 && rim.top >= box.top - 1 && rim.bottom <= box.bottom + 1;
    });
  });
  assert(attached, 'every optical edge moves with its card without a JS scroll update');
  await page.evaluate(() => { window.requestAnimationFrame = window.savedRAF; dispatchEvent(new Event('scroll')); });
  assert.equal(await card.locator('.liquid-glass-scenery').count(), 0);
  assert.equal(await page.locator('.landscape-glass-canvas').count(), 1, 'all strips share one GL context');
  await page.close();
});

test('WebKit optical strips bend real scene pixels and remain transparent toward the center', async () => {
  const page = await safari.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await page.goto(url);
  const card = page.locator('.route-card').first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.route-card .liquid-glass-rim'));
  const difference = await page.evaluate(async () => {
    const gl = document.querySelector('.landscape-glass-canvas').getContext('webgl');
    // A diagnostic stripe texture, confined to this browser; never a site asset.
    const texture = document.createElement('canvas'); texture.width = 390; texture.height = 844;
    const ctx = texture.getContext('2d');
    for (let x = 0; x < 390; x++) { ctx.fillStyle = x % 7 < 3 ? '#073b4c' : '#eef6d9'; ctx.fillRect(x, 0, 1, 844); }
    for (const slot of [gl.TEXTURE0, gl.TEXTURE1]) {
      gl.activeTexture(slot); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);
    }
    const render = async () => { dispatchEvent(new Event('resize')); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); };
    const strip = document.querySelectorAll('.route-card .liquid-glass-rim')[2];
    const pixels = () => strip.getContext('2d').getImageData(0, 0, strip.width, strip.height).data;
    await render(); const bent = pixels();
    const uniform = gl.uniform1f.bind(gl);
    gl.uniform1f = (location, value) => uniform(location, value > 1 ? 0 : value);
    await render(); const flat = pixels();
    let total = 0, count = 0, transparent = 0;
    for (let i = 0; i < bent.length; i += 4) {
      if (bent[i + 3] > 128) { total += Math.abs(bent[i] - flat[i]) + Math.abs(bent[i + 1] - flat[i + 1]) + Math.abs(bent[i + 2] - flat[i + 2]); count += 3; }
      if (!bent[i + 3]) transparent++;
    }
    return { bend: total / count, transparent, count };
  });
  assert(difference.bend > 3, `visible refraction, not just highlights: ${JSON.stringify(difference)}`);
  assert(difference.transparent > 100, 'inner strip leaves the actual background clear');
  await page.close();
});

test('WebKit glass survives orientation and theme changes and restores native scenery on GPU loss', async () => {
  const page = await safari.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 740 }]) {
    await page.setViewportSize(viewport);
    for (const selector of ['.header-pane', '.story-atlas', '.focus-lens', '.route-card', '.contact-sheet']) {
      const panel = page.locator(selector).first(); await panel.scrollIntoViewIfNeeded();
      await page.waitForFunction(s => document.querySelector(s)?.querySelector('.liquid-glass-rim'), selector);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const centerClear = await panel.evaluate(e => {
        const box = e.getBoundingClientRect(); const x = box.left + box.width / 2, y = box.top + box.height / 2;
        return [...e.querySelectorAll('.liquid-glass-rim')].every(c => { const r = c.getBoundingClientRect(); return !(x > r.left && x < r.right && y > r.top && y < r.bottom); });
      });
      assert(centerClear, `${selector}: never repaint the center`);
    }
  }
  await page.locator('[data-theme-toggle]').click();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-landscape-night]')).opacity) === 1);
  await page.evaluate(() => document.querySelector('.landscape-glass-canvas').getContext('webgl').getExtension('WEBGL_lose_context').loseContext());
  await page.waitForFunction(() => !document.querySelector('.landscape-glass-canvas'));
  assert.equal(await page.locator('.liquid-glass-optics[data-glass-rims]').count(), 0);
  assert.equal(await page.locator('.landscape-night').evaluate(e => getComputedStyle(e).visibility), 'visible');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Android glass preserves native backdrop refraction, touch feedback and day/night switching', async () => {
  const page = await chrome.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36' });
  await page.goto(url);
  await page.waitForFunction(() => document.querySelector('.header-pane')?.style.backdropFilter.includes('url('));
  const card = page.locator('.route-card').first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.route-card')?.style.backdropFilter.includes('url('));
  assert.equal(await card.locator('.liquid-glass-scenery, .liquid-glass-rim').count(), 0);
  const session = await page.context().newCDPSession(page);
  await session.send('Input.synthesizeScrollGesture', { x: 230, y: 650, yDistance: -500, speed: 1100, gestureSourceType: 'touch' });
  await page.locator('[data-theme-toggle]').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.close();
});

test('phone glass centers preserve background detail instead of inheriting an opaque section wash', async () => {
  const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';
  for (const browser of [safari, chrome]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true,
      reducedMotion: 'reduce', colorScheme: theme, ...(browser === chrome ? { userAgent: android } : {}) });
    try {
      await page.goto(url);
      // Replace only this test's wallpaper with known detail. The section wash,
      // glass face and optics remain intact: declarations alone cannot pass.
      await page.addStyleTag({ content: '.landscape{background:repeating-linear-gradient(90deg,#284b61 0 8px,#c5e3ea 8px 16px)!important}.landscape-image,.landscape-light,.landscape-veil,.scene-sun,.scene-moon{visibility:hidden!important}.glass> :not(.liquid-glass-optics){visibility:hidden!important}' });
      for (const selector of ['.story-atlas', '.focus-lens', '.route-card']) {
        const panel = page.locator(selector).first(); await panel.scrollIntoViewIfNeeded();
        await page.waitForFunction(s => document.querySelector(s)?.dataset.glass === 'refractive', selector);
        const box = await panel.boundingBox();
        const png = (await page.screenshot({ clip: { x: Math.round(box.x + box.width / 2 - 32), y: Math.round(box.y + box.height / 2), width: 64, height: 8 } })).toString('base64');
        const contrast = await page.evaluate(async data => {
          const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
          const pixels = ctx.getImageData(0, 0, canvas.width, 1).data;
          const reds = [...pixels].filter((_, i) => i % 4 === 0);
          return Math.max(...reds) - Math.min(...reds);
        }, png);
        assert(contrast >= 157 * .8, `${browser === safari ? 'WebKit' : 'Android Chrome'} ${theme} ${selector}: preserve at least 80% of the wallpaper detail, got ${contrast / 157}`);
      }
    } finally { await page.close(); }
  }
});

test('phone glass does not expose a differently coated picture frame on a uniform background', async () => {
  const page = await safari.newPage({ viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  try {
    await page.goto(url);
    const card = page.locator('.route-card').first(); await card.scrollIntoViewIfNeeded();
    await card.locator('.liquid-glass-rim').first().waitFor();
    await page.addStyleTag({ content: '.landscape{background:#607f87!important}.landscape-image,.landscape-light,.landscape-veil,.scene-sun,.scene-moon{visibility:hidden!important}.route-card> :not(.liquid-glass-optics){visibility:hidden!important}' });
    await page.evaluate(async () => {
      const gl = document.querySelector('.landscape-glass-canvas').getContext('webgl');
      const texture = document.createElement('canvas'); texture.width = texture.height = 2;
      const ctx = texture.getContext('2d'); ctx.fillStyle = '#607f87'; ctx.fillRect(0, 0, 2, 2);
      for (const slot of [gl.TEXTURE0, gl.TEXTURE1]) {
        gl.activeTexture(slot); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture);
      }
      dispatchEvent(new Event('resize')); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    });
    const box = await card.boundingBox();
    const png = (await page.screenshot({ clip: { x: Math.round(box.x), y: Math.round(box.y + box.height / 2), width: 48, height: 8 } })).toString('base64');
    const seam = await page.evaluate(async data => {
      const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, 1).data;
      let delta = 0;
      for (let x = 4; x <= 10; x++) for (let c = 0; c < 3; c++) delta += Math.abs(pixels[x * 4 + c] - pixels[32 * 4 + c]);
      return delta / 21;
    }, png);
    assert(seam < 12, `flat scene stays coherent between edge and face instead of a broad dark/bright frame: ${seam}`);
  } finally { await page.close(); }
});

test('clear phone stages still become solid when higher contrast is requested', async () => {
  const page = await safari.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  try {
    await page.goto(url);
    await page.emulateMedia({ contrast: 'more' });
    for (const selector of ['.story-section', '.focus-section', '.route-index']) {
      const colors = await page.locator(selector).evaluate(e => {
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.fillStyle = getComputedStyle(e).backgroundColor; ctx.fillRect(0, 0, 1, 1);
        return { alpha: ctx.getImageData(0, 0, 1, 1).data[3], face: getComputedStyle(e.querySelector('.glass')).backdropFilter };
      });
      assert.equal(colors.alpha, 255, `${selector}: restore a readable opaque stage`);
      assert.equal(colors.face, 'none', 'optical detail is optional, readable controls are not');
    }
  } finally { await page.close(); }
});
