import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createPitwall, verifyAccess, setPrice, setPolicy, slugify, _resetCertCache } from '../pitwall/worker.mjs';

const require = createRequire(import.meta.url);
const { database } = require('./helpers/d1.cjs');
const CATALOG = fs.readFileSync(new URL('../store/catalog.json', import.meta.url), 'utf8');
const TEAM = '799.cloudflareaccess.com', AUD = 'aud123';
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
const b64u = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function token(claims = {}, { key = privateKey, kid = 'k1' } = {}) {
  const now = Math.floor(1800000000000 / 1000);
  const h = b64u({ alg: 'RS256', kid, typ: 'JWT' }), p = b64u({ aud: [AUD], iss: 'https://' + TEAM, email: 'Mike@Scirocco799.com', exp: now + 3600, iat: now, ...claims });
  return h + '.' + p + '.' + crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), key).toString('base64url');
}
const fetchCerts = async () => new Response(JSON.stringify({ keys: [jwk] }));

function setup(t, { githubToken = 'ghp_x' } = {}) {
  _resetCertCache();
  const storage = database('../../store/migrations'); t.after(storage.close);
  let file = CATALOG, sha = 'sha1'; const commits = [];
  const ghFetch = async (url, init) => {
    if (init.method === 'GET') return new Response(JSON.stringify({ sha, content: Buffer.from(file).toString('base64') }));
    const b = JSON.parse(init.body);
    if (b.sha !== sha) return new Response('{}', { status: 409 });
    file = Buffer.from(b.content, 'base64').toString('utf8'); sha = 'sha' + (commits.length + 2); commits.push({ url, ...b });
    return new Response(JSON.stringify({ commit: { sha } }));
  };
  const app = createPitwall({ now: () => 1800000000000, ghFetch, fetchCerts });
  const env = { DB: storage.db, ACCESS_TEAM: TEAM, ACCESS_AUD: AUD, GITHUB_TOKEN: githubToken, GITHUB_REPO: 'mwtcmi/scirocco', GITHUB_BRANCH: 'staging', STORE_LABEL: 'Test store' };
  async function call(path, { method = 'GET', data, jwt = token(), headers = {} } = {}) {
    const h = { 'content-type': 'application/json', ...headers }; if (jwt) h['cf-access-jwt-assertion'] = jwt;
    const res = await app.fetch(new Request('https://pitwall.example' + path, { method, headers: h, body: data === undefined ? undefined : JSON.stringify(data) }), env);
    const text = await res.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body, res };
  }
  return { ...storage, call, env, commits, file: () => file };
}

test('sign-in: no token, wrong audience, wrong key, expired or unlisted email are all refused', async t => {
  const s = setup(t);
  assert.equal((await s.call('/', { jwt: null })).status, 403);
  assert.equal((await s.call('/api/me', { jwt: token({ aud: ['other'] }) })).status, 403);
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  assert.equal((await s.call('/api/me', { jwt: token({}, { key: other }) })).status, 403);
  assert.equal((await s.call('/api/me', { jwt: token({ exp: 1 }) })).status, 403);
  assert.equal((await s.call('/api/me', { jwt: token({ iss: 'https://evil.cloudflareaccess.com' }) })).status, 403);
  s.env.ALLOWED_EMAILS = 'someone@else.com';
  assert.equal((await s.call('/api/me')).status, 403);
  s.env.ALLOWED_EMAILS = 'mike@scirocco799.com';
  const me = await s.call('/api/me');
  assert.equal(me.status, 200); assert.equal(me.body.email, 'mike@scirocco799.com'); assert.equal(me.body.store, 'Test store');
  const page = await s.call('/');
  assert.equal(page.status, 200); assert.match(page.body, /Pitwall/); assert.match(page.res.headers.get('x-frame-options'), /DENY/);
  assert.equal(await verifyAccess('not.a.jwt', { team: TEAM, aud: AUD, fetchCerts }), null);
});

