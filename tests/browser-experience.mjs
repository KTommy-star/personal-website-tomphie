import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.TOMPHIE_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.TOMPHIE_PLAYWRIGHT_PATH).href : 'playwright');
const url = process.env.TOMPHIE_PREVIEW_URL ?? 'http://127.0.0.1:4321/';
let browser;
before(async () => { browser = await chromium.launch({ channel: 'chrome', headless: true }); });
after(async () => { await browser?.close(); });

test('the portrait artwork shows its lower half with the person centered and unobstructed', async () => {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 960 }, colorScheme: 'light' });
    await page.goto(url);
    const image = page.getByRole('img', { name: '孔俊鑫的湖畔复古插画头像' });
    assert.equal(await image.count(), 1, 'use the supplied illustrated portrait');
    assert.equal(await page.locator('.home-hero').getByText('此刻的坐标', { exact: true }).count(), 0, 'no floating label covers the person');
    const placement = await image.evaluate(img => {
      const frame = img.closest('.portrait-art').getBoundingClientRect();
      const bounds = img.getBoundingClientRect();
      const scale = Math.max(bounds.width / img.naturalWidth, bounds.height / img.naturalHeight);
      const [x, y] = getComputedStyle(img).objectPosition.split(' ').map(value => value === 'bottom' ? 1 : parseFloat(value) / 100);
      // Face landmark hand-measured from the supplied 1122 × 1402 poster.
      const faceX = bounds.left + (581 / 1122) * img.naturalWidth * scale + (bounds.width - img.naturalWidth * scale) * x;
      const faceY = bounds.top + (920 / 1402) * img.naturalHeight * scale + (bounds.height - img.naturalHeight * scale) * y;
      return { lowerHalf: (frame.top - bounds.top) / bounds.height, centerError: Math.abs(faceX - frame.left - frame.width / 2) / frame.width, faceHeight: (faceY - frame.top) / frame.height, loaded: img.complete && img.naturalWidth > 0 };
    });
    assert(placement.loaded);
    assert(placement.lowerHalf >= .49, 'upper photographic half is outside the visible window');
    assert(placement.centerError <= .08, `face stays centered: ${JSON.stringify(placement)}`);
    assert(placement.faceHeight > .1 && placement.faceHeight < .55, 'face stays inside the upper part of the visible portrait');
    await page.close();
  }
});

test('liquid glass refracts clear scenery across the functional panels', async () => {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: theme });
    await page.goto(url);
    for (const selector of ['.header-pane', '.story-atlas', '.focus-lens', '.route-card', '.contact-sheet', '.portrait-caption']) {
      const panel = page.locator(selector).first();
      await panel.scrollIntoViewIfNeeded();
      await page.waitForFunction(s => {
        const e = document.querySelector(s); const copy = e?.querySelector('.liquid-glass-refraction');
        return (copy?.style.filter || e?.style.backdropFilter)?.includes('url(');
      }, selector);
      const material = await panel.evaluate(e => {
        const style = getComputedStyle(e);
        const source = e.querySelector('.liquid-glass-refraction');
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = style.backgroundColor; ctx.fillRect(0,0,1,1);
        const id = (source?.style.filter || e.style.backdropFilter).match(/#([^"')]+)/)?.[1];
        const filter = document.getElementById(id);
        return { mode: e.dataset.glass, opacity: ctx.getImageData(0,0,1,1).data[3]/255, blur: parseFloat(style.backdropFilter.match(/blur\(([^)]+)/)?.[1] ?? '0'), bend: [...filter.querySelectorAll('feDisplacementMap')].some(n => Number(n.getAttribute('scale')) > 0), decodedMap: filter.querySelector('feImage')?.getAttribute('href')?.startsWith('data:image/png') };
      });
      assert(material.mode === 'refractive' && material.bend && material.decodedMap, `${theme} ${selector}: real decoded optical map`);
      assert(material.blur <= 1 && material.opacity <= (selector === '.portrait-caption' ? .5 : .2), `${theme} ${selector}: clear, not frosted`);
    }
    await page.close();
  }
});

