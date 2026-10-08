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
