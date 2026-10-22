const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../mountain-run/audio.js'), 'utf8');

function setup(navigator = {}, rejectMedia = false) {
  const media = [], calls = [];
  const scope = { navigator, Audio: class {
    constructor(src) { this.src = src; this.paused = true; media.push(this); }
    play() { this.paused = false; calls.push('media-play'); return rejectMedia ? Promise.reject(new Error('blocked')) : Promise.resolve(); }
    pause() { this.paused = true; calls.push('media-pause'); }
  } };
  vm.runInNewContext(source, scope);
  const context = {
    state: 'suspended', sampleRate: 44100, destination: {},
    resume() { calls.push('resume'); this.state = 'running'; return Promise.resolve(); },
    createBuffer: (...args) => args,
    createBufferSource: () => ({ connect() {}, disconnect() {}, start() { calls.push('source-start'); } })
  };
  return { ...scope.MountainAudio, context, media, calls, navigator };
}

test('iPhone unlock starts native media and resumes Web Audio synchronously in the gesture', () => {
  const audio = setup({ userAgent: 'Mozilla/5.0 (iPhone)', audioSession: { type: 'auto' } });
  assert.equal(audio.media.length, 0, 'no playback before an interaction');
  audio.unlock(audio.context);
  assert.deepEqual(audio.calls, ['media-play', 'resume', 'source-start']);
  assert.equal(audio.navigator.audioSession.type, 'playback');
  assert.equal(audio.media[0].src, '/audio/mobile-unlock-v1.wav');
  assert.equal(audio.media[0].loop, true);
  audio.unlock(audio.context);
  assert.equal(audio.calls.length, 3, 'do not stack running playback or restart the context on every control tap');
  audio.stopPlayback();
  assert.equal(audio.media[0].paused, true);
  audio.context.state = 'interrupted';
  audio.unlock(audio.context);
  assert.deepEqual(audio.calls.slice(-3), ['media-play', 'resume', 'source-start'], 'recover the existing interrupted context');
  assert.equal(audio.media.length, 1, 'reuse the same native media element');
});

test('iPad desktop user agent uses the Apple touch workaround without requiring Audio Session API support', () => {
  const audio = setup({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 });
  audio.unlock(audio.context);
  assert.equal(audio.media.length, 1);
  audio.stopPlayback();
  assert.equal(audio.media[0].paused, true);
});

test('Android and desktop unlock suspended or interrupted contexts without creating a media loop', () => {
  for (const userAgent of ['Mozilla/5.0 (Linux; Android 15)', 'Mozilla/5.0 (Windows NT 10.0)']) {
    const audio = setup({ userAgent });
    audio.unlock(audio.context);
    assert.equal(audio.media.length, 0);
    audio.context.state = 'interrupted';
    audio.unlock(audio.context);
    assert.equal(audio.calls.filter(call => call === 'resume').length, 2);
    audio.context.state = 'closed';
    audio.unlock(audio.context);
    assert.equal(audio.calls.filter(call => call === 'resume').length, 2);
  }
});

test('a rejected native-media attempt does not prevent Web Audio recovery and can be retried', async () => {
  const audio = setup({ userAgent: 'iPhone' }, true);
  audio.unlock(audio.context);
  await Promise.resolve();
  assert.equal(audio.context.state, 'running');
  audio.stopPlayback();
  audio.unlock(audio.context);
  await Promise.resolve();
  assert.equal(audio.media.length, 1);
  assert.equal(audio.calls.filter(call => call === 'media-play').length, 2);
});

test('native channel changes recover Web Audio without reviving audio after a pause', async () => {
  const audio = setup({ userAgent: 'iPhone' });
  audio.unlock(audio.context);
  audio.context.state = 'interrupted';
  await Promise.resolve();
  assert.equal(audio.context.state, 'running', 'recover when native media interrupts the initial context');
  audio.stopPlayback();
  audio.unlock(audio.context);
  audio.stopPlayback();
  audio.context.state = 'interrupted';
  await Promise.resolve();
  assert.equal(audio.context.state, 'interrupted', 'a pending native play must not resume after pausing or muting');
});