test('liquid glass actually bends pixels at the rim while its center stays clear', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  await page.goto(url);
  const panel = page.locator('.route-card').first();
  await panel.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.route-card')?.style.backdropFilter.includes('url('));
  await panel.evaluate(e => {
    for (const child of e.children) if (!child.classList.contains('liquid-glass-optics')) child.style.visibility = 'hidden';
    // Place the fixture behind the panel: the real backdrop, not an internal photo copy.
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(90deg,#073b4c 0 3px,#eef6d9 3px 7px)';
    e.parentElement.prepend(backdrop);
  });
  await page.waitForTimeout(350);
  const refracted = (await panel.screenshot()).toString('base64');
  await panel.evaluate(e => {
    const id = e.style.backdropFilter.match(/#([^"')]+)/)[1];
    for (const node of document.getElementById(id).querySelectorAll('feDisplacementMap')) node.setAttribute('scale', '0');
  });
  const flat = (await panel.screenshot()).toString('base64');
  const difference = await page.evaluate(async ([a,b]) => {
    const decode = async data => { const img=new Image(); img.src=`data:image/png;base64,${data}`; await img.decode(); const c=document.createElement('canvas'); c.width=img.width; c.height=img.height; const ctx=c.getContext('2d'); ctx.drawImage(img,0,0); return { width:c.width, height:c.height, pixels:ctx.getImageData(0,0,c.width,c.height).data }; };
    const first=await decode(a), second=await decode(b); let rim=0, center=0, nr=0, nc=0;
    for(let y=40;y<first.height-40;y++) for(let x=5;x<first.width-5;x++) {
      const offset=(y*first.width+x)*4;
      const diff=(Math.abs(first.pixels[offset]-second.pixels[offset])+Math.abs(first.pixels[offset+1]-second.pixels[offset+1])+Math.abs(first.pixels[offset+2]-second.pixels[offset+2]))/3;
      if(x<28 || x>first.width-28) {rim+=diff;nr++;} else if(x>50 && x<first.width-50) {center+=diff;nc++;}
    }
    return {rim:rim/nr,center:center/nc};
  }, [refracted,flat]);
  assert(difference.rim > 3 && difference.rim > difference.center*2, `visible bending, not just a filter declaration: ${JSON.stringify(difference)}`);
  await page.close();
});

test('scrolling glass cards does not rewrite detached full-screen scenery every frame', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  await page.goto(url);
  await page.locator('.route-card').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    window.sceneryWrites = 0;
    window.sceneryObserver = new MutationObserver(records => {
      window.sceneryWrites += records.filter(record => record.target.classList?.contains('liquid-glass-scenery')).length;
    });
    window.sceneryObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
  });
  const session = await page.context().newCDPSession(page);
  await session.send('Input.synthesizeScrollGesture', { x: 1100, y: 650, yDistance: -650, speed: 800, gestureSourceType: 'mouse' });
  const writes = await page.evaluate(() => { window.sceneryObserver.disconnect(); return window.sceneryWrites; });
  assert.equal(writes, 0, 'background must follow native scrolling, not lag through per-frame scenery rewrites');
  await page.close();
});

