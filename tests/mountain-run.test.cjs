const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the real game in a small DOM harness. Test access is injected in memory only.
function game(saved = [], chooseDefault = true) {
  const elements = new Map();
  const storage = new Map([['799mountainrunbest', '12'], ['799mountainrunbest-v2', '15'], ['799mountainrunbest-v3', '17'], ['799mountainrunbest-v4', '19'], ['799mountainrunbest-v5-pine-mountain', '42'], ...saved]);
  const gradient = { addColorStop() {} };
  const drawnText = [];
  const context = new Proxy({fillText: value => drawnText.push(value)}, { get: (obj, key) => key in obj ? obj[key] : ['createLinearGradient', 'createRadialGradient'].includes(key) ? () => gradient : () => {} });
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        textContent: '', innerHTML: '', dataset: {},
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c) },
        focus() {}, addEventListener() {}, setAttribute() {}, setPointerCapture() {},
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
  const html = fs.readFileSync(path.join(__dirname, '..', 'mountain-run', 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const exposed = `window.gameTest = {
    reset, update, render, togglePause, openSeason, selectEvent, nextEvent, seasonCount, scoreKey, EVENTS, event, gates, wildlife, corners, potholes, keys, animalLane, playerPosition, project, path, roadDeparture, GOAL, ROAD, CAR_AHEAD, CAR_HALF_WIDTH, ROAD_LINE_INSET, ANIMAL_WAIT,
    get: () => ({ state, t, dist, speed, lane, apexes, animalHits, boostUntil, skidUntil, skidDirection, foxSlowUntil, eventIndex, won, best }),
    set: values => {
      if ('dist' in values) dist=values.dist;
      if ('speed' in values) speed=values.speed;
      if ('lane' in values) lane=values.lane;
      if ('t' in values) t=values.t;
    }
  };`;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../mountain-run/courses.js'), 'utf8'), sandbox);
  vm.runInNewContext(script.replace('})();', exposed + '})();'), sandbox);
  if (chooseDefault) sandbox.gameTest.selectEvent(0);
  return { ...sandbox.gameTest, element, storage, drawnText };
}

function approach(g, event, lane, speed = 500) {
  g.set({ dist: event.d - 140 - 5, lane, speed });
  g.update(.05);
}

test('chicanes slow contact once, leave a usable alternating gap, and never end a run', () => {
  const g = game(); g.reset();
  assert.equal(g.gates.length, 12);
  g.set({ dist: g.gates[0].d - 140 - 800 }); g.update(.05);
  assert.doesNotMatch(g.element('feedback').textContent, /CHICANE|PASS LEFT|PASS RIGHT/, 'hay gates do not add direction notifications');
  g.render(); assert.ok(g.drawnText.every(text => !/PASS LEFT|PASS RIGHT/.test(text)), 'no floating hay-bale directions');
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

test('a deer collision ends the run immediately; a cleared crossing stays safe', () => {
  const g = game(); g.reset(); const deer = g.wildlife.find(q => q.kind === 'deer');
  g.set({ dist: deer.d - g.CAR_AHEAD - 1200 }); g.update(.05);
  assert.notEqual(deer.start, null); assert.match(g.element('feedback').textContent, /DEER CROSSING/);
  deer.start = g.get().t - g.ANIMAL_WAIT - deer.duration / 2 + .05;
  approach(g, deer, 0);
  assert.equal(g.get().state, 'end'); assert.match(g.element('title').innerHTML, /DEER HIT/);
  assert.equal(g.storage.get(g.scoreKey()), undefined, 'a deer crash must not save a finish');
  g.reset(); deer.start = 0; g.set({ t: deer.duration + 1 }); approach(g, deer, 0);
  assert.equal(g.get().state, 'play'); assert.ok(g.get().speed > 450);
});

test('foxes nearly stop the car, interrupt boosts, and never use a three-hit game-over rule', () => {
  const g = game(); const fox = g.wildlife.find(q => q.kind === 'fox');
  g.reset(); g.keys.up = true; approach(g, g.corners[0], g.corners[0].lane, 750);
  for (let i = 0; i < 3; i++) {
    fox.passed = false; fox.start = g.get().t - g.ANIMAL_WAIT - fox.duration / 2 + .05;
    approach(g, fox, 0, 750);
    assert.equal(g.get().state, 'play'); assert.ok(g.get().speed <= 45, 'fox contact should leave the car near a standstill');
    assert.equal(g.get().boostUntil, 0);
  }
  for (let i = 0; i < 12; i++) { g.set({ lane: 0 }); g.update(.05); }
  assert.ok(g.get().speed < 60, 'do not instantly accelerate out of the slowdown');
  for (let i = 0; i < 35; i++) { g.set({ lane: 0 }); g.update(.05); }
  assert.ok(g.get().speed > 300, 'normal acceleration must return');
  g.reset(); assert.equal(g.get().foxSlowUntil, 0);
});

test('Uno is named, clears the road quickly and is always safe even at the collision plane', () => {
  const g = game(); g.reset(); const uno = g.wildlife.find(q => q.kind === 'rabbit');
  assert.equal(uno.name, 'Uno');
  g.set({ dist: uno.d - g.CAR_AHEAD - 1400, speed: 960 }); g.update(.05);
  assert.notEqual(uno.start, null, 'give Uno enough warning distance to escape');
  for (const speed of [250, 750, 960]) {
    g.reset(); uno.start = g.get().t - g.ANIMAL_WAIT - uno.duration / 2 + .05;
    approach(g, uno, 0, speed);
    assert.equal(g.get().state, 'play'); assert.equal(g.get().animalHits, 0);
    assert.ok(Math.abs(g.animalLane(uno)) > 1, 'Uno is already safely beyond the road');
    assert.ok(g.get().speed > speed * .85, 'Uno must not cause a slowdown');
  }
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
  const later = g.corners.find(q => q.d > g.gates[0].d + 650);
  approach(g, later, later.lane, 500);
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

function driveToFinish(g) {
  for (let i = 0; i < 12000 && g.get().state === 'play'; i++) {
    const run = g.get();
    g.keys.left = run.lane > .06; g.keys.right = run.lane < -.06;
    g.keys.down = g.wildlife.some(q => q.kind !== 'rabbit' && q.start !== null && !q.passed && run.t < q.start + g.ANIMAL_WAIT + q.duration);
    g.keys.up = !g.keys.down; g.update(.05);
  }
}

test('all nine scheduled venues are selectable, themed and complete a saved season without a difficulty ladder', () => {
  const g = game();
  const schedule = fs.readFileSync(path.join(__dirname, '..', 'schedule-2027.html'), 'utf8');
  const names = Array.from(schedule.matchAll(/class="event">([^<]+)</g), match => match[1]);
  assert.deepEqual(Array.from(g.EVENTS, q => q.name), names, 'include the full planned website schedule in order');
  assert.equal(g.EVENTS.length, 9); assert.equal(new Set(g.EVENTS.map(q => q.habitat)).size, 9);
  assert.equal(g.EVENTS.find(q => q.id === 'empire').habitat, 'dunes');
  g.selectEvent(7); assert.equal(g.get().eventIndex, 7, 'Empire is available before winning earlier events');
  g.selectEvent(0); g.reset();
  const paths = [];
  for (let i = 0; i < 9; i++) {
    assert.equal(g.get().eventIndex, i); assert.equal(g.GOAL, 30000); assert.equal(g.gates.length, require('./helpers/courses.cjs').events[g.event().id].gates.length); assert.equal(g.potholes.length, 3);
    paths.push(g.path(4200)); assert.ok(g.corners.length >= 5, 'every event has inside apex opportunities');
    for (const q of g.corners) {
      assert.ok(g.gates.every(h => Math.abs(h.d-q.d) >= 650));
      assert.ok(g.potholes.every(h => Math.abs(h.d-q.d) >= 650));
      assert.equal(Math.sign(q.lane), Math.sign(g.path(q.d+200)-2*g.path(q.d)+g.path(q.d-200)));
    }
    driveToFinish(g);
    assert.equal(g.get().state, 'end', g.EVENTS[i].name); assert.equal(g.get().won, true, g.EVENTS[i].name);
    assert.equal(g.get().dist, 30000); assert.ok(Number(g.storage.get(g.scoreKey())) > 0);
    assert.equal(g.seasonCount(), i+1);
    if (i < 8) { g.element('start').onclick(); assert.equal(g.get().dist, 0); }
  }
  assert.equal(new Set(paths).size, 9, 'venues should have distinct road profiles');
  assert.match(g.element('title').innerHTML, /SEASON/); assert.match(g.element('msg').innerHTML, /9 \/ 9/);
  const restored = game(g.storage); assert.equal(restored.seasonCount(), 9); assert.ok(restored.get().best > 0);
  restored.reset(); driveToFinish(restored);
  assert.equal(restored.element('start').textContent, 'BACK TO SEASON →');
  restored.element('start').onclick(); assert.equal(restored.get().state, 'menu', 'a completed season returns to event selection even when replayed out of order');
  g.element('start').onclick(); assert.equal(g.get().state, 'menu');
  assert.equal(g.storage.get('799mountainrunbest-v5-pine-mountain'), '42');
  assert.equal(g.storage.get('799mountainrunbest-v4'), '19');
  assert.equal(g.storage.get('799mountainrunbest-v3'), '17');
  assert.equal(g.storage.get('799mountainrunbest-v2'), '15'); assert.equal(g.storage.get('799mountainrunbest'), '12');
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
        assert.equal(g.storage.get(g.scoreKey()), undefined, 'a crash is not a finish');
        const stopped = g.get(); g.update(.05);
        assert.equal(g.get().dist, stopped.dist); assert.equal(g.get().t, stopped.t);
      }
    }
  }
});

test('replay keeps the selected event, and the season menu clears held input and active effects', () => {
  const g = game(); g.selectEvent(7); g.reset();
  g.keys.left = true; g.keys.up = true; g.update(.05); g.togglePause();
  g.element('eventMenu').onclick();
  assert.equal(g.get().state, 'menu'); assert.equal(g.get().eventIndex, 7);
  assert.ok(Object.values(g.keys).every(v => !v));
  assert.equal(g.get().skidUntil, 0); assert.equal(g.get().boostUntil, 0);
  g.element('start').onclick(); assert.equal(g.get().state, 'play'); assert.equal(g.get().eventIndex, 7);
  assert.equal(g.selectEvent(0), false, 'changing the hidden selector must not replace an active race');
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
  assert.ok(g.gates.every(q => !q.passed));
  assert.ok(g.wildlife.every(q => !q.passed && q.start === null));
  assert.ok(g.corners.every(q => !q.passed));
  assert.ok(g.potholes.every(q => !q.passed));
  assert.ok(Object.values(g.keys).every(v => !v));
  assert.doesNotThrow(() => g.render());
});



test('welcome requires a course choice, remembers it, and preserves menu and replay flows', () => {
  const g = game([], false);
  assert.equal(g.element('eventSelect').value, '');
  assert.equal(g.element('start').disabled, true);
  g.reset(); assert.equal(g.get().state, 'menu');
  g.selectEvent(7);
  assert.equal(g.element('eventSelect').value, '7');
  assert.equal(g.element('start').disabled, false);
  assert.equal(g.storage.get('799mountainrun-last-course'), 'empire');
  g.reset(); assert.equal(g.get().state, 'play');
  g.togglePause(); g.openSeason();
  assert.equal(g.element('eventSelect').value, '7');
  assert.equal(g.element('start').disabled, false);
  const returning = game([['799mountainrun-last-course', 'empire']], false);
  assert.equal(returning.get().eventIndex, 7);
  assert.equal(returning.element('start').disabled, false);
  const invalid = game([['799mountainrun-last-course', 'removed-course']], false);
  assert.equal(invalid.element('eventSelect').value, '');
  assert.equal(invalid.element('start').disabled, true);
});
