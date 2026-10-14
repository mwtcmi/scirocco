const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the real game in a small DOM harness. Test access is injected in memory only.
function game() {
  const elements = new Map();
  const storage = new Map([['799mountainrunbest', '12']]);
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: (obj, key) => key in obj ? obj[key] : key === 'createLinearGradient' ? () => gradient : () => {} });
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        textContent: '', innerHTML: '', dataset: {},
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
        addEventListener() {}, setAttribute() {}, setPointerCapture() {},
        getContext: () => context,
        getBoundingClientRect: () => ({ width: 960, height: 600 }),
        getTotalLength: () => 100, getPointAtLength: d => ({ x: d, y: d })
      });
    }
    return elements.get(id);
  }
  const sandbox = {
    document: { getElementById: element },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    Image: class { complete = true; naturalWidth = 1536; naturalHeight = 1024; },
    requestAnimationFrame() {}, addEventListener() {}, console
  };
  sandbox.window = sandbox;
  const html = fs.readFileSync(path.join(__dirname, '..', 'mountain-run.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const exposed = `window.gameTest = {
    reset, update, render, togglePause, gates, wildlife, corners, keys, animalLane, playerPosition, project,
    get: () => ({ state, t, dist, speed, lane, apexes, boostUntil, lastMistake, best }),
    set: values => {
      if ('dist' in values) dist=values.dist;
      if ('speed' in values) speed=values.speed;
      if ('lane' in values) lane=values.lane;
      if ('t' in values) t=values.t;
      if ('lastMistake' in values) lastMistake=values.lastMistake;
    }
  };`;
  vm.runInNewContext(script.replace('})();', exposed + '})();'), sandbox);
  return { ...sandbox.gameTest, element, storage };
}

function approach(g, event, lane, speed = 500) {
  g.set({ dist: event.d - 140 - 5, lane, speed });
  g.update(.05);
}

test('chicanes slow contact once, leave a usable alternating gap, and never end a run', () => {
  const g = game(); g.reset();
  assert.equal(g.gates.length, 15);
  g.set({ dist: g.gates[0].d - 140 - 800 }); g.update(.05);
  assert.equal(g.element('feedback').textContent, 'CHICANE · PASS RIGHT', 'warn for the nearest gate, not the opposite gap behind it');
  g.reset();
  assert.ok(g.gates.every((q, i) => i % 3 === 0 || q.side === -g.gates[i - 1].side));
  approach(g, g.gates[0], -.6);
  assert.ok(g.get().speed < 300);
  assert.equal(g.get().state, 'play');
  assert.match(g.element('feedback').textContent, /HAY BALE/);
  const after = g.get().speed; g.update(.05);
  assert.ok(g.get().speed > after, 'contact should not repeat after passing the bale');
  g.reset(); approach(g, g.gates[0], .65);
  assert.ok(g.get().speed > 450, 'the visible gap should allow a clean pass');
  g.reset(); approach(g, g.gates[1], -.65);
  assert.ok(g.get().speed > 450, 'the next gap must be on the opposite side');
});

test('deer, foxes, and rabbits warn on approach and cross once; braking allows them to clear', () => {
  const g = game(); g.reset();
  assert.deepEqual(Array.from(new Set(g.wildlife.map(q => q.kind))).sort(), ['deer', 'fox', 'rabbit']);
  for (const animal of g.wildlife) {
    assert.ok(g.gates.every(q => Math.abs(q.d - animal.d) > 1000), 'crossings should not overlap chicanes');
  }
  const animal = g.wildlife[0];
  g.set({ dist: animal.d - 140 - 1200 }); g.update(.05);
  assert.notEqual(animal.start, null);
  assert.match(g.element('feedback').textContent, /DEER CROSSING/);
  assert.ok(Math.abs(g.animalLane(animal)) > 1, 'warning starts on the shoulder');
  const started = animal.start;
  g.set({ t: started + .6 + animal.duration / 2 - .05 });
  approach(g, animal, 0);
  assert.ok(g.get().speed < 350, 'contact costs speed');
  assert.equal(g.get().state, 'play');
  g.reset();
  animal.start = 0;
  g.set({ t: animal.duration + 1 });
  approach(g, animal, 0);
  assert.ok(g.get().speed > 450, 'a cleared crossing must not cause a phantom collision');
  assert.equal(animal.start, 0, 'crossings must not respawn');
});

test('a controlled apex unlocks acceleration out; full-throttle and grass shortcuts do not', () => {
  const g = game(); g.reset();
  assert.ok(g.corners.length >= 5, 'there must be apex opportunities on the actual road');
  const corner = g.corners[0];
  g.set({ dist: corner.d - 140 - 300, speed: 450, lane: corner.lane });
  g.keys.down = true; g.update(.05); g.keys.down = false;
  assert.equal(corner.braked, true);
  approach(g, corner, corner.lane, 450);
  assert.equal(g.get().apexes, 1);
  assert.ok(g.get().boostUntil > g.get().t);
  g.keys.up = true; g.update(.05);
  assert.ok(g.get().speed > 490, 'exit acceleration should be stronger than normal');
  g.reset(); approach(g, corner, corner.lane, 750);
  assert.equal(g.get().apexes, 0, 'full throttle without a braking approach earns nothing');
  g.reset(); corner.braked = true; g.set({ lastMistake: corner.d - 100 });
  approach(g, corner, corner.lane, 450);
  assert.equal(g.get().apexes, 0, 'recent contact or grass cancels an apex reward');
});

test('a novice can reach the summit despite repeated bales and wildlife; best times use the new rules', () => {
  const g = game(); g.reset(); g.keys.up = true;
  for (let i = 0; i < 12000 && g.get().state === 'play'; i++) g.update(.05);
  assert.equal(g.get().state, 'end');
  assert.equal(g.get().dist, 24000);
  assert.match(g.element('title').innerHTML, /SUMMIT/);
  assert.ok(Number(g.storage.get('799mountainrunbest-v2')) > 12);
  assert.equal(g.storage.get('799mountainrunbest'), '12', 'preserve old times without comparing incompatible rules');
});

test('persistent off-road driving still finishes, and pause/restart resets every course event', () => {
  const g = game(); g.reset();
  for (let i = 0; i < 15000 && g.get().state === 'play'; i++) {
    g.set({ lane: 1.4 }); g.update(.05);
  }
  assert.equal(g.get().state, 'end');
  assert.ok(g.get().t < 750);
  g.reset(); g.keys.up = true; g.update(.05); g.togglePause();
  assert.equal(g.get().state, 'pause'); g.togglePause(); assert.equal(g.get().state, 'play');
  g.reset();
  assert.equal(g.get().apexes, 0); assert.equal(g.get().boostUntil, 0);
  assert.ok(g.gates.every(q => !q.passed && !q.warned));
  assert.ok(g.wildlife.every(q => !q.passed && q.start === null));
  assert.ok(g.corners.every(q => !q.passed && !q.braked));
  assert.ok(Object.values(g.keys).every(v => !v));
  assert.doesNotThrow(() => g.render());
});
