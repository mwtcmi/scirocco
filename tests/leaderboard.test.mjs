import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { database } from './helpers/d1.cjs';
import { createWorker, RULESET, EVENTS } from '../leaderboard/worker.mjs';

function service(t) {
  const storage = database(); t.after(storage.close);
  let time = 1800000000000;
  const worker = createWorker({ now: () => time });
  const env = { DB: storage.db };
  async function call(path, { method = 'GET', data, player, origin = 'https://scirocco799.com', headers = {} } = {}) {
    const h = { ...headers };
    if (origin) h.origin = origin;
    if (data !== undefined) h['content-type'] = 'application/json';
    if (player) h.authorization = 'Bearer ' + player.token;
    const response = await worker.fetch(new Request('https://scores.example' + path, { method, headers: h, body: data === undefined ? undefined : JSON.stringify(data) }), env);
    const body = method === 'OPTIONS' ? null : await response.json();
    return { response, body, status: response.status };
  }
  async function player(name) {
    const created = await call('/api/players', { method: 'POST', data: {} });
    assert.equal(created.status, 201);
    if (name) {
      const named = await call('/api/profile', { method: 'POST', data: { name }, player: created.body });
      assert.equal(named.status, 200); created.body.name = named.body.name;
    }
    return created.body;
  }
  async function start(p, eventId = 'pine-mountain') {
    const run = await call('/api/runs', { method: 'POST', data: { eventId, ruleset: RULESET }, player: p });
    assert.equal(run.status, 201); return run.body;
  }
  async function finish(p, run, timeMs = 45000, apexes = 2) {
    time += timeMs + 100;
    return call('/api/runs/' + run.runId + '/finish', { method: 'POST', data: { timeMs, apexes }, player: p });
  }
  return { ...storage, call, player, start, finish, advance: ms => time += ms };
}

test('schema creates all tables when the D1 console collapses pasted SQL onto one line', t => {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  const schema = fs.readFileSync(new URL('../leaderboard/schema.sql', import.meta.url), 'utf8');
  sqlite.exec(schema.replace(/\s+/g, ' '));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'").get().n, 5);
  assert.equal(sqlite.prepare('SELECT version FROM leaderboard_meta WHERE id = 1').get().version, 1);
});

test('schema is repeatable; health validates DB/schema; site origins and preflight are restricted', async t => {
  const s = service(t); s.sqlite.exec(s.schema);
  const health = await s.call('/api/health');
  assert.equal(health.body.ok, true); assert.equal(health.body.ruleset, RULESET);
  assert.equal(health.response.headers.get('access-control-allow-origin'), 'https://scirocco799.com');
  assert.equal((await s.call('/api/health', { origin: 'https://mwtcmi.github.io' })).status, 200);
  const blocked = await s.call('/api/players', { method: 'POST', data: {}, origin: 'https://other.example' });
  assert.equal(blocked.status, 403); assert.equal(blocked.response.headers.has('access-control-allow-origin'), false);
  assert.equal((await s.call('/api/runs', { method: 'OPTIONS' })).status, 204);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM players').get().n, 0);
});

test('anonymous identities store only hashed secrets; naming normalizes and protects unique names', async t => {
  const s = service(t), a = await s.player(), b = await s.player();
  const stored = s.sqlite.prepare('SELECT * FROM players WHERE id = ?').get(a.playerId);
  assert.equal(stored.name, null); assert.notEqual(stored.token_hash, a.token);
  assert.equal(stored.token_hash.length, 64);
  const named = await s.call('/api/profile', { method: 'POST', player: a, data: { name: '  Mike   799  ' } });
  assert.equal(named.body.name, 'Mike 799');
  assert.equal((await s.call('/api/profile', { method: 'POST', player: b, data: { name: 'mike 799' } })).status, 409);
  for (const name of ['x', '<img src=x>', 'https://evil.test', 'x'.repeat(19), '...'])
    assert.equal((await s.call('/api/profile', { method: 'POST', player: b, data: { name } })).status, 400);
  assert.equal((await s.call('/api/profile', { method: 'POST', data: { name: 'Fake' } })).status, 401);
});

test('only ticketed, named, authenticated runs can publish; times, apex counts and rulesets are checked', async t => {
  const s = service(t), a = await s.player(), b = await s.player('Other');
  assert.equal((await s.call('/api/runs', { method: 'POST', player: a, data: { eventId: 'constructor', ruleset: RULESET } })).status, 400);
  assert.equal((await s.call('/api/runs', { method: 'POST', player: a, data: { eventId: 'pagoda', ruleset: 'old' } })).status, 409);
  const run = await s.start(a, 'pagoda'); s.advance(50000);
  const url = '/api/runs/' + run.runId + '/finish';
  assert.equal((await s.call(url, { method: 'POST', player: b, data: { timeMs: 45000, apexes: 2 } })).status, 404);
  assert.equal((await s.call(url, { method: 'POST', player: a, data: { timeMs: 45000, apexes: 2 } })).status, 400);
  await s.call('/api/profile', { method: 'POST', player: a, data: { name: 'Uno' } });
  for (const [timeMs, apexes] of [[1000, 0], [45000.5, 2], [45000, 6], [45000, -1], [45000, 2.5], [1200001, 1]])
    assert.equal((await s.call(url, { method: 'POST', player: a, data: { timeMs, apexes } })).status, 400);
  const accepted = await s.call(url, { method: 'POST', player: a, data: { timeMs: 45000, apexes: 5 } });
  assert.equal(accepted.status, 200); assert.equal(accepted.body.accepted, true);
});