test('WebKit compatibility uses one shared landscape, not scrolling photo copies in every card', async () => {
  // This exercises the iOS code path in Chromium, not a claim of iPhone hardware testing.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1' });
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgentData', { value: undefined }));
  await page.goto(url);
  await page.locator('.route-card').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('body > .landscape > canvas').count(), 1, 'one shared GPU scene serves every lens');
  assert.equal(await page.locator('.route-card .liquid-glass-scenery, .header-pane .liquid-glass-scenery, .story-atlas .liquid-glass-scenery').count(), 0, 'no independently shifted full-screen copies');
  assert.equal(await page.locator('.header-pane').getAttribute('data-glass'), 'refractive');
  await page.evaluate(() => {
    window.sceneryWrites = 0;
    window.sceneryObserver = new MutationObserver(records => { window.sceneryWrites += records.filter(record => record.target.classList?.contains('liquid-glass-scenery')).length; });
    window.sceneryObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['style'] });
  });
  const session = await page.context().newCDPSession(page);
  await session.send('Input.synthesizeScrollGesture', { x: 250, y: 650, yDistance: -450, speed: 600, gestureSourceType: 'touch' });
  assert.equal(await page.evaluate(() => { window.sceneryObserver.disconnect(); return window.sceneryWrites; }), 0);
  await page.locator('[data-theme-toggle]').click();
  await page.waitForTimeout(230);
  const fade = await page.locator('[data-landscape-night]').evaluate(e => Number(getComputedStyle(e).opacity));
  assert(fade > 0 && fade < 1, 'the shared scene and its lenses use the same live day/night fade');
  await page.locator('.mobile-menu summary').click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.mobile-menu-pane').getAttribute('hidden'), null);
  assert.equal(await page.locator('.mobile-menu-pane').evaluate(e => !!e.parentElement.closest('.glass')), false, 'no nested backdrop root prevents real page sampling');
  await page.locator('.mobile-menu-pane a').last().focus();
  await page.keyboard.press('Escape');
  assert(await page.locator('.mobile-menu-pane').isHidden());
  await page.emulateMedia({ contrast: 'more' });
  await page.waitForFunction(() => !document.querySelector('.landscape').hasAttribute('data-glass-scene'));
  assert.equal(await page.locator('.header-pane').evaluate(e => getComputedStyle(e).backdropFilter), 'none');
  assert.equal(await page.locator('.landscape-day').evaluate(e => getComputedStyle(e).visibility), 'visible', 'turning off optics restores the original scene');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.close();
});

test('the desktop header refracts the live backdrop instead of an isolated wallpaper', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  await page.goto(url);
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.header-pane > .liquid-glass-optics .liquid-glass-scenery').count(), 0);
  assert(await page.locator('.header-pane').evaluate(e => e.style.backdropFilter.includes('url(')));
  await page.close();
});

test('the writing head never leaves dots on undrawn strokes', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, colorScheme: 'light' });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-logo-reveal] path')].some(p => {
    const style = getComputedStyle(p); const offset = parseFloat(style.strokeDashoffset);
    return Number(style.opacity) > .5 && offset > 0 && offset < 1;
  }));
  await page.waitForTimeout(120);
  const strokes = await page.locator('[data-logo-reveal] path').evaluateAll(paths => paths.map(p => ({
    opacity: Number(getComputedStyle(p).opacity), offset: parseFloat(getComputedStyle(p).strokeDashoffset) || 0,
  })));
  assert(strokes.length > 5);
  assert(strokes.some(p => p.opacity > 0.5 && p.offset > 0 && p.offset < 1), 'one stroke is drawing');
  assert(strokes.every(p => p.offset < 0.999 || p.opacity === 0), 'undrawn strokes must be invisible');
  await page.waitForTimeout(2400);
  assert(await page.locator('[data-logo-reveal] path').evaluateAll(paths => paths.every(p => (parseFloat(getComputedStyle(p).strokeDashoffset) || 0) === 0)));
  await page.close();
});

test('day and night share a scene, crossfade and persist after interrupted switching', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, colorScheme: 'light' });
  await page.goto(url);
  assert.equal(await page.locator('[data-landscape-day] img').count(), 1);
  assert.equal(await page.locator('[data-landscape-night] img').count(), 1);
  const button = page.locator('[data-theme-toggle]');
  await button.click();
  await page.waitForTimeout(230);
  const intermediate = await page.locator('[data-landscape-night]').evaluate(e => Number(getComputedStyle(e).opacity));
  assert(intermediate > 0 && intermediate < 1, 'theme actually crossfades');
  await button.click();
  await button.click();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(await button.getAttribute('aria-pressed'), 'true');
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.close();
});

