const test = require('node:test');
const assert = require('node:assert/strict');
const courses = require('./helpers/courses.cjs');

test('all nine authored routes have distinct turn rhythms, maps and hazard plans', () => {
  const entries = Object.entries(courses.events);
  assert.equal(entries.length, 9);
  assert.equal(new Set(entries.map(([, c]) => c.mapPath)).size, 9);
  assert.equal(new Set(entries.map(([, c]) => JSON.stringify(c.turns))).size, 9);
  assert.equal(new Set(entries.map(([, c]) => JSON.stringify([c.gates, c.wildlife, c.potholes]))).size, 9);
  assert.equal(courses.events.empire.gates.length, 6);
  assert.equal(courses.events.waumandee.gates.length, 15);
  assert.ok(courses.events.pagoda.turns.length > courses.events.empire.turns.length);
  const peakSlope = c => Math.max(...c.turns.map(t => Math.abs(t.offset) * 1.875 / (t.end - t.start)));
  assert.ok(peakSlope(courses.events.empire) < peakSlope(courses.events['giants-despair']));
});

test('routes start and finish straight, remain smooth, and place inside boosts on clear corners', () => {
  for (const [id, c] of Object.entries(courses.events)) {
    assert.equal(courses.path(id, 0), courses.path(id, 1000), id + ' launch straight');
    assert.equal(courses.path(id, 29000), courses.path(id, courses.length), id + ' finish straight');
    assert.ok(c.turns.length >= 5 && c.turns.length <= 7);
    let prior = 1000;
    for (const turn of c.turns) {
      assert.ok(turn.start > prior && turn.end > turn.start, id + ' ordered turns'); prior = turn.end;
      const curve = d => courses.path(id, d + 200) - 2 * courses.path(id, d) + courses.path(id, d - 200);
      assert.equal(Math.sign(curve(turn.apex)), Math.sign(turn.lane), id + ' inside apex');
      assert.ok(Math.abs(curve(turn.apex)) >= Math.abs(curve(turn.apex - 60)));
      assert.ok(Math.abs(curve(turn.apex)) >= Math.abs(curve(turn.apex + 60)));
      for (const q of [...c.gates, ...c.wildlife, ...c.potholes]) assert.ok(Math.abs(q.d - turn.apex) >= 650, id + ' clear boost');
      for (const d of [turn.start, turn.end]) {
        assert.ok(Math.abs(courses.path(id, d + .01) - courses.path(id, d - .01)) < .01, id + ' continuous turn seam');
      }
    }
    for (let d = 0; d <= courses.length; d += 50) assert.ok(Math.abs(courses.path(id, d + 1) - courses.path(id, d)) < .5, id + ' bounded steering demand');
  }
});

test('hazards leave steering and recovery space, and every route retains Uno and three sparse potholes', () => {
  for (const [id, c] of Object.entries(courses.events)) {
    assert.equal(c.potholes.length, 3);
    assert.equal(c.wildlife.filter(q => q.kind === 'rabbit').length, 1);
    for (let i = 1; i < c.gates.length; i++) assert.ok(c.gates[i].d - c.gates[i - 1].d >= 1000, id);
    for (let i = 1; i < c.potholes.length; i++) assert.ok(c.potholes[i].d - c.potholes[i - 1].d >= 5000, id);
    const hazards = [...c.gates, ...c.wildlife, ...c.potholes].sort((a, b) => a.d - b.d);
    for (let i = 1; i < hazards.length; i++) assert.ok(hazards[i].d - hazards[i - 1].d >= 650, id + ' separated hazards');
  }
});

test('route map progress follows race distance and stays inside the compact display', () => {
  for (const [id, c] of Object.entries(courses.events)) {
    let y = Infinity;
    for (let f = 0; f <= 1; f += .005) {
      const p = courses.pointAt(id, f);
      assert.ok(p.x >= 21 && p.x <= 169 && p.y <= y && p.y >= 16 && p.y <= 183, id); y = p.y;
    }
    assert.equal(courses.pointAt(id, 0).y, 182);
    assert.equal(courses.pointAt(id, 1).y, 17);
    assert.equal(c.map.length, 151);
  }
});