test('direct API submissions reject blocked names without overwriting a clean name', async t => {
  const s = service(t), p = await s.player('Clean Driver');
  for (const name of ['f u c k', 'sh1t799', 'b.i.t.c.h', 'a55hole', 'n1gga', 'fuсk', 'ｆｕｃｋ']) {
    const result = await s.call('/api/profile', { method: 'POST', player: p, data: { name } });
    assert.equal(result.status, 400, name); assert.match(result.body.error, /without bad language/);
    assert.equal(s.sqlite.prepare('SELECT name FROM players WHERE id = ?').get(p.playerId).name, 'Clean Driver');
  }
});

test('existing blocked names are masked on hill and season podiums; renaming preserves scores and pending tickets', async t => {
  const s = service(t), p = await s.player('Legacy Driver');
  for (const eventId of Object.keys(EVENTS)) await s.finish(p, await s.start(p, eventId));
  const ticket = await s.start(p);
  s.sqlite.prepare("UPDATE players SET name = 'Sh1t Driver', name_key = 'sh1t driver' WHERE id = ?").run(p.playerId);
  const alias = 'Driver ' + p.playerId.replace(/-/g, '').slice(0, 6).toUpperCase();
  for (const event of ['pine-mountain', 'season']) {
    const board = (await s.call('/api/leaderboard?event=' + event + '&player=' + p.playerId)).body;
    assert.equal(board.entries[0].name, alias); assert.equal(board.self.name, alias);
    assert.equal(board.self.rank, 1); assert.equal(board.self.playerId, p.playerId);
  }
  const rejected = await s.finish(p, ticket);
  assert.equal(rejected.status, 400); assert.match(rejected.body.error, /without bad language/);
  assert.equal(s.sqlite.prepare('SELECT finished_at FROM runs WHERE id = ?').get(ticket.runId).finished_at, null);
  await s.call('/api/profile', { method: 'POST', player: p, data: { name: 'Cassidy' } });
  assert.equal((await s.finish(p, ticket)).status, 200);
  const board = (await s.call('/api/leaderboard?event=season&player=' + p.playerId)).body;
  assert.equal(board.self.name, 'Cassidy'); assert.equal(board.self.timeMs, 9 * 45000);
});

test('one personal best per event; podium crown transfers; slower runs and retries cannot duplicate positions', async t => {
  const s = service(t), a = await s.player('First'), b = await s.player('Challenger');
  const run = await s.start(a), won = await s.finish(a, run, 45000);
  assert.equal(won.body.newKing, true); assert.equal(won.body.leaderboard.self.rank, 1);
  const retry = await s.finish(a, run, 45000);
  assert.equal(retry.status, 200); assert.equal(retry.body.newKing, false);
  assert.equal((await s.finish(a, run, 44000)).status, 409);
  const slower = await s.finish(a, await s.start(a), 47000);
  assert.equal(slower.body.personalBest, false); assert.equal(slower.body.leaderboard.self.timeMs, 45000);
  const crown = await s.finish(b, await s.start(b), 44000);
  assert.equal(crown.body.newKing, true); assert.equal(crown.body.leaderboard.self.rank, 1);
  const board = (await s.call('/api/leaderboard?event=pine-mountain&player=' + a.playerId)).body;
  assert.deepEqual(board.entries.map(p => p.name), ['Challenger', 'First']);
  assert.equal(board.self.rank, 2); assert.equal(board.total, 2);
});

test('equal times retain the earlier best; improving an incumbent record does not award a new crown', async t => {
  const s = service(t), a = await s.player('Earlier'), b = await s.player('Later');
  await s.finish(a, await s.start(a), 45000);
  const tied = await s.finish(b, await s.start(b), 45000);
  assert.equal(tied.body.leaderboard.self.rank, 2); assert.equal(tied.body.newKing, false);
  const own = await s.finish(a, await s.start(a), 44000);
  assert.equal(own.body.newKing, false); assert.equal(own.body.personalBest, true);
});

test('concurrent retries update a ticket once, and old-rules tickets cannot publish', async t => {
  const s = service(t), p = await s.player('Parallel'), run = await s.start(p);
  s.advance(50000);
  const url = '/api/runs/' + run.runId + '/finish';
  const attempts = await Promise.all([1, 2].map(() => s.call(url, { method: 'POST', player: p, data: { timeMs: 45000, apexes: 2 } })));
  assert.ok(attempts.every(a => a.status === 200));
  assert.equal(attempts.filter(a => a.body.newKing).length, 1);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM event_bests').get().n, 1);
  assert.equal((await s.call(url, { method: 'POST', player: p, data: { timeMs: 44000, apexes: 2 } })).status, 409);
  const stale = await s.start(p);
  s.sqlite.prepare("UPDATE runs SET ruleset = 'old' WHERE id = ?").run(stale.runId);
  assert.equal((await s.finish(p, stale)).status, 409);
});

