const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the real game in a small DOM harness. Test access is injected in memory only.
function game() {
  const elements = new Map();
  const storage = new Map([['799mountainrunbest', '12'], ['799mountainrunbest-v2', '15'], ['799mountainrunbest-v3', '17']]);
  const gradient = { addColorStop() {} };
  const context = new Proxy({}, { get: (obj, key) => key in obj ? obj[key] : ['createLinearGradient', 'createRadialGradient'].includes(key) ? () => gradient : () => {} });
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
    reset, update, render, togglePause, gates, wildlife, corners, potholes, keys, animalLane, playerPosition, project, path, roadDeparture, GOAL, ROAD, CAR_AHEAD, CAR_HALF_WIDTH, ROAD_LINE_INSET, ANIMAL_WAIT,
    get: () => ({ state, t, dist, speed, lane, apexes, animalHits, boostUntil, skidUntil, skidDirection, best }),
    set: values => {
      if ('dist' in values) dist=values.dist;
      if ('speed' in values) speed=values.speed;
      if ('lane' in values) lane=values.lane;
      if ('t' in values) t=values.t;
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
  assert.equal(g.get().animalHits, 0, 'hay-bale contact must not count as a wildlife hit');
  assert.match(g.element('feedback').textContent, /HAY BALE/);
  const after = g.get().speed; g.update(.05);
  assert.ok(g.get().speed > after, 'contact should not repeat after passing the bale');
  g.reset(); approach(g, g.gates[0], .65);
  assert.ok(g.get().speed > 450, 'the visible gap should allow a clean pass');
  g.reset(); approach(g, g.gates[1], -.65);
  assert.ok(g.get().speed > 450, 'the next gap must be on the opposite side');
});

test('sparse potholes can be avoided and slow a hit only once without ending the run', () => {
  const g = game();
  assert.ok(g.potholes.length > 0 && g.potholes.length <= 3, 'keep surface hazards rare');
  for (const [i, hole] of g.potholes.entries()) {
    if (i) assert.ok(hole.d - g.potholes[i - 1].d > 5000, 'leave long clear sections between potholes');
    assert.ok(g.gates.every(q => Math.abs(q.d - hole.d) >= 650), 'keep potholes out of chicanes');
    assert.ok(g.wildlife.every(q => Math.abs(q.d - hole.d) >= 550), 'keep crossings clear');
    assert.ok(g.corners.every(q => Math.abs(q.d - hole.d) >= 650), 'leave room to collect apexes');
    g.reset(); g.keys.up = true;
    approach(g, hole, hole.lane, 750);
    assert.ok(g.get().speed > 500 && g.get().speed < 650, 'a hit should be a modest speed penalty');
    assert.equal(g.get().state, 'play'); assert.equal(g.get().animalHits, 0);
    assert.match(g.element('feedback').textContent, /POTHOLE/);
    const slowed = g.get().speed; g.update(.05);
    assert.ok(g.get().speed > slowed, 'resume accelerating rather than colliding repeatedly');
    g.reset(); g.keys.up = true;
    approach(g, hole, hole.lane > 0 ? -.65 : .65, 750);
    assert.ok(g.get().speed > 700, 'driving around the visible hole should avoid the penalty');
    assert.equal(g.get().state, 'play');
    g.reset(); g.keys.up = true;
    approach(g, hole, hole.lane, 900);
    assert.ok(g.get().speed < 700, 'detect contact even when a fast frame crosses the hole');
  }
  g.reset(); g.keys.up = true;
  approach(g, g.corners[0], g.corners[0].lane, 750);
  assert.ok(g.get().boostUntil > g.get().t);
  approach(g, g.potholes[0], g.potholes[0].lane, 750);
  assert.equal(g.get().boostUntil, 0, 'hitting a pothole should interrupt the boost');
  g.reset();
  assert.ok(g.potholes.every(q => !q.passed), 'replay restores every surface hazard');
});