test('both themes fit phone, tablet and desktop and keep chrome compact', async () => {
  for (const width of [320, 390, 768, 1440]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 960 }, colorScheme: theme });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url);
      await page.waitForTimeout(2600);
      const images = await page.locator('img').evaluateAll(elements => elements.map(e => ({ src: e.currentSrc, loaded: e.complete && e.naturalWidth > 0 })));
      assert(images.every(e => e.loaded), `all displayed images load: ${JSON.stringify(images.filter(e => !e.loaded))}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width} ${theme} overflow`);
      const header = await page.locator('.header-pane').boundingBox();
      assert(header && header.height <= 80, 'compact floating header');
      const icon = await page.locator('.brand-logo').boundingBox();
      assert(icon.width <= 30 && icon.height <= 30, 'small brand icon');
      const signature = await page.locator('.hero-logo').boundingBox();
      const footerLogo = await page.locator('.footer-logo').boundingBox();
      assert(signature.width <= 180 && signature.height <= 110, 'signature never stretches its grid column');
      assert(footerLogo.width <= 120, 'footer signature stays compact');
      const brands = await page.locator('[data-brand-word]').evaluateAll(elements => elements.map(e => {
        const r = e.getBoundingClientRect(); return { left: r.left, right: r.right };
      }));
      assert(brands.every(r => r.left >= 0 && r.right <= width), 'background words stay within the viewport');
      if (process.env.TOMPHIE_QA_OUTPUT) await page.screenshot({ path: `${process.env.TOMPHIE_QA_OUTPUT}/${theme}-${width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
});

test('scrolling updates the story and route progress without a delayed queue', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(url);
  const path = page.locator('[data-story-progress]');
  const rect = await path.boundingBox();
  await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), rect.y - 680);
  await page.waitForTimeout(100);
  const a = await path.evaluate(e => Number(e.style.getPropertyValue('--story-progress')));
  await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), rect.y - 180);
  await page.waitForTimeout(100);
  const b = await path.evaluate(e => Number(e.style.getPropertyValue('--story-progress')));
  assert(b > a, `story progress ${a} → ${b}`);
  await page.locator('[data-route-line]').scrollIntoViewIfNeeded();
  const before = await page.locator('[data-route-progress]').evaluate(e => e.style.transform);
  await page.evaluate(() => scrollBy({ top: 300, behavior: 'instant' }));
  await page.waitForTimeout(100);
  const after = await page.locator('[data-route-progress]').evaluate(e => e.style.transform);
  assert.notEqual(before, after);
  await page.close();
});

test('mobile navigation closes with Escape and contacts copy the real value', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  await page.goto(url);
  await page.locator('.mobile-menu summary').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.mobile-menu').getAttribute('open'), null);
  await page.locator('[data-copy-value="ksanjin@163.com"]').click();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'ksanjin@163.com');
  assert.equal(await page.locator('[data-copy-value="ksanjin@163.com"] [data-copy-state]').textContent(), '已复制');
  await context.close();
});

test('a sticky desktop story track continues progressing through its narrative', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url);
  const atlas = await page.locator('.story-atlas').boundingBox();
  const stickyTop = await page.locator('.story-atlas').evaluate(e => parseFloat(getComputedStyle(e).top));
  await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), atlas.y - stickyTop + 8);
  await page.waitForTimeout(100);
  const before = await page.locator('[data-story-progress]').evaluate(e => Number(e.style.getPropertyValue('--story-progress')));
  const beforeBox = await page.locator('.story-atlas').boundingBox();
  await page.evaluate(() => scrollBy({ top: 64, behavior: 'instant' }));
  await page.waitForTimeout(100);
  const after = await page.locator('[data-story-progress]').evaluate(e => Number(e.style.getPropertyValue('--story-progress')));
  const afterBox = await page.locator('.story-atlas').boundingBox();
  assert(Math.abs(beforeBox.y - afterBox.y) < 2, 'story atlas stays anchored while reading');
  assert(after > before + .035, `sticky track still progresses ${before} → ${after}`);
  await page.close();
});

test('reduced motion shows the complete signature and switches without a scenic animation', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', colorScheme: 'light' });
  await page.goto(url);
  assert(await page.locator('[data-logo-reveal] path').evaluateAll(paths => paths.every(p => Number(getComputedStyle(p).opacity) === 1 && (parseFloat(getComputedStyle(p).strokeDashoffset) || 0) === 0)));
  await page.locator('[data-theme-toggle]').click();
  await page.waitForTimeout(50);
  assert.equal(await page.locator('[data-landscape-night]').evaluate(e => Number(getComputedStyle(e).opacity)), 1);
  await page.close();
});

test('research interests switch title, explanation and selection together', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(url);
  await page.locator('[data-focus-choice="3"]').click();
  assert.equal(await page.locator('[data-focus-title]').textContent(), 'Agent');
  assert.match(await page.locator('[data-focus-copy]').textContent(), /智能体/);
  assert.equal(await page.locator('[data-focus-choice][aria-pressed="true"]').count(), 1);
  assert.equal(await page.locator('[data-focus-field]').getAttribute('data-focus-field'), '3');
  await page.locator('[data-focus-choice="1"]').click();
  assert.equal(await page.locator('[data-focus-title]').textContent(), '缺失模态');
  await page.close();
});

test('research selection changes only nodes, not the central optical rings', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto(url);
  for (const index of [2, 3, 4, 0]) {
    await page.locator(`[data-focus-choice="${index}"]`).click();
    await page.waitForTimeout(350);
    const radii = await page.locator('.focus-field svg > circle').evaluateAll(elements => elements.map(e => parseFloat(getComputedStyle(e).r)));
    assert.deepEqual(radii, [47, 46, 73]);
  }
  await page.close();
});

test('high contrast makes every glass surface opaque with readable portrait captions', async () => {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: theme, contrast: 'more' });
    await page.goto(url);
    const panes = await page.locator('.header-pane, .story-atlas, .focus-lens, .route-card, .contact-sheet, .portrait-caption').evaluateAll(elements => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      return elements.map(e => {
        const style = getComputedStyle(e); context.clearRect(0,0,1,1); context.fillStyle = style.backgroundColor; context.fillRect(0,0,1,1);
        return { alpha: context.getImageData(0,0,1,1).data[3], blur: style.backdropFilter, color: style.color, background: style.backgroundColor, caption: e.classList.contains('portrait-caption') };
      });
    });
    assert(panes.every(p => p.alpha === 255 && p.blur === 'none'), JSON.stringify(panes));
    const caption = panes.find(p => p.caption);
    assert.notEqual(caption.color, caption.background, 'caption foreground differs from solid surface');
    await page.goto(new URL('journey/', url).href);
    const filter = await page.locator('.journey-filters').evaluate(e => {
      const style = getComputedStyle(e);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = style.backgroundColor; ctx.fillRect(0,0,1,1);
      return { alpha: ctx.getImageData(0,0,1,1).data[3], blur: style.backdropFilter };
    });
    assert.equal(filter.alpha, 255, 'journey filters use the same opaque high-contrast fallback');
    assert.equal(filter.blur, 'none');
    await page.close();
  }
});

test('journey map captions have reading contrast in both themes', async () => {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: theme });
    await page.goto(new URL('journey/', url).href);
    const contrasts = await page.locator('.journey-map__meta, .journey-map__caption').evaluateAll(elements => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d');
      const sample = color => { ctx.clearRect(0,0,1,1); ctx.fillStyle = color; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data]; };
      const bg = sample(getComputedStyle(document.documentElement).getPropertyValue('--color-paper'));
      const luminance = rgb => rgb.slice(0,3).map(c => { const v = c/255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; }).reduce((sum,v,i) => sum + v*[.2126,.7152,.0722][i],0);
      return elements.map(e => { const fg = sample(getComputedStyle(e).color); const composite = fg.slice(0,3).map((v,i) => v*(fg[3]/255) + bg[i]*(1-fg[3]/255)); const a=luminance(bg), b=luminance(composite); return (Math.max(a,b)+.05)/(Math.min(a,b)+.05); });
    });
    assert(contrasts.every(ratio => ratio >= 4.5), `${theme} contrast ${contrasts}`);
    await page.close();
  }
});
