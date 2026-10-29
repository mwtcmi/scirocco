const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const base = (process.env.SITE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const pages = ['index.html', 'racing.html', 'schedule-2027.html', 'car.html', 'michael-white.html', 'paddock.html', 'partners.html'];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(base + '/photos/');
    assert.equal(await page.locator('.gallery .tile').count(), 25);
    const photos = await page.locator('#photos-data').evaluate(data => JSON.parse(data.textContent));
    assert.equal(photos.length, 25);
    assert.equal(new Set(photos.map(photo => photo.href)).size, 25);
    assert.equal(await page.locator('.site-nav .links a[aria-current=page]').innerText(), 'PHOTOS');
    assert.equal(await page.locator('.site-nav .links a').filter({ hasText: /^Photos$/i }).count(), 1);
    for (let index = 0; index < photos.length; index++) {
      const tile = page.locator('.tile').nth(index);
      await tile.scrollIntoViewIfNeeded();
      const bounds = await tile.locator('img').evaluate(async image => {
        await image.decode();
        const rect = image.getBoundingClientRect();
        return { width: rect.width, height: rect.height, natural: image.naturalWidth };
      });
      assert(bounds.natural > 0 && Math.abs(bounds.width / bounds.height - 1.6) < .01, 'thumbnail uses responsive proportions');
    }
    console.log('PASS: all 25 thumbnails load with correct proportions');
    await page.locator('.tile').first().click();
    assert.equal(await page.locator('#viewer').evaluate(dialog => dialog.open), true);
    assert.equal(await page.locator('#close').evaluate(button => button === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#download').evaluate(link => link === document.activeElement), true, 'dialog traps keyboard focus');
    for (let index = 0; index < photos.length; index++) {
      const photo = photos[index];
      await page.locator('#preview').evaluate(image => image.decode());
      assert.equal(await page.locator('#counter').innerText(), `${index + 1} / 25`);
      assert.deepEqual(await page.locator('#preview').evaluate(image => [image.naturalWidth, image.naturalHeight]), [photo.width, photo.height]);
      // Stay below Chromium's ten-downloads-per-second safety limit.
      await page.waitForTimeout(150);
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
      assert.equal(await download.failure(), null);
      assert.equal(download.suggestedFilename(), photo.name + '.webp');
      assert.equal(hash(await fs.readFile(await download.path())), hash(await fs.readFile(path.join(__dirname, '../photos', photo.href))));
      await page.keyboard.press('ArrowRight');
    }
    assert.equal(await page.locator('#counter').innerText(), '1 / 25');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#counter').innerText(), '25 / 25');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#viewer').evaluate(dialog => dialog.open), false);
    assert.equal(await page.locator('.tile').first().evaluate(tile => tile === document.activeElement), true);
    console.log('PASS: 25 full-size previews and actual downloads match supplied files; arrow keys, wrapping, Escape and focus restoration');
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await page.screenshot({ path: '/tmp/799-photos-desktop.png', fullPage: true });

    const mobile = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
    const phone = await mobile.newPage();
    phone.on('pageerror', error => errors.push(error.message));
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [568, 320], [844, 390]]) {
      await phone.setViewportSize({ width, height });
      await phone.goto(base + '/photos/');
      assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `no page overflow at ${width}`);
      await phone.locator('.mobile-nav summary').tap();
      assert.equal(await phone.locator('.mobile-nav a').filter({ hasText: /^Photos$/i }).count(), 1);
      assert.equal(await phone.locator('.mobile-nav a[aria-current=page]').innerText(), 'PHOTOS');
      await phone.locator('.mobile-nav summary').tap();
      const picture = phone.locator('.tile').last();
      await picture.scrollIntoViewIfNeeded();
      const ratio = await picture.locator('img').evaluate(image => image.clientWidth / image.clientHeight);
      assert(Math.abs(ratio - 1.6) < .02, 'mobile thumbnails must not inherit fixed image height');
      await picture.tap();
      await phone.locator('#preview').evaluate(image => image.decode());
      for (const id of ['close', 'prev', 'next', 'download']) {
        const usable = await phone.locator('#' + id).evaluate(element => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return rect.width >= 44 && rect.height >= 44 && rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight && (hit === element || element.contains(hit));
        });
        assert(usable, `${width}x${height}: ${id} is visible, touch-sized and unobstructed`);
      }
      await phone.locator('#next').tap();
      assert.equal(await phone.locator('#counter').innerText(), '1 / 25');
      const [download] = await Promise.all([phone.waitForEvent('download'), phone.locator('#download').tap()]);
      assert.equal(await download.failure(), null);
      if (width === 390) await phone.screenshot({ path: '/tmp/799-photos-mobile-viewer.png' });
      await phone.locator('#close').tap();
      assert.equal(await phone.locator('#viewer').evaluate(dialog => dialog.open), false);
      await phone.evaluate(() => window.scrollTo(0, 0));
      if (width === 390) await phone.screenshot({ path: '/tmp/799-photos-mobile.png' });
    }
    console.log('PASS: five mobile/tablet/landscape sizes, menu, viewer, tap controls and downloads');
    for (const name of pages) {
      await page.goto(base + '/' + name);
      for (const width of [961, 1024, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const link = page.locator('body>nav .links a,body>nav .nav-links a').filter({ hasText: /^Photos$/i });
        assert.equal(await link.count(), 1);
        const nav = await page.locator('body>nav').evaluate(nav => {
          const brand = nav.querySelector('.brand').getBoundingClientRect();
          return { brandHeight: brand.height, right: Math.max(...[...nav.querySelectorAll('a')].map(link => link.getBoundingClientRect().right)) };
        });
        assert(nav.brandHeight < 30 && nav.right <= width, `${name} at ${width}: existing brand stays on one line and links fit`);
      }
      assert.equal(await page.locator('link[href*="gallery.css"],script[src*="gallery.js"]').count(), 0, 'gallery code stays isolated');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('.mobile-nav summary').click();
      const menuLink = page.locator('.mobile-nav a').filter({ hasText: /^Photos$/i });
      assert.equal(await menuLink.count(), 1);
      await menuLink.click();
      assert.equal(new URL(page.url()).pathname, '/photos/');
    }
    console.log('PASS: one Photos entry per desktop/mobile menu on all seven existing pages; desktop header fits and gallery styles/scripts stay isolated');
    const nojs = await browser.newContext({ javaScriptEnabled: false, acceptDownloads: true });
    const fallback = await nojs.newPage();
    await fallback.goto(base + '/photos/');
    const [download] = await Promise.all([fallback.waitForEvent('download'), fallback.locator('.tile').first().click()]);
    assert.equal(download.suggestedFilename(), 'aaron.webp');
    assert.equal(await download.failure(), null);
    await nojs.close();
    assert.deepEqual(errors, []);
    console.log('PASS: downloads work without JavaScript; no page or HTTP errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
