const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const base = (process.env.SITE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const pages = ['index.html', 'racing.html', 'schedule-2027.html', 'car.html', 'michael-white.html', 'paddock.html', 'partners.html'];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
// Each event has its own gallery page under /photos/.
const galleries = [{ path: '/photos/grattan-2026/' }, { path: '/photos/empire-2026/' }];
const downloadName = photo => photo.original || photo.name + '.webp';
// Photo paths are either site-absolute or relative to their gallery page.
const localFile = (gallery, href) => path.join(__dirname, '..', new URL(href, 'http://site' + gallery.path).pathname);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    // The Photos page is an index of event galleries.
    await page.goto(base + '/photos/');
    const cards = await page.locator('.event-card').evaluateAll(links => links.map(link => new URL(link.href).pathname));
    assert.deepEqual(cards, galleries.map(g => g.path), 'the index links every event gallery');
    for (const card of await page.locator('.event-card img').all()) assert.ok(await card.evaluate(async image => { await image.decode(); return image.naturalWidth > 0; }), 'event covers load');
    assert.equal(await page.locator('.site-nav .links a[aria-current=page]').innerText(), 'PHOTOS');
    assert.equal(await page.locator('.site-nav .links a').filter({ hasText: /^Photos$/i }).count(), 1);
    await page.locator('.event-card').first().click();
    assert.equal(new URL(page.url()).pathname, galleries[0].path);
    console.log('PASS: Photos index lists ' + galleries.length + ' event galleries with loading covers');

    for (const gallery of galleries) {
      const url = base + gallery.path;
      await page.goto(url);
      const photos = await page.locator('#photos-data').evaluate(data => JSON.parse(data.textContent));
      const total = photos.length, label = gallery.path;
      assert.ok(total > 0, label + ' has photos');
      assert.equal(await page.locator('.gallery .tile').count(), total, label + ' shows one tile per photo');
      assert.equal(new Set(photos.map(photo => photo.href)).size, total, label + ' photos are distinct');
      assert.equal(await page.locator('.site-nav .links a[aria-current=page]').innerText(), 'PHOTOS');
      assert.equal(await page.locator('.site-nav .links a').filter({ hasText: /^Photos$/i }).count(), 1);
      for (let index = 0; index < total; index++) {
        const tile = page.locator('.tile').nth(index);
        await tile.scrollIntoViewIfNeeded();
        const bounds = await tile.locator('img').evaluate(async image => {
          await image.decode();
          const rect = image.getBoundingClientRect();
          return { width: rect.width, height: rect.height, natural: image.naturalWidth };
        });
        assert(bounds.natural > 0 && Math.abs(bounds.width / bounds.height - 1.6) < .01, label + ': thumbnail uses responsive proportions');
      }
      console.log('PASS: ' + label + ' all ' + total + ' thumbnails load with correct proportions');
      await page.locator('.tile').first().click();
      assert.equal(await page.locator('#viewer').evaluate(dialog => dialog.open), true);
      assert.equal(await page.locator('#close').evaluate(button => button === document.activeElement), true);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('#download').evaluate(link => link === document.activeElement), true, 'dialog traps keyboard focus');
      for (let index = 0; index < total; index++) {
        const photo = photos[index];
        await page.locator('#preview').evaluate(image => image.decode());
        assert.equal(await page.locator('#counter').innerText(), `${index + 1} / ${total}`);
        const natural = await page.locator('#preview').evaluate(image => [image.naturalWidth, image.naturalHeight]);
        if (photo.width) assert.deepEqual(natural, [photo.width, photo.height]); else assert.ok(natural[0] > 0 && natural[1] > 0);
        // Stay below Chromium's ten-downloads-per-second safety limit.
        await page.waitForTimeout(150);
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
        assert.equal(await download.failure(), null);
        assert.equal(download.suggestedFilename(), downloadName(photo));
        assert.equal(hash(await fs.readFile(await download.path())), hash(await fs.readFile(localFile(gallery, photo.href))), label + ': download matches the supplied file');
        await page.keyboard.press('ArrowRight');
      }
      assert.equal(await page.locator('#counter').innerText(), `1 / ${total}`);
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('#counter').innerText(), `${total} / ${total}`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#viewer').evaluate(dialog => dialog.open), false);
      assert.equal(await page.locator('.tile').first().evaluate(tile => tile === document.activeElement), true);
      console.log('PASS: ' + label + ' ' + total + ' full-size previews and actual downloads match supplied files; arrow keys, wrapping, Escape and focus restoration');
    }
    await page.goto(base + '/photos/');
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await page.screenshot({ path: '/tmp/799-photos-desktop.png', fullPage: true });

    const mobile = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
    const phone = await mobile.newPage();
    phone.on('pageerror', error => errors.push(error.message));
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [568, 320], [844, 390]]) {
      await phone.setViewportSize({ width, height });
      await phone.goto(base + '/photos/');
      assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `no index overflow at ${width}`);
      await phone.locator('.mobile-nav summary').tap();
      assert.equal(await phone.locator('.mobile-nav a').filter({ hasText: /^Photos$/i }).count(), 1);
      assert.equal(await phone.locator('.mobile-nav a[aria-current=page]').innerText(), 'PHOTOS');
      await phone.locator('.mobile-nav summary').tap();
      for (const gallery of galleries) {
        await phone.goto(base + gallery.path);
        const total = await phone.locator('.tile').count();
        assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${gallery.path}: no page overflow at ${width}`);
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
          assert(usable, `${gallery.path} ${width}x${height}: ${id} is visible, touch-sized and unobstructed`);
        }
        await phone.locator('#next').tap();
        assert.equal(await phone.locator('#counter').innerText(), `1 / ${total}`);
        const [download] = await Promise.all([phone.waitForEvent('download'), phone.locator('#download').tap()]);
        assert.equal(await download.failure(), null);
        if (width === 390) await phone.screenshot({ path: '/tmp/799-photos-mobile-viewer-' + gallery.path.split('/')[2] + '.png' });
        await phone.locator('#close').tap();
        assert.equal(await phone.locator('#viewer').evaluate(dialog => dialog.open), false);
      }
      if (width === 390) { await phone.goto(base + '/photos/'); await phone.screenshot({ path: '/tmp/799-photos-mobile.png' }); }
    }
    console.log('PASS: five mobile/tablet/landscape sizes, index menu, and each gallery viewer, tap controls and downloads');
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
    for (const gallery of galleries) {
      await fallback.goto(base + gallery.path);
      const first = JSON.parse(await fallback.locator('#photos-data').textContent())[0];
      const [download] = await Promise.all([fallback.waitForEvent('download'), fallback.locator('.tile').first().click()]);
      assert.equal(download.suggestedFilename(), downloadName(first), gallery.path + ' downloads without JavaScript');
      assert.equal(await download.failure(), null);
    }
    await nojs.close();
    assert.deepEqual(errors, []);
    console.log('PASS: downloads work without JavaScript; no page or HTTP errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
