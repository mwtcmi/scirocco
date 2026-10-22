// Phone-sized Chromium checks for native media, Safari recovery paths and tap activation.
// Physical iOS silent-mode routing still requires a device check.
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.SITE_URL || 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--autoplay-policy=user-gesture-required'] });
  try {
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    await context.route('https://scirocco799-leaderboard.mr-mikewhite.workers.dev/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"connected":1}' }));
    await context.addInitScript(() => {
      window.audioProbe = { plays: [], resumes: [], contexts: [], gains: [] };
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        audioProbe.plays.push({ element: this, gesture: navigator.userActivation.isActive, event: window.event?.type });
        if (window.blockNextAudio) { window.blockNextAudio = false; return Promise.reject(new DOMException('Test blocked playback', 'NotAllowedError')); }
        return play.call(this);
      };
      const NativeAudioContext = window.AudioContext;
      window.AudioContext = class extends NativeAudioContext {
        constructor(...args) { super(...args); audioProbe.contexts.push(this); }
        get state() { return window.forceInterrupted ? 'interrupted' : super.state; }
        resume() { audioProbe.resumes.push({ state: this.state, event: window.event?.type }); window.forceInterrupted = false; return super.resume(); }
        createGain() { const gain = super.createGain(); audioProbe.gains.push(gain); return gain; }
      };
      Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' }, configurable: true });
      // Keep the race stationary so audio checks cannot cause a crash by waiting.
      window.requestAnimationFrame = callback => { window.audioTestFrame = callback; return 1; };
    });
    const page = await context.newPage();
    const waitFor = callback => page.waitForFunction(callback, null, { polling: 50 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(base + '/404.html');
    assert.equal(response.status(), 200);
    assert.equal(await page.evaluate(() => audioProbe.plays.length), 0, 'no autoplay on arrival');
    const rev = page.locator('#rev-button'), sound = page.locator('#sound-toggle');
    await rev.tap();
    await waitFor(() => !document.getElementById('rev-audio').paused && document.getElementById('rev-audio').currentTime > .05);
    assert.deepEqual(await page.evaluate(() => audioProbe.plays.map(call => ({ gesture: call.gesture, event: call.event }))), [{ gesture: true, event: 'click' }], 'native play starts directly in the tap handler');
    await sound.tap();
    assert.equal(await page.locator('#rev-audio').evaluate(audio => audio.paused && audio.currentTime === 0), true, 'mute stops and rewinds the clip');
    await waitFor(() => !document.getElementById('rev-button').hasAttribute('aria-disabled'));
    const plays = await page.evaluate(() => audioProbe.plays.length);
    await rev.tap();
    assert.equal(await page.evaluate(() => audioProbe.plays.length), plays, 'muted rev stays silent');
    await sound.tap();
    await waitFor(() => !document.getElementById('rev-audio').paused);
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    assert.equal(await page.locator('#rev-audio').evaluate(audio => audio.paused), true, 'leaving the page stops sound');
    await page.evaluate(() => { window.blockNextAudio = true; });
    await rev.tap();
    await waitFor(() => document.getElementById('sound-label').textContent === 'Try sound');
    await sound.tap();
    await waitFor(() => !document.getElementById('rev-audio').paused && document.getElementById('sound-label').textContent === 'Sound on');
    console.log('PASS: 404 tap playback, immediate mute, muted rev, navigation stop and blocked-playback retry');
    const decoded = await page.evaluate(async () => {
      const context = new AudioContext();
      const clip = await context.decodeAudioData(await (await fetch('/audio/799-detour-rev-v1.mp3')).arrayBuffer());
      const primer = await context.decodeAudioData(await (await fetch('/audio/mobile-unlock-v1.wav')).arrayBuffer());
      const pcm = clip.getChannelData(0), quiet = primer.getChannelData(0);
      const result = { duration: clip.duration, rms: Math.sqrt(pcm.reduce((sum, v) => sum + v * v, 0) / pcm.length),
        peak: pcm.reduce((peak, v) => Math.max(peak, Math.abs(v)), 0), primerPeak: quiet.reduce((peak, v) => Math.max(peak, Math.abs(v)), 0) };
      await context.close(); return result;
    });
    assert(decoded.duration >= 2.1 && decoded.duration <= 2.3);
    assert(decoded.rms > .03 && decoded.peak < 1 && decoded.peak > .5, 'audible, unclipped rev file');
    assert(decoded.primerPeak < .00005, 'media-channel primer is nearly silent');
    console.log('PASS: both audio assets decode; engine is audible and unclipped, primer is nearly silent', JSON.stringify(decoded));

    await page.goto(base + '/mountain-run/');
    assert.equal(await page.evaluate(() => audioProbe.plays.length), 0);
    assert.equal(await page.evaluate(() => audioProbe.contexts.length), 0);
    await page.locator('#eventSelect').selectOption('0');
    await page.locator('#start').tap();
    await waitFor(() => audioProbe.contexts[0]?.state === 'running' && audioProbe.gains[0]?.gain.value > .001);
    assert.equal(await page.evaluate(() => navigator.audioSession.type), 'playback');
    assert.equal(await page.evaluate(() => audioProbe.plays[0].gesture), true);
    assert.equal(await page.evaluate(() => audioProbe.plays[0].event), 'click');
    await waitFor(() => !audioProbe.plays[0].element.paused && audioProbe.plays[0].element.readyState >= 2);
    await page.evaluate(() => { window.forceInterrupted = true; });
    await page.locator('#up').tap();
    assert.equal(await page.evaluate(() => audioProbe.resumes.at(-1).state), 'interrupted', 'tap recovers interrupted Safari audio');
    assert.match(await page.evaluate(() => audioProbe.resumes.at(-1).event), /pointerdown|pointerup/);
    assert.equal(await page.evaluate(() => audioProbe.contexts.length), 1, 'reuses the existing engine');
    await page.locator('#sound').tap();
    assert.equal(await page.evaluate(() => audioProbe.plays[0].element.paused), true);
    await waitFor(() => audioProbe.gains[0].gain.value < .001);
    await page.locator('#sound').tap();
    await waitFor(() => !audioProbe.plays[0].element.paused && audioProbe.gains[0].gain.value > .001);
    await page.locator('#pause').tap();
    assert.equal(await page.evaluate(() => audioProbe.plays[0].element.paused), true);
    await page.locator('#start').tap();
    await waitFor(() => !audioProbe.plays[0].element.paused);
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    await waitFor(() => audioProbe.contexts[0].state === 'suspended');
    assert.equal(await page.evaluate(() => audioProbe.plays[0].element.paused), true);
    await page.locator('#start').tap();
    await waitFor(() => audioProbe.contexts[0].state === 'running' && !audioProbe.plays[0].element.paused);
    console.log('PASS: game tap activation, playback audio session, interrupted-context recovery, mute, pause and page-return recovery');
    assert.deepEqual(errors, []);
    console.log('PASS: no JavaScript errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