test('writes need JSON from the Pitwall page itself', async t => {
  const s = setup(t);
  assert.equal((await s.call('/api/stock', { method: 'PUT', data: { key: 'pump', qty: 3 }, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await s.call('/api/stock', { method: 'PUT', data: { key: 'pump', qty: 3 }, headers: { 'content-type': 'text/plain' } })).status, 415);
});

test('events: add, list, edit, refuse bad dates, delete only without orders', async t => {
  const s = setup(t);
  const add = await s.call('/api/events', { method: 'POST', data: { name: 'Empire Hill Climb', place: 'Empire, MI', starts: '2027-09-18', ends: '2027-09-19', orderBy: '2027-09-15', whereToFind: 'Row B' } });
  assert.equal(add.status, 201); assert.equal(add.body.id, 'empire-hill-climb-2027');
  const again = await s.call('/api/events', { method: 'POST', data: { name: 'Empire Hill Climb', starts: '2027-09-18', ends: '2027-09-19', orderBy: '2027-09-15' } });
  assert.equal(again.body.id, 'empire-hill-climb-2027-2');
  assert.equal((await s.call('/api/events', { method: 'POST', data: { name: 'X', starts: '2027-09-19', ends: '2027-09-18', orderBy: '2027-09-15' } })).status, 400);
  assert.equal((await s.call('/api/events', { method: 'POST', data: { name: 'X', starts: '2027-09-18', ends: '2027-09-19', orderBy: '2027-09-25' } })).status, 400);
  assert.equal((await s.call('/api/events', { method: 'POST', data: { name: '', starts: '2027-09-18', ends: '2027-09-19', orderBy: '2027-09-15' } })).status, 400);
  const edit = await s.call('/api/events/empire-hill-climb-2027', { method: 'PUT', data: { name: 'Empire Hill Climb', place: 'Empire, MI', starts: '2027-09-18', ends: '2027-09-19', orderBy: '2027-09-16', whereToFind: 'Row C', active: false } });
  assert.equal(edit.status, 200);
  const list = (await s.call('/api/events')).body.events;
  const e = list.find(x => x.id === 'empire-hill-climb-2027');
  assert.equal(e.where_to_find, 'Row C'); assert.equal(e.order_by, '2027-09-16'); assert.equal(e.active, 0); assert.equal(e.orders, 0);
  s.sqlite.prepare("INSERT INTO orders (session_id, created_at, livemode, fulfillment, items, event_id) VALUES ('cs_1', 1, 0, 'event', '[]', 'empire-hill-climb-2027')").run();
  assert.equal((await s.call('/api/events/empire-hill-climb-2027', { method: 'DELETE' })).status, 409);
  assert.equal((await s.call('/api/events/empire-hill-climb-2027-2', { method: 'DELETE' })).status, 200);
  assert.equal(slugify('Giants Despair!', '2027-07-10'), 'giants-despair-2027');
});

test('stock: grouped by product with SKUs and waiting counts; saving several at once; bad input refused', async t => {
  const s = setup(t);
  s.sqlite.prepare("INSERT INTO restock_requests (sku, email, created_at) VALUES ('SpoutBender', 'a@b.co', 1)").run();
  const r = (await s.call('/api/stock')).body;
  const jug = r.groups.find(g => g.product === 'jug'), pump = r.groups.find(g => g.product === 'pump');
  assert.deepEqual(jug.items.slice(0, 2).map(i => [i.sku, i.variant, i.label, i.qty]), [['RUASVS20', 'Red', 'Tuff Jug 5 Gallon Utility Jug, Red', 2], ['WUASVS20', 'White', 'Tuff Jug 5 Gallon Utility Jug, White', 2]]);
  assert.deepEqual(pump.items.map(i => [i.sku, i.label, i.qty]), [['LTP', 'Tuff Jug Electric Transfer Pump', 2]]);
  assert.equal(r.groups.find(g => g.product === 'spoutbender').items[0].waiting, 1);
  const save = await s.call('/api/stock', { method: 'PUT', data: { changes: [{ sku: 'LTP', qty: 6 }, { sku: 'RUASVS20', qty: 0 }] } });
  assert.equal(save.status, 200); assert.equal(save.body.saved, 2);
  assert.equal(s.sqlite.prepare("SELECT qty FROM stock WHERE key = 'LTP'").get().qty, 6);
  assert.equal(s.sqlite.prepare("SELECT qty FROM stock WHERE key = 'RUASVS20'").get().qty, 0);
  assert.equal((await s.call('/api/stock', { method: 'PUT', data: { changes: [{ sku: 'LTP', qty: -1 }] } })).status, 400);
  assert.equal((await s.call('/api/stock', { method: 'PUT', data: { changes: [{ sku: 'LTP', qty: 1.5 }] } })).status, 400);
  assert.equal((await s.call('/api/stock', { method: 'PUT', data: { changes: [{ sku: 'pump', qty: 1 }] } })).status, 400);
  assert.equal((await s.call('/api/stock', { method: 'PUT', data: { changes: [] } })).status, 400);
});

test('back in stock: raising stock above 0 emails everyone waiting once, from paddock@799motorsport.com', async t => {
  const s = setup(t); const mail = [];
  _resetCertCache();
  const app = createPitwall({ now: () => 1800000000000, fetchCerts, mailFetch: async (url, init) => { mail.push(JSON.parse(init.body)); return new Response('{"id":"em"}'); } });
  s.env.RESEND_API_KEY = 're_test';
  const call = (data) => app.fetch(new Request('https://pitwall.example/api/stock', { method: 'PUT', headers: { 'content-type': 'application/json', 'cf-access-jwt-assertion': token() }, body: JSON.stringify(data) }), s.env).then(r => r.json());
  s.sqlite.prepare("UPDATE stock SET qty = 0 WHERE key = 'KUASVS20'").run();
  for (const e of ['a@b.co', 'c@d.co']) s.sqlite.prepare("INSERT INTO restock_requests (sku, email, created_at) VALUES ('KUASVS20', ?, 1)").run(e);
  s.sqlite.prepare("INSERT INTO restock_requests (sku, email, created_at) VALUES ('LTP', 'z@z.co', 1)").run();
  assert.equal((await call({ changes: [{ sku: 'KUASVS20', qty: 0 }] })).notified, 0);
  const r = await call({ changes: [{ sku: 'KUASVS20', qty: 3 }] });
  assert.equal(r.notified, 2); assert.equal(mail.length, 2);
  const m = mail[0];
  assert.equal(m.from, '799 Motorsport Paddock <paddock@799motorsport.com>'); assert.equal(m.reply_to, 'mike@scirocco799.com');
  assert.equal(m.subject, "It's back: Tuff Jug 5 Gallon Utility Jug, Kawi Green");
  assert.match(m.html, /https:\/\/799motorsport\.com\/paddock\/tuff-jug\/tuff-jug-5-gallon\/\?color=Kawi%20Green/);
  assert.match(m.html, /tuffjug-5gal-kawi-spout-900\.webp/); assert.match(m.html, /\$45\.99/); assert.match(m.html, /Get it now/i);
  assert.equal((await call({ changes: [{ sku: 'KUASVS20', qty: 4 }] })).notified, 0);
  assert.equal(s.sqlite.prepare("SELECT COUNT(*) AS n FROM restock_requests WHERE sku = 'LTP' AND notified_at IS NULL").get().n, 1);
  delete s.env.RESEND_API_KEY;
  const held = await call({ changes: [{ sku: 'LTP', qty: 5 }] });
  assert.equal(held.notified, 0); assert.equal(held.held, 1);
});

test('orders: newest first with readable lines and event, and done / reopen', async t => {
  const s = setup(t);
  s.sqlite.prepare("INSERT INTO events (id, name, starts, ends, order_by, created_at, updated_at) VALUES ('empire-2027', 'Empire Hill Climb', '2027-09-18', '2027-09-19', '2027-09-15', 0, 0)").run();
  s.sqlite.prepare("INSERT INTO orders (session_id, created_at, livemode, fulfillment, email, amount_total, items, event_id, name, phone) VALUES ('cs_test_aaaaaaaa11112222', 2, 0, 'event', 'a@b.c', 12098, ?, 'empire-2027', 'Pat', '+1231')").run(JSON.stringify([{ p: 'jug', c: 'Red', q: 1 }, { p: 'pump', q: 1 }]));
  s.sqlite.prepare("INSERT INTO orders (session_id, created_at, livemode, fulfillment, items) VALUES ('cs_old', 1, 1, 'ship', '[]')").run();
  s.sqlite.prepare("INSERT INTO orders (session_id, created_at, livemode, fulfillment, items) VALUES ('cs_sku', 3, 0, 'pickup', ?)").run(JSON.stringify([{ s: 'KUASVS20', q: 2 }, { s: 'LTP', q: 1 }]));
  const o = (await s.call('/api/orders')).body.orders;
  assert.deepEqual(o[0].lines, ['2 × Tuff Jug 5 Gallon Utility Jug, Kawi Green', '1 × Tuff Jug Electric Transfer Pump']);
  o.shift();
  assert.equal(o[0].number, '799-11112222'); assert.equal(o[0].event, 'Empire Hill Climb');
  assert.deepEqual(o[0].lines, ['1 × Tuff Jug 5 Gallon Utility Jug, Red', '1 × Tuff Jug Electric Transfer Pump']);
  assert.equal(o[0].status, 'new'); assert.equal(o[1].id, 'cs_old');
  assert.equal((await s.call('/api/orders/cs_test_aaaaaaaa11112222', { method: 'PUT', data: { status: 'done' } })).status, 200);
  const row = s.sqlite.prepare("SELECT status, handled_at FROM orders WHERE session_id = 'cs_test_aaaaaaaa11112222'").get();
  assert.equal(row.status, 'done'); assert.equal(row.handled_at, 1800000000000);
  assert.equal((await s.call('/api/orders/nope', { method: 'PUT', data: { status: 'done' } })).status, 404);
});

test('prices: change price and MAP in catalog.json on GitHub, signed by the user, nothing else changes', async t => {
  const s = setup(t);
  const list = (await s.call('/api/products')).body;
  const pump = list.products.find(p => p.cart === 'pump');
  assert.equal(pump.price, 74.99); assert.equal(pump.map, 63.74); assert.match(pump.policy, /15% below MSRP/);
  const r = await s.call('/api/products/pump', { method: 'PUT', data: { price: '79.5', map: '67.58' } });
  assert.equal(r.status, 200); assert.equal(r.body.saved, true);
  const c = s.commits[0];
  assert.equal(c.branch, 'staging'); assert.equal(c.author.email, 'mike@scirocco799.com');
  assert.match(c.message, /Tuff Jug Electric Transfer Pump price \$74\.99 → \$79\.50, MAP \$63\.74 → \$67\.58 \(mike@scirocco799\.com\)/);
  const before = JSON.parse(CATALOG), after = JSON.parse(s.file());
  const p = after.products.find(x => x.cart === 'pump');
  assert.equal(p.price, '79.50'); assert.equal(p.map, 67.58);
  before.products.find(x => x.cart === 'pump').price = '79.50'; before.products.find(x => x.cart === 'pump').map = 67.58;
  assert.deepEqual(after, before);
  assert.equal(s.file().split('\n').length, CATALOG.split('\n').length);
  assert.equal((await s.call('/api/products/pump', { method: 'PUT', data: { price: '-3' } })).status, 400);
  assert.equal((await s.call('/api/products/nope', { method: 'PUT', data: { price: '3' } })).status, 404);
  assert.equal((await s.call('/api/products/jug', { method: 'PUT', data: { price: '45.99' } })).body.unchanged, true);
});

test('prices: MAP policy saves per brand; no GitHub key means prices are read-only', async t => {
  const s = setup(t);
  const r = await s.call('/api/brands/' + encodeURIComponent('Tuff Jug'), { method: 'PUT', data: { policy: 'New "policy" text.' } });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(s.file()).brands['Tuff Jug'].mapPolicy, 'New "policy" text.');
  assert.equal((await s.call('/api/brands/Nobody', { method: 'PUT', data: { policy: 'x' } })).status, 404);
  const ro = setup(t, { githubToken: '' });
  assert.equal((await ro.call('/api/products')).status, 503);
  assert.equal((await ro.call('/api/me')).body.prices, false);
});

test('setPrice and setPolicy edit only their own product or brand', () => {
  const out = setPrice(CATALOG, 'ripper', { price: 30 });
  assert.equal(JSON.parse(out).products.find(p => p.cart === 'ripper').price, '30.00');
  assert.equal(JSON.parse(out).products.find(p => p.cart === 'tuffspout').price, JSON.parse(CATALOG).products.find(p => p.cart === 'tuffspout').price);
  assert.throws(() => setPrice(CATALOG, 'nope', { price: 1 }));
  assert.equal(JSON.parse(setPolicy(CATALOG, 'New Brand', 'Hi')).brands['New Brand'].mapPolicy, 'Hi');
});

test('settings: order copies default to Mike, take several addresses, refuse bad ones, record who changed them', async t => {
  const s = setup(t);
  assert.deepEqual((await s.call('/api/settings')).body.orderCopies, ['mike@scirocco799.com']);
  const r = await s.call('/api/settings', { method: 'PUT', data: { orderCopies: [' Mike@Scirocco799.com ', 'crew@799motorsport.com', 'mike@scirocco799.com', ''] } });
  assert.equal(r.status, 200); assert.deepEqual(r.body.orderCopies, ['mike@scirocco799.com', 'crew@799motorsport.com']);
  const got = (await s.call('/api/settings')).body;
  assert.deepEqual(got.orderCopies, ['mike@scirocco799.com', 'crew@799motorsport.com']); assert.equal(got.by, 'mike@scirocco799.com');
  assert.equal((await s.call('/api/settings', { method: 'PUT', data: { orderCopies: ['nope'] } })).status, 400);
  assert.equal((await s.call('/api/settings', { method: 'PUT', data: { orderCopies: Array.from({ length: 11 }, (_, i) => i + '@x.co') } })).status, 400);
  assert.deepEqual((await s.call('/api/settings', { method: 'PUT', data: { orderCopies: [] } })).body.orderCopies, []);
});
