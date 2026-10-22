// Render the game's own engine into a short MP3 for gesture-started mobile playback.
// Requires Playwright, Chromium, and FFmpeg. Run from any working directory.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), '799-detour-audio-'));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.addScriptTag({ path: path.join(root, 'mountain-run/audio.js') });
    const rendered = await page.evaluate(async () => {
      const sampleRate = 44100, duration = 2.2;
      const context = new OfflineAudioContext(1, Math.round(sampleRate * duration), sampleRate);
      const engine = MountainAudio.create(context);
      const update = time => engine.update({ time, speed: 0, running: time < 1.8, audible: true,
        gas: time >= .15 && time < 1.05, brake: false, launch: time >= .15 && time < 1.05, tireLevel: 0 });
      update(0);
      const updates = [];
      for (let step = 1; step < Math.round(duration * 100); step++) {
        const time = step / 100;
        updates.push(context.suspend(time).then(() => { update(time); return context.resume(); }));
      }
      const audio = await context.startRendering();
      await Promise.all(updates);
      return { samples: Array.from(audio.getChannelData(0)), sampleRate };
    });
    const peak = rendered.samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
    if (!(peak > .01) || !rendered.samples.every(Number.isFinite)) throw new Error('Engine render is silent or invalid');
    const gain = .85 / peak;
    const wav = Buffer.alloc(44 + rendered.samples.length * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rendered.sampleRate, 24);
    wav.writeUInt32LE(rendered.sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    rendered.samples.forEach((sample, i) => wav.writeInt16LE(Math.round(sample * gain * 32767), 44 + i * 2));
    const source = path.join(temp, 'rev.wav');
    await fs.writeFile(source, wav);
    await fs.mkdir(path.join(root, 'audio'), { recursive: true });
    const output = path.join(root, 'audio/799-detour-rev-v1.mp3');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source,
      '-af', 'afade=t=in:d=0.02,afade=t=out:st=1.9:d=0.3', '-codec:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1', output]);
    console.log(`Rendered ${output} (${(await fs.stat(output)).size} bytes)`);
  } finally {
    if (browser) await browser.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
