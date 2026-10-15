const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'mountain-run/index.html'), 'utf8');
const redirect = fs.readFileSync(path.join(root, 'mountain-run.html'), 'utf8');
const car = fs.readFileSync(path.join(root, 'images/799-scirocco-rear.svg'));

(async () => {
 let release;
 const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost'), pathname = url.pathname;
  if (pathname === '/launch') {
   res.setHeader('Content-Type', 'text/html');
   res.end('<html style="background:#050505;color-scheme:dark"><body><a style="color:white" href="' + url.searchParams.get('target') + '">Play the Game</a></body></html>'); return;
  }
  if (pathname === '/mountain-run.html' || pathname === '/mountain-run') {
   res.setHeader('Content-Type', 'text/html'); res.end(redirect); return;
  }
  if (pathname === '/mountain-run/') {
   const send = () => {
    const cutoff = html.indexOf('<div class="modal"');
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' });
    // Stall after the header and race labels arrive, before the welcome panel exists.
    res.write(html.slice(0, cutoff) + ' '.repeat(4096));
    release = () => res.end(html.slice(cutoff));
   };
   send();
   return;
  }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'image/svg+xml');
  res.end(fs.readFileSync(file));
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const base = 'http://127.0.0.1:' + server.address().port;
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
 try {
  // Inspect what the redirect can paint, with navigation disabled in memory only.
  const fallback = await browser.newPage();
  await fallback.setContent(redirect.replace(/<script>[\s\S]*?<\/script>/, '').replace(/<meta http-equiv="refresh"[^>]*>/, ''));
  assert.equal(await fallback.locator('body').innerText(), '', 'the redirect must not display its two fallback links with JavaScript enabled');
  assert.equal(await fallback.locator('html').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(5, 5, 5)');
  await fallback.close();
  for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
   for (const target of ['/mountain-run/', '/mountain-run.html', '/mountain-run']) {
    const page = await browser.newPage({ viewport: size });
    await page.route('https://scirocco799-leaderboard.mr-mikewhite.workers.dev/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"connected":1}' }));
    const images = [];
    await page.route('**/images/799-scirocco-rear.svg*', route => { images.push(route); });
    const launcher = base + '/launch?target=' + encodeURIComponent(target);
    await page.goto(launcher);
    await page.getByRole('link', { name: 'Play the Game', exact: true }).click({ noWaitAfter: true });
    await page.waitForFunction(() => document.getElementById('scene'));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.locator('#modal').count(), 0, 'test must paint before the welcome panel arrives');
    for (const selector of ['.bar', '.stage-tag', '.course-map', '#feedback', '#scene']) assert.equal(await page.locator(selector).isVisible(), false, selector + ' must not flash before the start screen');
    assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(5, 5, 5)');
    release(); await page.waitForLoadState('domcontentloaded');
    assert.equal(await page.locator('#start').isVisible(), false, 'partial welcome content stays hidden while the car image loads');
    assert.ok(images.length > 0);
    for (const image of images) await image.fulfill({ status: 200, contentType: 'image/svg+xml', body: car });
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-loading'));
    assert.equal(await page.locator('#start').isVisible(), true);
    assert.equal(await page.locator('#podiumOpen').isVisible(), true, 'controls must initialize before the welcome screen appears');
    assert.equal(await page.locator('.hero-car').evaluate(el => el.complete && el.naturalWidth > 0), true);
    assert.equal(await page.locator('.stage-tag').isVisible(), false);
    await page.screenshot({ path: '/tmp/game-loading-complete-' + size.width + '.png' });
    await page.locator('#start').click();
    for (const selector of ['.stage-tag', '.course-map', '#scene']) assert.equal(await page.locator(selector).isVisible(), true, selector + ' must appear during play');
    assert.equal(await page.locator('.finish-marker text').textContent(), 'FINISH');
    await page.goBack(); assert.equal(page.url(), launcher, 'Back returns home without an intermediate redirect page');
    await page.close();
   }
  }
  // An unavailable welcome image must not trap the player behind a hidden page.
  const failedImage = await browser.newPage();
  await failedImage.route('**/images/799-scirocco-rear.svg*', route => route.abort());
  await failedImage.goto(base + '/mountain-run/', { waitUntil: 'commit' });
  await failedImage.waitForFunction(() => document.getElementById('scene')); release();
  await failedImage.waitForFunction(() => !document.documentElement.hasAttribute('data-loading'));
  assert.equal(await failedImage.locator('#start').isVisible(), true); await failedImage.close();
  console.log('PASS: homepage links, extensionless and legacy redirects, slow streamed HTML and delayed car images reveal one complete welcome screen; Back, failed-image recovery, and Start work on desktop and mobile.');
 } finally {
  release?.(); await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