test('pothole skids drift briefly, allow counter-steering, settle sooner with braking and freeze on pause', () => {
  function hit() {
    const g = game(); g.reset(); g.keys.up = true;
    approach(g, g.potholes[0], g.potholes[0].lane + .05, 750);
    return g;
  }
  const skid = hit(), ordinary = game(); ordinary.reset();
  const impact = skid.get();
  ordinary.set({ dist: impact.dist, lane: impact.lane, speed: impact.speed, t: impact.t });
  ordinary.keys.up = true;
  assert.ok(impact.skidUntil > impact.t && impact.skidUntil - impact.t < 1, 'loss of grip should be brief');
  for (let i = 0; i < 4; i++) { skid.update(.05); ordinary.update(.05); }
  assert.ok((skid.get().lane - ordinary.get().lane) * impact.skidDirection > .03, 'the impact should push the car sideways');
  const corrected = hit(), uncorrected = hit();
  corrected.keys.left = corrected.get().skidDirection > 0;
  corrected.keys.right = corrected.get().skidDirection < 0;
  for (let i = 0; i < 4; i++) { corrected.update(.05); uncorrected.update(.05); }
  assert.ok((uncorrected.get().lane - corrected.get().lane) * impact.skidDirection > .08, 'counter-steering must still work during a skid');
  const braking = hit(), coasting = hit(); braking.keys.down = true;
  for (let i = 0; i < 7; i++) { braking.update(.05); coasting.update(.05); }
  assert.ok(braking.get().skidUntil <= braking.get().t, 'braking helps the car settle sooner');
  assert.ok(coasting.get().skidUntil > coasting.get().t, 'the unbraked skid lasts longer');
  const paused = hit(); paused.togglePause(); const frozen = paused.get(); paused.update(.5);
  assert.equal(paused.get().skidUntil, frozen.skidUntil); assert.equal(paused.get().t, frozen.t);
  paused.togglePause();
  for (let i = 0; i < 12; i++) paused.update(.05);
  assert.ok(paused.get().skidUntil <= paused.get().t, 'grip must recover automatically');
  assert.equal(paused.get().state, 'play');
  paused.reset(); assert.equal(paused.get().skidUntil, 0); assert.equal(paused.get().skidDirection, 0);
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
  g.set({ t: started + g.ANIMAL_WAIT + animal.duration / 2 - .05 });
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

test('apex markers sit at the inside edge of actual corners and boost a full-speed touch', () => {
  const g = game(); g.reset();
  assert.ok(g.corners.length >= 5, 'there must be apex opportunities on the actual road');
  for (const corner of g.corners) {
    assert.ok(g.gates.every(q => Math.abs(q.d - corner.d) >= 650), 'give the player room to reach an apex after a chicane');
    const entryHeading = Math.atan2(g.path(corner.d) - g.path(corner.d - 200), 200);
    const exitHeading = Math.atan2(g.path(corner.d + 200) - g.path(corner.d), 200);
    assert.equal(Math.sign(corner.lane), Math.sign(exitHeading - entryHeading), 'the marker must be on the inside of the turn');
    assert.ok(Math.abs(corner.lane) >= .75 && Math.abs(corner.lane) < 1, 'markers belong beside the inside road edge');
    const turning = d => Math.abs(g.path(d + 200) - 2 * g.path(d) + g.path(d - 200));
    assert.ok(turning(corner.d) >= turning(corner.d - 60) && turning(corner.d) >= turning(corner.d + 60), 'do not shift an apex away from its corner');
  }
  const corner = g.corners[0];
  g.keys.up = true;
  approach(g, corner, corner.lane, 750);
  assert.equal(g.get().apexes, 1, 'full throttle without braking should earn the reward');
  assert.ok(g.get().speed >= 880, 'hitting the apex must increase speed immediately');
  assert.ok(g.get().boostUntil > g.get().t);
  assert.match(g.element('feedback').textContent, /SPEED BOOST/);
  g.update(.05);
  assert.equal(g.get().apexes, 1, 'each marker can reward only once per run');
});

test('brushing a marker is enough, coasting gets boosted, and a missed marker earns nothing', () => {
  const g = game(); g.reset(); const corner = g.corners[0];
  approach(g, corner, corner.lane - Math.sign(corner.lane) * .3, 500);
  assert.equal(g.get().apexes, 1, 'any part of the car may touch the marker');
  assert.ok(g.get().speed > 600, 'coasting also gets an immediate speed increase');
  const boosted = g.get().speed; g.update(.05);
  assert.ok(g.get().speed > boosted, 'the boost should accelerate without holding the gas');
  g.keys.down = true; g.update(.05);
  assert.ok(g.get().speed < boosted, 'braking must still override boost acceleration');
  g.reset(); approach(g, corner, 0, 750);
  assert.equal(g.get().apexes, 0, 'driving down the middle should not collect an inside-edge marker');
  g.reset(); approach(g, g.gates[0], -.6);
  approach(g, corner, corner.lane, 500);
  assert.equal(g.get().apexes, 1, 'hay contact must not silently disqualify a later marker');
});

test('chicane gaps leave steering time and wildlife crosses briskly after its warning', () => {
  const g = game();
  for (let i = 1; i < g.gates.length; i++) assert.ok(g.gates[i].d - g.gates[i - 1].d >= 1000);
  for (const animal of g.wildlife) {
    assert.ok(animal.duration <= 2, 'crossings should take at most two seconds');
    animal.start = 0; g.set({ t: 0 });
    assert.ok(Math.abs(g.animalLane(animal)) > 1, 'the warning begins on the shoulder');
    g.set({ t: g.ANIMAL_WAIT + animal.duration / 2 });
    assert.ok(Math.abs(g.animalLane(animal)) < .01, 'the animal should be halfway across at half duration');
    g.set({ t: g.ANIMAL_WAIT + animal.duration });
    assert.equal(g.animalLane(animal), -animal.side * 1.5, 'the crossing must finish on the other shoulder');
  }
});

test('a driven run finishes the longer course and saves a personal best under the new rules', () => {
  const g = game(); g.reset();
  assert.equal(g.GOAL, 30000, 'extend the climb by 25 percent');
  for (let i = 0; i < 12000 && g.get().state === 'play'; i++) {
    const run = g.get();
    g.keys.left = run.lane > .06; g.keys.right = run.lane < -.06;
    g.keys.down = g.wildlife.some(q => q.start !== null && !q.passed && run.t < q.start + g.ANIMAL_WAIT + q.duration);
    g.keys.up = !g.keys.down;
    g.update(.05);
  }
  assert.equal(g.get().state, 'end');
  assert.equal(g.get().dist, 30000);
  assert.match(g.element('title').innerHTML, /SUMMIT/);
  assert.ok(Number(g.storage.get('799mountainrunbest-v4')) > 17);
  assert.equal(g.storage.get('799mountainrunbest-v3'), '17');
  assert.equal(g.storage.get('799mountainrunbest-v2'), '15');
  assert.equal(g.storage.get('799mountainrunbest'), '12', 'preserve earlier records without comparing different courses');
});

test('crash only after three-quarters of the car is outside either road edge', () => {
  const g = game();
  for (const side of [-1, 1]) {
    for (const fraction of [.25, .6, .74, .76]) {
      g.reset();
      const roadHalf = g.ROAD * g.project(g.CAR_AHEAD).scale / 2;
      const whiteLine = roadHalf - g.ROAD_LINE_INSET * g.project(g.CAR_AHEAD).scale;
      const offset = whiteLine + g.CAR_HALF_WIDTH * (2 * fraction - 1);
      g.set({ lane: side * offset / roadHalf });
      assert.ok(Math.abs(g.roadDeparture() - fraction) < .0001);
      g.update(0);
      if (fraction < .75) assert.equal(g.get().state, 'play', 'partial excursions must be allowed');
      else {
        assert.equal(g.get().state, 'end');
        assert.match(g.element('title').innerHTML, /OFF ROAD/);
        assert.equal(g.storage.get('799mountainrunbest-v4'), undefined, 'a crash is not a finish');
        const stopped = g.get(); g.update(.05);
        assert.equal(g.get().dist, stopped.dist); assert.equal(g.get().t, stopped.t);
      }
    }
  }
});

test('two wildlife contacts are survivable; a third ends the run, and replay clears the count', () => {
  const g = game(); g.reset();
  for (let i = 0; i < 3; i++) {
    const animal = g.wildlife[i];
    animal.start = g.get().t - g.ANIMAL_WAIT - animal.duration / 2 + .05;
    approach(g, animal, 0);
    assert.equal(g.get().animalHits, i + 1);
    assert.equal(g.get().state, i < 2 ? 'play' : 'end');
  }
  assert.match(g.element('msg').innerHTML, /THREE WILDLIFE HITS/);
  assert.equal(g.storage.get('799mountainrunbest-v4'), undefined);
  g.reset();
  assert.equal(g.get().animalHits, 0); assert.equal(g.get().state, 'play');
});

test('pause freezes the run and restart clears every event, hit, and bonus', () => {
  const g = game(); g.reset();
  g.keys.up = true; g.update(.05); g.togglePause();
  assert.equal(g.get().state, 'pause');
  const paused = g.get(); g.update(.05);
  assert.equal(g.get().dist, paused.dist); assert.equal(g.get().t, paused.t);
  g.togglePause(); assert.equal(g.get().state, 'play');
  g.reset();
  assert.equal(g.get().apexes, 0); assert.equal(g.get().boostUntil, 0); assert.equal(g.get().animalHits, 0);
  assert.ok(g.gates.every(q => !q.passed && !q.warned));
  assert.ok(g.wildlife.every(q => !q.passed && q.start === null));
  assert.ok(g.corners.every(q => !q.passed));
  assert.ok(g.potholes.every(q => !q.passed));
  assert.ok(Object.values(g.keys).every(v => !v));
  assert.doesNotThrow(() => g.render());
});
