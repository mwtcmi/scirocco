const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { database } = require('./helpers/d1.cjs');
const baseURL = process.env.GAME_URL || 'http://127.0.0.1:8000/mountain-run/';
const API = 'https://scirocco799-leaderboard.mr-mikewhite.workers.dev';
const PROFILE = '799-podium-driver-v1', PENDING = '799-podium-pending-v1';
// Game frames are controlled explicitly; network/UI waits must poll independently.
const wait = (page, predicate, argument) => page.waitForFunction(predicate, argument, { polling: 50 });
(async () => {
 const { createWorker, RULESET } = await import('../leaderboard/worker.mjs');
 const storage = database(); let clock = 1800000000000, failFinishes = false;
 const worker = createWorker({ now: () => clock });
 const env = { DB: storage.db, ALLOWED_ORIGINS: new URL(baseURL).origin };
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
 const errors = [];
 const runCount = () => storage.sqlite.prepare('SELECT COUNT(*) AS n FROM runs WHERE finished_at IS NOT NULL').get().n;
 async function api(path, data, token) {
  const headers = { 'Content-Type': 'application/json' }; if (token) headers.Authorization = 'Bearer ' + token;
  const response = await worker.fetch(new Request(API + path, { method: data ? 'POST' : 'GET', headers, body: data ? JSON.stringify(data) : undefined }), env);
  const body = await response.json(); assert.ok(response.ok, JSON.stringify(body)); return body;
 }
 async function seed(name, ms) {
  const p = await api('/api/players', {}); await api('/api/profile', { name }, p.token);
  const ticket = await api('/api/runs', { eventId: 'pine-mountain', ruleset: RULESET }, p.token);
  clock += ms; await api('/api/runs/' + ticket.runId + '/finish', { timeMs: ms, apexes: 0 }, p.token);
 }
 async function pageFor(size = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport: size, isMobile: size.width < 600, hasTouch: size.width < 600 });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.route(API + '/**', async route => {
   const req = route.request(), path = new URL(req.url()).pathname;
   if (failFinishes && path.endsWith('/finish')) return route.abort('failed');
   const data = req.postData();
   if (path.endsWith('/finish') && data) clock += JSON.parse(data).timeMs + 100;
   const response = await worker.fetch(new Request(req.url(), { method: req.method(), headers: req.headers(), body: ['GET', 'HEAD'].includes(req.method()) ? undefined : data }), env);
   await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  await page.addInitScript(() => {
   window.testNow = 100; window.requestAnimationFrame = cb => { window.testFrame = cb; return 1; };
   window.stepGame = n => { for (let i = 0; i < n; i++) { window.testNow += 50; window.testFrame(window.testNow); } };
   const original = CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
    const m = this.getTransform(), sx = Math.hypot(m.a, m.c); window.testCar = { x: m.e / sx, sceneWidth: this.canvas.width / sx };
    return original.call(this, image, ...args);
   };
   window.driveGame = n => {
    for (let i = 0; i < n; i++) {
     if (!document.getElementById('modal').classList.contains('off')) break;
     const x = window.testCar?.x, center = (window.testCar?.sceneWidth || 960) / 2;
     const f = document.getElementById('feedback'), brake = f.classList.contains('visible') && f.textContent.includes('CROSSING');
     for (const [key, on] of [['ArrowLeft', x > center + 15], ['ArrowRight', x < center - 15], ['ArrowDown', brake], ['ArrowUp', !brake]])
      window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { key }));
     window.stepGame(1);
    }
   };
  });
  await page.goto(baseURL); await wait(page, () => window.testFrame && window.MountainLeaderboard);
  await page.evaluate(() => stepGame(1)); await wait(page, () => window.testCar);
  return page;
 }
 async function start(page) {
  const ticket = page.waitForResponse(r => r.url() === API + '/api/runs' && r.status() === 201);
  await page.locator('#start').click(); await ticket; await page.evaluate(() => stepGame(1));
 }
 async function summit(page) {
  for (let i = 0; i < 18 && !(await page.locator('#modal').isVisible()); i++) await page.evaluate(() => driveGame(500));
  assert.match(await page.locator('#title').innerText(), /FINISH|SEASON/);
  await wait(page, () => document.getElementById('podiumDialog').open);
 }
 async function name(page, value) {
  await page.locator('#driverInput').fill(value); await page.locator('#driverSave').click();
 }
 try {
  await seed('Silver Fox', 120000); await seed('Hill Runner', 150000);
  const a = await pageFor();
  await a.locator('#podiumOpen').focus(); await a.keyboard.press('Space');
  await wait(a, () => document.getElementById('podiumRows').children.length === 2);
  assert.equal(await a.locator('[data-rank="1"] .place-name').innerText(), 'Silver Fox');
  assert.equal(await a.locator('[data-rank="3"] .place-name').innerText(), 'Open spot');
  await a.locator('#podiumClose').click(); await start(a);
  const tickets = storage.sqlite.prepare('SELECT COUNT(*) AS n FROM runs').get().n;
  await a.evaluate(() => stepGame(10)); await a.locator('#podiumOpen').click();
  assert.match(await a.locator('#title').innerText(), /PAUSED/);
  const paused = await a.locator('#time').innerText(); await a.keyboard.press('r'); await a.evaluate(() => stepGame(10));
  assert.equal(await a.locator('#time').innerText(), paused, 'podium input must not restart or drive the game behind the dialog');
  await a.locator('#podiumContinue').click(); await a.locator('#start').click();
  assert.equal(storage.sqlite.prepare('SELECT COUNT(*) AS n FROM runs').get().n, tickets, 'resuming retains its original run ticket');
  await summit(a); assert.equal(await a.locator('#driverForm').isVisible(), true);
  await name(a, 'Mike 799');
  await wait(a, () => document.getElementById('podiumStatus').textContent.includes('YOU TOOK THE CROWN'));
  assert.equal(await a.locator('[data-rank="1"] .place-name').innerText(), 'Mike 799');
  assert.match(await a.locator('[data-rank="1"] .place-time').innerText(), /^\d\d:\d\d\.\d{3}$/);
  assert.equal(await a.evaluate(k => JSON.parse(localStorage.getItem(k)).length, PENDING), 0);
  await a.screenshot({ path: '/tmp/podium-desktop.png' });
  await a.locator('#podiumEvent').selectOption('season');
  await wait(a, () => document.getElementById('podiumSelf').textContent.includes('1 / 9'));
  assert.equal(await a.locator('#podiumRows tr').count(), 0);
  await a.locator('#podiumContinue').click();
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 568, height: 320 }, { width: 844, height: 390 }, { width: 1280, height: 600 }]) {
   await a.setViewportSize(size);
   const fit = await a.evaluate(() => {
    const panel = document.getElementById('gamePanel'), button = document.getElementById('start');
    const p = panel.getBoundingClientRect(), b = button.getBoundingClientRect();
    return { inside: b.top >= p.top && b.bottom <= p.bottom && b.bottom <= innerHeight, scroll: panel.scrollTop, overflow: panel.scrollHeight - panel.clientHeight };
   });
   assert.ok(fit.inside && fit.scroll === 0 && fit.overflow <= 1, size.width + 'x' + size.height + ': Next Event must remain visible without scrolling: ' + JSON.stringify(fit));
  }
  await a.setViewportSize({ width: 1280, height: 900 });
  await a.reload(); await wait(a, () => window.MountainLeaderboard);
  await a.locator('#podiumOpen').click(); assert.match(await a.locator('#podiumDriver').innerText(), /Mike 799/);
  await a.locator('#podiumClose').click();

  const b = await pageFor({ width: 390, height: 844 }); await start(b); await summit(b);
  await name(b, 'mike 799'); await wait(b, () => document.getElementById('nameError').textContent.includes('taken'));
  assert.equal(await b.locator('#driverForm').isVisible(), true);
  await name(b, 'Uno Racer'); await wait(b, () => document.getElementById('podiumStatus').textContent.includes('TIME POSTED') || document.getElementById('podiumStatus').textContent.includes('CROWN'));
  const names = await b.locator('#podiumRows tr td:nth-child(2)').allInnerTexts();
  assert.ok(names.includes('Mike 799') && names.includes('Uno Racer')); assert.equal(new Set(names).size, 4);
  await b.screenshot({ path: '/tmp/podium-mobile.png' });
  for (const size of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 844, height: 390 }]) {
   await b.setViewportSize(size);
   const fit = await b.evaluate(() => {
    const dialog = document.getElementById('podiumDialog').getBoundingClientRect();
    const close = document.getElementById('podiumClose').getBoundingClientRect(), next = document.getElementById('podiumContinue').getBoundingClientRect();
    return dialog.left >= 0 && dialog.right <= innerWidth && dialog.top >= 0 && dialog.bottom <= innerHeight && close.bottom <= innerHeight && next.bottom <= innerHeight && next.top >= 0;
   });
   assert.ok(fit, size.width + 'x' + size.height + ': dialog and fixed close/continue controls must fit');
  }
  await b.locator('#podiumClose').click();

  // A named driver finishes while posting is unavailable, then reloads and retries the same ticket.
  await start(a); failFinishes = true; await summit(a);
  await wait(a, () => document.getElementById('podiumStatus').textContent.includes('waiting to post'));
  assert.equal(await a.evaluate(k => JSON.parse(localStorage.getItem(k)).length, PENDING), 1);
  await a.reload(); await wait(a, () => window.MountainLeaderboard);
  assert.equal(await a.evaluate(k => JSON.parse(localStorage.getItem(k)).name, PROFILE), 'Mike 799');
  failFinishes = false;
  await a.locator('#podiumOpen').click(); await a.locator('#podiumRefresh').click();
  await wait(a, k => JSON.parse(localStorage.getItem(k)).length === 0, PENDING);
  await a.locator('#podiumClose').click();

  const completed = runCount(); await start(a);
  await a.keyboard.down('ArrowRight'); await a.evaluate(() => stepGame(50)); await a.keyboard.up('ArrowRight');
  assert.match(await a.locator('#title').innerText(), /OFF ROAD/);
  assert.equal(await a.locator('#podiumDialog').isVisible(), false); assert.equal(runCount(), completed, 'crashes never publish a score');
  // Qualifying season data uses the same real API; verify the completed season podium rendering.
  const remembered = await a.evaluate(k => JSON.parse(localStorage.getItem(k)), PROFILE);
  for (const eventId of ['spring-weatherly', 'pagoda', 'flag-rock', 'giants-despair', 'duryea', 'waumandee', 'empire', 'shamrock-mountain']) {
   const ticket = await api('/api/runs', { eventId, ruleset: RULESET }, remembered.token);
   clock += 60000; await api('/api/runs/' + ticket.runId + '/finish', { timeMs: 60000, apexes: 2 }, remembered.token);
  }
  await a.locator('#podiumOpen').click(); await a.locator('#podiumEvent').selectOption('season');
  await wait(a, () => document.querySelector('[data-rank="1"] .place-title').textContent === 'SEASON CHAMPION');
  assert.equal(await a.locator('[data-rank="1"] .place-name').innerText(), 'Mike 799');
  assert.match(await a.locator('#podiumSelf').innerText(), /YOU HOLD THE CROWN/);
  await a.screenshot({ path: '/tmp/podium-season.png' });
  const offline = await pageFor();
  await offline.route(API + '/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"connected":1}' }));
  await offline.reload(); await wait(offline, () => window.MountainLeaderboard);
  await offline.locator('#podiumOpen').click();
  await wait(offline, () => document.getElementById('podiumStatus').textContent.includes('temporarily unavailable'));
  assert.equal(await offline.locator('#podiumRows tr').count(), 0, 'the connection-test Worker must not look like a live leaderboard');
  await offline.locator('#podiumClose').click(); await offline.locator('#start').click();
  await offline.evaluate(() => stepGame(30));
  assert.equal(await offline.locator('#modal').isVisible(), false, 'racing remains available before Cloudflare publication');
  assert.deepEqual(errors, []);
  console.log('PASS: real Worker SQL through browser requests; public podiums, two browser identities, unique names, full racing and crown, pause/input isolation, season progress, persistent identity, queued retry after reload, mobile dialogs, and crash exclusion.');
 } finally { await browser.close(); storage.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