test('season requires all nine distinct events and ranks the sum of event bests; incomplete seasons show progress', async t => {
  const s = service(t), a = await s.player('Season Driver'), b = await s.player('Full Season');
  for (const [index, id] of Object.keys(EVENTS).entries()) {
    await s.finish(a, await s.start(a, id), 45000 + index * 100);
    if (index < 8) {
      const incomplete = (await s.call('/api/leaderboard?event=season&player=' + a.playerId)).body;
      assert.equal(incomplete.self, null); assert.equal(incomplete.progress.completed, index + 1);
    }
  }
  let season = (await s.call('/api/leaderboard?event=season&player=' + a.playerId)).body;
  assert.equal(season.entries.length, 1); assert.equal(season.self.timeMs, 408600);
  for (const id of Object.keys(EVENTS)) await s.finish(b, await s.start(b, id), 45000);
  season = (await s.call('/api/leaderboard?event=season&player=' + a.playerId)).body;
  assert.equal(season.self.rank, 2); assert.equal(season.entries[0].name, 'Full Season');
  await s.finish(a, await s.start(a), 40000);
  season = (await s.call('/api/leaderboard?event=season&player=' + a.playerId)).body;
  assert.equal(season.self.rank, 1); assert.equal(season.self.timeMs, 403600);
});

test('top twenty includes a separate personal rank outside the displayed list', async t => {
  const s = service(t); let last;
  for (let i = 0; i < 22; i++) {
    const p = await s.player('Driver ' + i); await s.finish(p, await s.start(p), 45000 + i); last = p;
  }
  const board = (await s.call('/api/leaderboard?event=pine-mountain&player=' + last.playerId)).body;
  assert.equal(board.entries.length, 20); assert.equal(board.self.rank, 22); assert.equal(board.total, 22);
});

test('server timing, ticket expiry, removed scores and excessive account creation are rejected', async t => {
  const s = service(t), p = await s.player('Timing');
  const run = await s.start(p);
  assert.equal((await s.call('/api/runs/' + run.runId + '/finish', { method: 'POST', player: p, data: { timeMs: 45000, apexes: 0 } })).status, 400);
  s.advance(2 * 3600000 + 1);
  assert.equal((await s.finish(p, run)).status, 410);
  const removed = await s.start(p); s.sqlite.prepare('UPDATE runs SET disqualified = 1 WHERE id = ?').run(removed.runId);
  assert.equal((await s.finish(p, removed)).status, 403);
  for (let i = 0; i < 30; i++) await s.player();
  assert.equal((await s.call('/api/players', { method: 'POST', data: {} })).status, 429);
});

test('malformed and oversized payloads fail without a storage mutation; SQL-like names are plain data', async t => {
  const s = service(t);
  const response = await createWorker().fetch(new Request('https://scores.example/api/players', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(5000) }), { DB: s.db });
  assert.equal(response.status, 413); assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM players').get().n, 0);
  const p = await s.player("Mike' OR 1--");
  await s.finish(p, await s.start(p));
  assert.equal((await s.call('/api/leaderboard?event=pine-mountain')).body.entries[0].name, "Mike' OR 1--");
});

test('frozen course manifest agrees with the actual game and theoretical speed limit', () => {
  const game = fs.readFileSync(new URL('../mountain-run/index.html', import.meta.url), 'utf8');
  const events = Function('return ' + game.match(/const EVENTS=(\[[\s\S]*?\n\]);/)[1])();
  assert.deepEqual(events.map(e => e.id), Object.keys(EVENTS));
  for (const e of events) {
    const path = d => (Math.sin(d / 1200 + e.phase) * 175 + Math.sin(d / 490 + e.phase * .7) * 67 + Math.sin(d / 2500 + e.phase * .4) * 100) * e.scale;
    const bend = d => (path(d + 200) - 2 * path(d) + path(d - 200)) / 200;
    const excluded = [...Array.from({ length: 15 }, (_, i) => [1500 + Math.floor(i / 3) * 5500 + i % 3 * 1000, 650]), ...[4650, 10750, 16875, 21600, 28250].map(d => [d, 550]), ...[6200, 15500, 26300].map(d => [d, 650])];
    const corners = [];
    for (let d = 1200; d < 28800; d += 60) {
      const strength = Math.abs(bend(d));
      if (strength < .04 || strength < Math.abs(bend(d - 60)) || strength < Math.abs(bend(d + 60)) || excluded.some(([q, gap]) => Math.abs(q - d) < gap) || corners.some(q => Math.abs(q - d) < 900)) continue;
      corners.push(d);
    }
    assert.equal(EVENTS[e.id], corners.length, e.id + ' scoring limits must match the frozen course');
  }
  assert.equal(30000 / 960 * 1000, 31250);
});
