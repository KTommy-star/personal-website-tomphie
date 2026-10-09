import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { webkit } = await import(process.env.TOMPHIE_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.TOMPHIE_PLAYWRIGHT_PATH).href : 'playwright');
const url = process.env.TOMPHIE_PREVIEW_URL ?? 'http://127.0.0.1:4321/';

test('desktop sampled glass reuses fixed optics and geometry during native scrolling', async () => {
  const browser = await webkit.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  try {
    await page.goto(url);
    await page.locator('.route-card').first().scrollIntoViewIfNeeded();
    await page.locator('.route-card .liquid-glass-rim').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const metrics = await page.evaluate(async () => {
      const scratch = document.querySelector('.landscape-glass-canvas');
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      const computed = window.getComputedStyle;
      let current;
      CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
        if (current && source === scratch) {
          current.readbacks++;
          current.pixels += args.length === 2 ? source.width * source.height : args[2] * args[3];
        }
        if (current && this.canvas.closest('.header-pane')) current.headerCopies++;
        return draw.call(this, source, ...args);
      };
      window.getComputedStyle = function(element, ...args) {
        if (current && element.matches('.glass')) current.shapeReads++;
        return computed.call(window, element, ...args);
      };
      const mutations = new MutationObserver(records => {
        if (current) current.progressWrites += records.length;
      });
      mutations.observe(document.querySelector('[data-story-progress]'), { subtree: true, attributes: true });
      const measure = async (moving) => {
        current = { readbacks: 0, pixels: 0, headerCopies: 0, shapeReads: 0, progressWrites: 0 };
        for (let i = 0; i < 10; i++) {
          if (moving) scrollBy({ top: 24, behavior: 'instant' });
          else dispatchEvent(new Event('scroll'));
          await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        }
        return { ...current };
      };
      const idle = await measure(false), moving = await measure(true);
      current = null;
      mutations.disconnect();
      CanvasRenderingContext2D.prototype.drawImage = draw;
      window.getComputedStyle = computed;
      return { idle, moving };
    });
    console.info(`desktop scroll metrics: ${JSON.stringify(metrics)}`);
    assert.equal(metrics.idle.readbacks, 0, 'unchanged sampled optics need no GPU snapshot');
    assert.equal(metrics.idle.progressWrites, 0, 'unchanged progress must not rewrite DOM state');
    assert.equal(metrics.moving.headerCopies, 0, 'the fixed header must reuse its sampled rim');
    assert.equal(metrics.moving.shapeReads, 0, 'scrolling must reuse cached sizes and radius');
    assert(metrics.moving.readbacks > 0 && metrics.moving.readbacks <= 20, 'moving cards still sample the current scene');
  } finally { await page.close(); await browser.close(); }
});
