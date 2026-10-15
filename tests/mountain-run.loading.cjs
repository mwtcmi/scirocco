const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'mountain-run/index.html'), 'utf8');

(async () => {
 let release;
 const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/mountain-run/') {
   const cutoff = html.indexOf('<div class="modal"');
   res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' });
   // Stall after the race labels arrive, before the welcome panel exists.
   res.write(html.slice(0, cutoff) + ' '.repeat(4096));
   release = () => res.end(html.slice(cutoff));
   return;
  }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'image/svg+xml');
  res.end(fs.readFileSync(file));
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
 try {
  for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
   const page = await browser.newPage({ viewport: size });
   await page.route('https://scirocco799-leaderboard.mr-mikewhite.workers.dev/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"connected":1}' }));
   await page.goto('http://127.0.0.1:' + server.address().port + '/mountain-run/', { waitUntil: 'commit' });
   await page.waitForFunction(() => document.getElementById('scene'));
   await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
   assert.equal(await page.locator('#modal').count(), 0, 'test must paint before the welcome panel arrives');
   assert.equal(await page.locator('.stage-tag').textContent(), 'PINE MOUNTAINGAMEPLAY V5 · EVENT 1 / 9');
   for (const selector of ['.stage-tag', '.course-map', '#feedback', '#scene']) assert.equal(await page.locator(selector).isVisible(), false, selector + ' must not flash before the start screen');
   assert.equal(await page.locator('html').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(5, 5, 5)');
   await page.screenshot({ path: '/tmp/game-loading-' + size.width + '.png' });
   release(); await page.waitForLoadState();
   await page.locator('#start').click();
   for (const selector of ['.stage-tag', '.course-map', '#scene']) assert.equal(await page.locator(selector).isVisible(), true, selector + ' must appear during play');
   assert.equal(await page.locator('.finish-marker text').textContent(), 'FINISH');
   await page.screenshot({ path: '/tmp/game-finish-flags-' + size.width + '.png' });
   await page.close();
  }
  console.log('PASS: slow streamed loading hides race text and map before the start panel exists; race overlays and Finish flags appear on Start on desktop and mobile.');
 } finally {
  release?.(); await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
