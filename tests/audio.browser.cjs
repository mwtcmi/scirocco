const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const baseURL = process.env.GAME_URL || 'http://127.0.0.1:8000/mountain-run/';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.route('https://scirocco799-leaderboard.mr-mikewhite.workers.dev/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"connected":1}' }));
    await page.goto(baseURL);
    const rendered = await page.evaluate(async () => {
      const sampleRate = 24000, duration = 13;
      const context = new OfflineAudioContext(1, sampleRate * duration, sampleRate);
      const engine = MountainAudio.create(context), shifts = [];
      function sample(time) {
        const gas = time >= 2 && time < 7, brake = time >= 9;
        const speed = time < 2 ? 0 : time < 7 ? (time - 2) * 184 : time < 9 ? 920 - (time - 7) * 120 : Math.max(0, 680 - (time - 9) * 420);
        const state = engine.update({ time, speed, running: time < 11.5, audible: time < 11.5, gas, brake, launch: time >= 2 && time < 2.65, tireLevel: 0 });
        if (state.shift) shifts.push({ time, gear: state.gear, direction: state.shift, rpm: state.rpm });
      }
      sample(0);
      const stops = [];
      for (let i = 1; i < duration * 20; i++) {
        const time = i / 20;
        stops.push(context.suspend(time).then(() => { sample(time); return context.resume(); }));
      }
      const buffer = await context.startRendering(); await Promise.all(stops);
      const pcm = buffer.getChannelData(0);
      function rms(start, end) {
        let sum = 0;
        for (let i = Math.floor(start * sampleRate); i < end * sampleRate; i++) sum += pcm[i] ** 2;
        return Math.sqrt(sum / ((end - start) * sampleRate));
      }
      let bias = 0;
      for (let i = 5 * sampleRate; i < 6 * sampleRate; i++) bias += pcm[i] / sampleRate;
      return { pcm: Array.from(pcm), sampleRate, shifts, idle: rms(.5, 1.5), loaded: rms(5, 6), silent: rms(12, 12.8), bias };
    });
    assert.ok(rendered.idle > .005, 'audible pulsed idle');
    assert.ok(rendered.loaded > rendered.idle * 1.1, 'gas opens the intake and exhaust');
    assert.ok(rendered.silent < .0001, 'pause/end fades every engine layer to silence');
    assert.ok(Math.abs(rendered.bias) < .002, 'exhaust output is centered without a DC offset');
    assert.ok(rendered.pcm.every(Number.isFinite));
    const peak = rendered.pcm.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    assert.ok(peak > .05 && peak < .98, 'useful output level without clipping');
    assert.deepEqual(rendered.shifts.filter(q => q.direction === 'up').map(q => q.gear), [2, 3, 4, 5]);
    assert.equal(rendered.shifts.filter(q => q.direction === 'down').at(-1).gear, 1);
    const wav = Buffer.alloc(44 + rendered.pcm.length * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rendered.sampleRate, 24); wav.writeUInt32LE(rendered.sampleRate * 2, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    rendered.pcm.forEach((v, i) => wav.writeInt16LE(Math.round(v * 32767), 44 + i * 2));
    fs.writeFileSync('/tmp/scirocco-engine-preview.wav', wav);
    console.log('PASS: rendered four-cylinder idle, loaded acceleration, four upshifts, downshifts to first, clean silence and no clipping. Preview: /tmp/scirocco-engine-preview.wav');
    console.log(JSON.stringify({ idle: rendered.idle, loaded: rendered.loaded, silent: rendered.silent, peak, shifts: rendered.shifts }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
