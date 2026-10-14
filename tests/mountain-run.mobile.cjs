const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const baseURL = process.env.GAME_URL || 'http://127.0.0.1:8000/mountain-run.html';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) { super(...args); window.testAudio = this; }
      createGain() { const gain = super.createGain(); window.testGain = gain; return gain; }
    };
    window.testNow = 100;
    window.requestAnimationFrame = cb => { window.testFrame = cb; return 1; };
    window.stepGame = n => { for (let i = 0; i < n; i++) { window.testNow += 50; window.testFrame(window.testNow); } };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(im, ...args) {
      const m = this.getTransform(), scaleX = Math.hypot(m.a, m.c);
      window.testCar = { x: m.e / scaleX, sceneWidth: this.canvas.width / scaleX, args };
      return draw.call(this, im, ...args);
    };
  });
  await page.goto(baseURL);
  await page.waitForFunction(() => window.testFrame && performance.getEntriesByType('resource').some(r => r.name.includes('799-scirocco-rear.svg')));
  await page.evaluate(() => stepGame(1));
  assert.match(await page.locator('#sound').innerText(), /SOUND ON/);
  const bounds = {};
  for (const id of ['left', 'right', 'up', 'down']) {
    bounds[id] = await page.locator(`#${id}`).boundingBox();
    assert.ok(bounds[id].width >= 56 && bounds[id].height >= 64, `${id} must be thumb-sized`);
  }
  assert.ok(bounds.right.x + bounds.right.width < bounds.down.x, 'steering and pedals must be separated');
  assert.equal(await page.locator('.hud').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 3);
  assert.equal(await page.locator('.touch-note').isVisible(), true);
  assert.equal(await page.locator('.keyboard-note').isVisible(), false);
  assert.equal(await page.evaluate(() => Math.round(testCar.sceneWidth)), 780, 'portrait uses a closer camera');
  assert.ok(await page.locator('#scene').evaluate(c => c.width <= c.clientWidth * 2 + 1), 'backing resolution should be capped for phones');
  await page.screenshot({ path: '/tmp/gameplay-mobile-welcome.png' });
  await page.locator('#start').tap();
  await page.waitForFunction(() => window.testAudio?.state === 'running' && window.testGain?.gain.value > 0, null, { polling: 50 });
  const cdp = await page.context().newCDPSession(page);
  const point = (box, id) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2, id, force: 1 });
  const gas = point(bounds.up, 1), right = point(bounds.right, 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [gas] });
  await page.evaluate(() => stepGame(20));
  assert.ok(parseInt(await page.locator('#speed').innerText()) > 90, 'holding gas should accelerate');
  const before = await page.evaluate(() => testCar.x);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [gas, right] });
  await page.evaluate(() => stepGame(4));
  assert.ok((await page.evaluate(() => testCar.x)) > before + 30, 'steering must work while another finger holds gas');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.evaluate(() => stepGame(20));
  assert.ok(parseInt(await page.locator('#speed').innerText()) < 80, 'lifting fingers must release the controls');
  assert.equal(await page.locator('#modal').getAttribute('class'), 'modal off');
  await page.screenshot({ path: '/tmp/gameplay-mobile-touch.png' });
  await page.keyboard.press('r');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [gas] });
  await page.evaluate(() => stepGame(20));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.evaluate(() => stepGame(20));
  assert.ok(parseInt(await page.locator('#speed').innerText()) < 80, 'an interrupted touch must not stick');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => stepGame(1));
  assert.match(await page.locator('#title').innerText(), /PAUSED/, 'rotation should pause the race');
  const footer = await page.locator('.controls').boundingBox();
  assert.ok(footer.y + footer.height <= 390);
  for (const id of ['left', 'right', 'up', 'down', 'sound', 'pause']) {
    const box = await page.locator(`#${id}`).boundingBox();
    assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= 844, `${id} should remain reachable in landscape`);
  }
  assert.equal(await page.evaluate(() => Math.round(testCar.sceneWidth)), 1920, 'landscape camera keeps the road visible above the car');
  await page.locator('#start').tap();
  await page.evaluate(() => stepGame(1));
  await page.screenshot({ path: '/tmp/gameplay-mobile-landscape.png' });
  await page.locator('#sound').tap();
  assert.match(await page.locator('#sound').innerText(), /SOUND OFF/);
  await page.waitForFunction(() => window.testGain.gain.value < .001, null, { polling: 50 });
  assert.deepEqual(errors, []);
  console.log('PASS: phone layout, enlarged targets, simultaneous trusted touches, release/cancel, default audio from a tap, rotation pause, landscape camera and controls; no page or HTTP errors.');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
