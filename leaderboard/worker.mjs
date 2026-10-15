// Paste this entire file into Cloudflare's Worker editor. Bind D1 as DB.
export const RULESET = '2027-v5';
export const EVENTS = Object.freeze({
  'pine-mountain': 7, 'spring-weatherly': 7, pagoda: 5, 'flag-rock': 5,
  'giants-despair': 7, duryea: 7, waumandee: 7, empire: 7, 'shamrock-mountain': 7
});
const EVENT_COUNT = Object.keys(EVENTS).length;
const ORIGINS = ['https://scirocco799.com', 'https://www.scirocco799.com', 'https://mwtcmi.github.io'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOUR = 3600000;
class APIError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
function driverName(value) {
  const name = typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ') : '';
  if ([...name].length < 2 || [...name].length > 18 || !/^[\p{L}\p{N} ._'’-]+$/u.test(name) || !/[\p{L}\p{N}]/u.test(name))
    throw new APIError(400, 'Use 2–18 letters, numbers, spaces, or simple punctuation for your driver name.');
  return name;
}
async function body(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new APIError(415, 'Send JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new APIError(400, 'Missing request body.');
  const chunks = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 4096) { await reader.cancel(); throw new APIError(413, 'Request is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const result = JSON.parse(new TextDecoder().decode(bytes));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch { throw new APIError(400, 'Invalid JSON.'); }
}
async function authenticate(request, db) {
  const bearer = request.headers.get('authorization')?.match(/^Bearer ([0-9a-f]{64})$/i)?.[1];
  if (!bearer) throw new APIError(401, 'Your driver session is missing.');
  const player = await db.prepare('SELECT id, name FROM players WHERE token_hash = ?').bind(await hash(bearer)).first();
  if (!player) throw new APIError(401, 'Your driver session has expired.');
  return player;
}
async function limit(db, key, max, now) {
  const window = Math.floor(now / HOUR);
  const result = await db.prepare(`INSERT INTO rate_limits(key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`).bind(key + ':' + window, (window + 1) * HOUR).first();
  if (result.count > max) throw new APIError(429, 'Too many requests. Please try again later.');
}
async function standings(db, eventId, playerId = '') {
  const season = eventId === 'season';
  const source = season
    ? `SELECT p.id AS player_id, p.name, SUM(b.time_ms) AS time_ms, MAX(b.achieved_at) AS achieved_at
       FROM event_bests b JOIN players p ON p.id = b.player_id
       WHERE b.ruleset = ? AND p.name IS NOT NULL GROUP BY p.id HAVING COUNT(*) = ${EVENT_COUNT}`
    : `SELECT p.id AS player_id, p.name, b.time_ms, b.achieved_at FROM event_bests b
       JOIN players p ON p.id = b.player_id WHERE b.ruleset = ? AND b.event_id = ? AND p.name IS NOT NULL`;
  const values = season ? [RULESET] : [RULESET, eventId];
  const query = `WITH scores AS (${source}), ranked AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY time_ms, achieved_at, player_id) AS rank, COUNT(*) OVER () AS total FROM scores
  ) SELECT * FROM ranked WHERE rank <= 20 OR player_id = ? ORDER BY rank`;
  const { results } = await db.prepare(query).bind(...values, playerId).all();
  const entry = row => ({ playerId: row.player_id, name: row.name, timeMs: row.time_ms, rank: row.rank });
  const own = results.find(row => row.player_id === playerId);
  let progress = null;
  if (playerId) {
    const p = await db.prepare('SELECT COUNT(*) AS completed, COALESCE(SUM(time_ms), 0) AS total_ms FROM event_bests WHERE player_id = ? AND ruleset = ?').bind(playerId, RULESET).first();
    progress = { completed: p.completed, totalMs: p.total_ms, required: EVENT_COUNT };
  }
  return { ruleset: RULESET, eventId, entries: results.filter(row => row.rank <= 20).map(entry), total: results[0]?.total || 0, self: own ? entry(own) : null, progress };
}

// A clock dependency makes expiry and race timing testable without production flags.
export function createWorker({ now = () => Date.now() } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url), origin = request.headers.get('origin');
      const allowed = [...ORIGINS, url.origin, ...(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean)];
      const permitted = !origin || allowed.includes(origin);
      const headers = { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
      if (origin && permitted) Object.assign(headers, {
        'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400'
      });
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
      try {
        if (!permitted) throw new APIError(403, 'This origin is not allowed.');
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        const db = env.DB;
        if (!db) throw new Error('Missing DB binding');
        if (request.method === 'GET' && ['/', '/api/health'].includes(url.pathname)) {
          const meta = await db.prepare('SELECT version FROM leaderboard_meta WHERE id = 1').first();
          if (meta?.version !== 1) throw new Error('Leaderboard schema is not installed');
          return json({ ok: true, service: 'Scirocco 799 leaderboard', ruleset: RULESET });
        }
        if (request.method === 'GET' && url.pathname === '/api/leaderboard') {
          const eventId = url.searchParams.get('event'), playerId = url.searchParams.get('player') || '';
          if (eventId !== 'season' && !Object.hasOwn(EVENTS, eventId)) throw new APIError(400, 'Choose a valid event.');
          if (playerId && !UUID.test(playerId)) throw new APIError(400, 'Invalid driver ID.');
          return json(await standings(db, eventId, playerId));
        }
        if (request.method !== 'POST') throw new APIError(404, 'Endpoint not found.');
        const data = await body(request), timestamp = now();
        const ipKey = await hash(request.headers.get('cf-connecting-ip') || 'unknown');
        await limit(db, 'ip:' + ipKey, 2000, timestamp);
        if (url.pathname === '/api/players') {
          await limit(db, 'new:' + ipKey, 30, timestamp);
          const secret = token(), id = crypto.randomUUID();
          await db.prepare('INSERT INTO players(id, token_hash, created_at) VALUES (?, ?, ?)').bind(id, await hash(secret), timestamp).run();
          return json({ playerId: id, token: secret, name: null }, 201);
        }
        const player = await authenticate(request, db);
        if (url.pathname === '/api/profile') {
          await limit(db, 'name:' + player.id, 20, timestamp);
          const name = driverName(data.name), nameKey = name.toLowerCase();
          const owner = await db.prepare('SELECT id FROM players WHERE name_key = ?').bind(nameKey).first();
          if (owner && owner.id !== player.id) throw new APIError(409, 'That driver name is taken. Please choose another.');
          try {
            await db.prepare('UPDATE players SET name = ?, name_key = ? WHERE id = ?').bind(name, nameKey, player.id).run();
          } catch (error) {
            // Resolve a simultaneous claim without exposing storage errors.
            if (/UNIQUE constraint failed/i.test(error.message)) throw new APIError(409, 'That driver name is taken. Please choose another.');
            throw error;
          }
          return json({ playerId: player.id, name });
        }
        if (url.pathname === '/api/runs') {
          if (data.ruleset !== RULESET) throw new APIError(409, 'Reload the game to use the current scoring rules.');
          if (!Object.hasOwn(EVENTS, data.eventId)) throw new APIError(400, 'Choose a valid event.');
          await limit(db, 'start:' + player.id, 240, timestamp);
          const runId = crypto.randomUUID(), expiresAt = timestamp + 2 * HOUR;
          await db.batch([
            db.prepare('DELETE FROM runs WHERE finished_at IS NULL AND expires_at < ?').bind(timestamp),
            db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(timestamp),
            db.prepare('INSERT INTO runs(id, player_id, event_id, ruleset, started_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(runId, player.id, data.eventId, RULESET, timestamp, expiresAt)
          ]);
          return json({ runId, eventId: data.eventId, ruleset: RULESET, expiresAt }, 201);
        }
        const match = url.pathname.match(/^\/api\/runs\/([0-9a-f-]+)\/finish$/i);
        if (!match || !UUID.test(match[1])) throw new APIError(404, 'Endpoint not found.');
        await limit(db, 'finish:' + player.id, 300, timestamp);
        const run = await db.prepare('SELECT * FROM runs WHERE id = ? AND player_id = ?').bind(match[1], player.id).first();
        if (!run) throw new APIError(404, 'Run ticket not found.');
        if (run.ruleset !== RULESET || !Object.hasOwn(EVENTS, run.event_id)) throw new APIError(409, 'Reload the game to use the current scoring rules.');
        if (run.disqualified) throw new APIError(403, 'This result was removed from the leaderboard.');
        const { timeMs, apexes } = data;
        if (!Number.isSafeInteger(timeMs) || timeMs < 31250 || timeMs > 1200000 || !Number.isInteger(apexes) || apexes < 0 || apexes > EVENTS[run.event_id])
          throw new APIError(400, 'This result is outside the course limits.');
        if (!player.name) throw new APIError(400, 'Choose your driver name before posting a time.');
        if (run.finished_at !== null && (run.time_ms !== timeMs || run.apexes !== apexes)) throw new APIError(409, 'This run has already been posted.');
        if (run.finished_at === null && run.expires_at < timestamp) throw new APIError(410, 'This run ticket expired. Your device best is still saved.');
        // Allow for the asynchronous ticket request and modest network delay.
        if (run.finished_at === null && timeMs > timestamp - run.started_at + 5000) throw new APIError(400, 'The race timing could not be verified.');
        const before = await standings(db, run.event_id, player.id);
        const writes = await db.batch([
          db.prepare('UPDATE runs SET time_ms = ?, apexes = ?, finished_at = ? WHERE id = ? AND finished_at IS NULL').bind(timeMs, apexes, timestamp, run.id),
          db.prepare(`INSERT INTO event_bests(player_id, event_id, ruleset, time_ms, apexes, achieved_at, run_id)
            SELECT player_id, event_id, ruleset, time_ms, apexes, finished_at, id FROM runs WHERE id = ? AND disqualified = 0
            ON CONFLICT(player_id, event_id, ruleset) DO UPDATE SET time_ms = excluded.time_ms,
              apexes = excluded.apexes, achieved_at = excluded.achieved_at, run_id = excluded.run_id
            WHERE excluded.time_ms < event_bests.time_ms`).bind(run.id)
        ]);
        const stored = await db.prepare('SELECT time_ms, apexes FROM runs WHERE id = ?').bind(run.id).first();
        if (stored.time_ms !== timeMs || stored.apexes !== apexes) throw new APIError(409, 'This run has already been posted.');
        const board = await standings(db, run.event_id, player.id);
        const improved = writes[0].meta.changes > 0 && (!before.self || timeMs < before.self.timeMs);
        return json({ accepted: true, runId: run.id, personalBest: improved,
          newKing: improved && board.self?.rank === 1 && before.entries[0]?.playerId !== player.id,
          leaderboard: board });
      } catch (error) {
        if (error instanceof APIError) return json({ error: error.message }, error.status);
        console.error('Leaderboard request failed:', error.message);
        return json({ error: 'Podiums are temporarily unavailable. Your device best is still saved.' }, 503);
      }
    }
  };
}
export default createWorker();
