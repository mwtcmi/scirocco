const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const scope = {};
vm.runInNewContext(fs.readFileSync(require.resolve('../mountain-run/audio.js'), 'utf8'), scope);
const { powertrain } = scope.MountainAudio;
const input = (time, speed, extra = {}) => ({ time, speed, running: true, gas: true, brake: false, launch: false, ...extra });

test('acceleration produces five distinct gears with audible rev drops instead of a continuously rising tone', () => {
  const drive = powertrain(), gears = new Set([1]), shifts = [];
  let prior = drive.step(input(0, 0));
  for (let i = 1; i <= 240; i++) {
    const state = drive.step(input(i / 20, Math.min(920, i * 5)));
    gears.add(state.gear);
    if (state.shift === 'up') {
      assert.ok(state.rpm < prior.rpm - 250, 'rev drop at the actual gear change');
      assert.ok(state.shifting && state.combustion < .5, 'short exhaust cut');
      shifts.push(state.gear);
    }
    assert.ok(Number.isFinite(state.rpm) && state.rpm >= 1100 && state.rpm < 7050);
    prior = state;
  }
  assert.deepEqual([...gears], [1, 2, 3, 4, 5]);
  assert.deepEqual(shifts, [2, 3, 4, 5]);
});

test('braking downshifts to idle, while restart and pause do not retain an old gear', () => {
  const drive = powertrain(); let state;
  for (let i = 0; i < 120; i++) state = drive.step(input(i / 20, Math.min(900, i * 10)));
  assert.equal(state.gear, 5);
  const paused = drive.step(input(6, 900, { running: false }));
  assert.equal(paused.rpm, state.rpm); assert.equal(paused.gear, state.gear);
  for (let i = 120; i <= 240; i++) state = drive.step(input(i / 20, Math.max(0, 900 - (i - 120) * 15), { brake: true, gas: false }));
  assert.equal(state.gear, 1); assert.ok(Math.abs(state.rpm - 1120) < 1);
  drive.reset(); state = drive.step(input(0, 250, { launch: true }));
  assert.equal(state.gear, 1); assert.equal(state.rpm, 1120); assert.equal(state.shift, null);
});

test('launch revs are independent of wheel speed, and intake load follows gas and brake', () => {
  const drive = powertrain(); let state;
  for (let i = 0; i <= 16; i++) state = drive.step(input(i / 20, 0, { launch: true }));
  assert.ok(state.rpm > 6200); assert.equal(state.gear, 1);
  assert.equal(drive.step(input(.85, 0)).load, 1);
  assert.ok(drive.step(input(.9, 0, { gas: false })).load < .3);
  assert.ok(drive.step(input(.95, 0, { gas: true, brake: true })).load < .1);
});

test('shifts still drop in pitch when a fast burnout ends above the next gear range', () => {
  const drive = powertrain(); let prior;
  for (let i = 0; i < 18; i++) prior = drive.step(input(i / 20, 650, { launch: true }));
  const shifted = drive.step(input(.9, 650));
  assert.equal(shifted.shift, 'up'); assert.equal(shifted.gear, 2);
  assert.ok(shifted.rpm < prior.rpm - 600, 'clutch release provides a clear rev drop');
});
