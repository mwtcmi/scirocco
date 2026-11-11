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
  assert.match(m.html, /https:\/\/799motorsport\.com\/paddock\/products\/tuff-jug-5-gallon\/\?color=Kawi%20Green/);
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

test('dashboard: sales by Michigan day/week/month, open orders, next event, stock to watch, customers, top sellers', async t => {
  const s = setup(t);
  const now = 1800000000000; // 2027-01-15 03:00 EST (Friday)
  const ins = (id, at, total, items, how = 'ship', status = 'new', ev = null) => s.sqlite.prepare("INSERT INTO orders (session_id, created_at, livemode, fulfillment, amount_total, items, status, event_id) VALUES (?, ?, 0, ?, ?, ?, ?, ?)").run(id, at, how, total, JSON.stringify(items), status, ev);
  ins('a', now - 3600e3, 1000, [{ s: 'LTP', q: 2 }]);                       // today
  ins('b', now - 3 * 864e5, 2000, [{ s: 'RUASVS20', q: 1 }], 'pickup', 'done'); // this week (Tue)
  ins('c', now - 10 * 864e5, 4000, [{ p: 'pump', q: 1 }], 'event', 'new', 'empire-2027'); // this month, older order format
  ins('d', now - 40 * 864e5, 8000, [{ s: 'LTP', q: 1 }], 'ship', 'done');        // last year
  s.sqlite.prepare("INSERT INTO events (id, name, starts, ends, order_by, created_at, updated_at) VALUES ('empire-2027', 'Empire Hill Climb', '2027-01-20', '2027-01-21', '2027-01-18', 0, 0)").run();
  s.sqlite.prepare("UPDATE stock SET qty = 0 WHERE key = 'SpoutBender'").run();
  s.sqlite.prepare("INSERT INTO restock_requests (sku, email, created_at) VALUES ('SpoutBender', 'a@b.co', 1)").run();
  s.sqlite.prepare("INSERT INTO customers (email, marketing, orders_count, created_at, updated_at) VALUES ('x@y.co', 'opt_in', 1, ?, ?), ('z@y.co', 'unknown', 0, 1, 1)").run(now - 864e5, now);
  const d = (await s.call('/api/dashboard')).body;
  assert.deepEqual(d.sales.today, { orders: 1, cents: 1000 });
  assert.deepEqual(d.sales.week, { orders: 2, cents: 3000 });
  assert.deepEqual(d.sales.month, { orders: 3, cents: 7000 });
  assert.equal(d.open.total, 2); assert.deepEqual(d.open.by, { ship: 1, event: 1 });
  assert.equal(d.nextEvent.name, 'Empire Hill Climb'); assert.equal(d.nextEvent.orders, 1); assert.equal(d.nextEvent.daysToCutoff, 3); assert.equal(d.nextEvent.open, true);
  const sb = d.stock.find(i => i.sku === 'SpoutBender'); assert.equal(sb.qty, 0); assert.equal(sb.waiting, 1);
  assert.deepEqual(d.customers, { total: 2, month: 1, optIn: 1, buyers: 1, signups: 0 });
  assert.deepEqual(d.top, [{ name: 'Tuff Jug Electric Transfer Pump', units: 3 }, { name: 'Tuff Jug 5 Gallon Utility Jug', units: 1 }]);
  // Refunds: a fully refunded order leaves sales, open orders, the event count and top sellers; a partial refund only lowers sales.
  ins('e', now - 1800e3, 5000, [{ s: 'SpoutBender', q: 5 }], 'event', 'new', 'empire-2027');
  ins('f', now - 1700e3, 0, [{ s: 'SpoutBender', q: 1 }], 'table');
  s.sqlite.prepare("UPDATE orders SET refunded_cents = 5000 WHERE session_id = 'e'").run();
  s.sqlite.prepare("UPDATE orders SET refunded_cents = 400 WHERE session_id = 'a'").run();
  const r = (await s.call('/api/dashboard')).body;
  assert.deepEqual(r.sales.today, { orders: 2, cents: 600 }, 'free table order still counts; refunded one does not');
  assert.equal(r.open.total, 3); assert.equal(r.nextEvent.orders, 1);
  assert.equal(r.top.find(x => x.name === 'Tuff Jug Spout Bender').units, 1);
  const list = (await s.call('/api/orders')).body.orders;
  assert.equal(list.find(o => o.id === 'e').refunded, 5000); assert.equal(list.find(o => o.id === 'b').refunded, 0);
});

test('customers: search, detail with orders, notes and email setting, CSV export, delete keeps orders without personal data', async t => {
  const s = setup(t);
  s.sqlite.prepare("INSERT INTO customers (email, name, phone, shipping, marketing, orders_count, total_spent, created_at, updated_at) VALUES ('pat@example.com', 'Pat Buyer', '+1231', ?, 'opt_in', 1, 4599, 1, 1), ('sam@example.com', 'Sam \"Quote\", Jr', NULL, NULL, 'unknown', 0, 0, 2, 2)")
    .run(JSON.stringify({ name: 'Pat Buyer', address: { line1: '1 Main', city: 'TC', state: 'MI', postal_code: '49684' } }));
  const pat = s.sqlite.prepare("SELECT id FROM customers WHERE email = 'pat@example.com'").get().id;
  s.sqlite.prepare("INSERT INTO orders (session_id, created_at, livemode, fulfillment, email, name, items, customer_id, amount_total) VALUES ('cs_test_pat00001', 5, 0, 'ship', 'pat@example.com', 'Pat Buyer', ?, ?, 4599)").run(JSON.stringify([{ s: 'RUASVS20', q: 1 }]), pat);
  s.sqlite.prepare("INSERT INTO restock_requests (sku, email, created_at) VALUES ('SpoutBender', 'pat@example.com', 1)").run();
  assert.equal((await s.call('/api/customers')).body.customers.length, 2);
  assert.deepEqual((await s.call('/api/customers?q=pat')).body.customers.map(c => c.email), ['pat@example.com']);
  assert.deepEqual((await s.call('/api/customers?q=%25')).body.customers.length, 2);
  const det = (await s.call('/api/customers/' + pat)).body;
  assert.equal(det.customer.shipping.address.line1, '1 Main'); assert.deepEqual(det.orders[0].lines, ['1 × Tuff Jug 5 Gallon Utility Jug, Red']);
  assert.deepEqual(det.waiting, ['Tuff Jug Spout Bender']);
  const put = await s.call('/api/customers/' + pat, { method: 'PUT', data: { notes: 'Prefers pickup', marketing: 'opt_out' } });
  assert.equal(put.status, 200);
  const row = s.sqlite.prepare('SELECT notes, marketing, marketing_source FROM customers WHERE id = ?').get(pat);
  assert.equal(row.notes, 'Prefers pickup'); assert.equal(row.marketing, 'opt_out'); assert.equal(row.marketing_source, 'pitwall: mike@scirocco799.com');
  assert.equal((await s.call('/api/customers/' + pat, { method: 'PUT', data: { marketing: 'spam' } })).status, 400);
  const csv = await s.call('/api/customers.csv');
  assert.match(csv.res.headers.get('content-type'), /text\/csv/);
  const lines = csv.body.trim().split('\r\n');
  assert.equal(lines.length, 3); assert.match(lines[0], /^email,name,business,phone,marketing/);
  assert.match(csv.body, /"Sam ""Quote"", Jr"/); assert.match(csv.body, /Pat Buyer, 1 Main, TC, MI 49684/);
  assert.equal((await s.call('/api/customers/' + pat, { method: 'DELETE' })).status, 200);
  assert.equal(s.sqlite.prepare('SELECT COUNT(*) AS n FROM customers WHERE id = ?').get(pat).n, 0);
  const o = s.sqlite.prepare("SELECT email, name, amount_total, customer_id FROM orders WHERE session_id = 'cs_test_pat00001'").get();
  assert.deepEqual({ ...o }, { email: null, name: null, amount_total: 4599, customer_id: null });
  assert.equal(s.sqlite.prepare("SELECT COUNT(*) AS n FROM restock_requests WHERE email = 'pat@example.com'").get().n, 0);
  assert.equal((await s.call('/api/customers/999')).status, 404);
});

test('add customer by hand: in-person 799 News opt-in goes straight to Resend; duplicates refused; changing the setting syncs', async t => {
  const s = setup(t); const calls = [];
  _resetCertCache();
  const app = createPitwall({ now: () => 1800000000000, fetchCerts, newsFetch: async (url, init) => { calls.push([init.method, url.replace('https://api.resend.com', ''), init.body ? JSON.parse(init.body) : null]); return new Response('{"id":"c"}', { status: 201 }); } });
  Object.assign(s.env, { RESEND_API_KEY: 're_test', NEWS_TOPIC: 'top_799', NEWS_SEGMENT: 'seg_799' });
  const call = (method, path, data) => app.fetch(new Request('https://pitwall.example' + path, { method, headers: { 'content-type': 'application/json', 'cf-access-jwt-assertion': token() }, body: data ? JSON.stringify(data) : undefined }), s.env).then(async r => ({ status: r.status, body: await r.json() }));
  const r = await call('POST', '/api/customers', { email: 'Track@Fan.co', firstName: 'Track', lastName: 'Fan', business: 'Fan Racing', phone: '+1555', notes: 'Met at Empire', news: true });
  assert.equal(r.status, 201); assert.equal(r.body.synced, true);
  const row = s.sqlite.prepare('SELECT * FROM customers WHERE id = ?').get(r.body.id);
  assert.equal(row.email, 'track@fan.co'); assert.equal(row.business, 'Fan Racing'); assert.equal(row.marketing, 'opt_in'); assert.equal(row.marketing_source, 'in person: mike@scirocco799.com'); assert.equal(row.source, 'pitwall');
  assert.deepEqual(calls[0], ['POST', '/contacts', { email: 'track@fan.co', first_name: 'Track', last_name: 'Fan', segments: [{ id: 'seg_799' }], topics: [{ id: 'top_799', subscription: 'opt_in' }] }]);
  assert.equal((await call('POST', '/api/customers', { email: 'track@fan.co' })).status, 409);
  assert.equal((await call('POST', '/api/customers', { email: 'nope' })).status, 400);
  const put = await call('PUT', '/api/customers/' + r.body.id, { marketing: 'opt_out' });
  assert.equal(put.body.synced, true);
  assert.deepEqual(calls.at(-1), ['PATCH', '/contacts/track%40fan.co/topics', [{ id: 'top_799', subscription: 'opt_out' }]]);
  const quiet = await call('POST', '/api/customers', { email: 'quiet@fan.co' });
  assert.equal(quiet.body.synced, false); assert.equal(calls.length, 2);
  s.sqlite.prepare("INSERT INTO signups (token, email, created_at) VALUES ('tok1', 'track@fan.co', 1)").run();
  const del = await call('DELETE', '/api/customers/' + r.body.id);
  assert.equal(del.status, 200); assert.equal(del.body.news, true);
  assert.deepEqual(calls.slice(2), [['PATCH', '/contacts/track%40fan.co/topics', [{ id: 'top_799', subscription: 'opt_out' }]], ['DELETE', '/contacts/track%40fan.co/segments/seg_799', null]]);
  assert.equal(s.sqlite.prepare("SELECT COUNT(*) AS n FROM signups WHERE email = 'track@fan.co'").get().n, 0);
});

test('order page: one order with buyer, delivery, items at their sold price, money breakdown, refund and a Stripe link', async t => {
  const s = setup(t);
  s.sqlite.prepare("INSERT INTO customers (email, name, created_at, updated_at) VALUES ('pat@example.com', 'Pat Buyer', 1, 1)").run();
  const cid = s.sqlite.prepare("SELECT id FROM customers").get().id;
  s.sqlite.prepare(`INSERT INTO orders (session_id, created_at, livemode, fulfillment, email, name, phone, amount_total, items, customer_id, payment_intent, amount_subtotal, amount_shipping, amount_tax, amount_discount, refunded_cents, ship_to)
    VALUES ('cs_live_abc12345', 5, 1, 'ship', 'pat@example.com', 'Pat Buyer', '+12315550100', 7525, ?, ?, 'pi_123', 4599, 2500, 426, 0, 1000, ?)`)
    .run(JSON.stringify([{ s: 'RUASVS20', q: 1, u: 4599 }]), cid, JSON.stringify({ name: 'Pat Buyer', address: { line1: '1 Main', city: 'TC', state: 'MI', postal_code: '49684' } }));
  s.sqlite.prepare("INSERT INTO orders (session_id, created_at, livemode, fulfillment, amount_total, items) VALUES ('cs_test_old00001', 4, 0, 'pickup', 4599, ?)").run(JSON.stringify([{ p: 'jug', c: 'Black', q: 1 }]));
  const o = (await s.call('/api/orders/cs_live_abc12345')).body.order;
  assert.equal(o.number, '799-ABC12345'); assert.equal(o.customer.id, cid); assert.equal(o.shipTo.address.line1, '1 Main');
  assert.deepEqual(o.items, [{ name: 'Tuff Jug 5 Gallon Utility Jug', variant: 'Red', sku: 'RUASVS20', qty: 1, unit: 4599, line: 4599, shipped: 0, remaining: 1 }]);
  assert.deepEqual(o.totals, { subtotal: 4599, shipping: 2500, tax: 426, discount: 0, total: 7525, refunded: 1000 });
  assert.equal(o.stripe, 'https://dashboard.stripe.com/payments/pi_123');
  const old = (await s.call('/api/orders/cs_test_old00001')).body.order;
  assert.equal(old.items[0].variant, 'Black'); assert.equal(old.items[0].unit, null); assert.equal(old.stripe, null);
  assert.equal((await s.call('/api/orders/cs_nope')).status, 404);
});

test('free shipping: Pitwall turns it on and off for one product without touching the rest', async t => {
  const on = setPrice(CATALOG, 'pump', { freeShipping: true });
  const data = JSON.parse(on);
  assert.equal(data.products.find(p => p.cart === 'pump').freeShipping, true);
  assert.equal(data.products.filter(p => p.freeShipping).length, 1);
  const off = setPrice(on, 'pump', { freeShipping: false });
  assert.equal(JSON.parse(off).products.find(p => p.cart === 'pump').freeShipping, false);
  assert.equal(setPrice(CATALOG, 'pump', { freeShipping: false }), CATALOG, 'turning off when never on changes nothing');
  const s = setup(t);
  assert.equal((await s.call('/api/products/pump', { method: 'PUT', data: { freeShipping: true } })).status, 200);
  assert.equal((await s.call('/api/products')).body.products.find(p => p.cart === 'pump').freeShipping, true);
});

test('shipments: partial shipping, several boxes, edits, removal, status and the customer email', async t => {
  const s = setup(t); const mail = [];
  _resetCertCache();
  const app = createPitwall({ now: () => 1800000000000, fetchCerts, mailFetch: async (url, init) => { mail.push({ key: init.headers['Idempotency-Key'], ...JSON.parse(init.body) }); return new Response('{"id":"em"}'); } });
  s.env.RESEND_API_KEY = 're_test';
  const call = async (path, method = 'GET', data) => { const r = await app.fetch(new Request('https://pitwall.example' + path, { method, headers: { 'content-type': 'application/json', 'cf-access-jwt-assertion': token() }, body: data === undefined ? undefined : JSON.stringify(data) }), s.env); return { status: r.status, body: await r.json() }; };
  s.sqlite.prepare(`INSERT INTO orders (session_id, created_at, livemode, fulfillment, email, name, amount_total, items, ship_to) VALUES ('cs_live_ship0001', 1, 1, 'ship', 'pat@example.com', 'Pat Buyer', 20000, ?, ?)`)
    .run(JSON.stringify([{ s: 'RUASVS20', q: 2, u: 4599 }, { s: 'LTP', q: 1, u: 7499 }]), JSON.stringify({ name: 'Pat Buyer', address: { line1: '1 Main', city: 'TC', state: 'MI', postal_code: '49684' } }));
  s.sqlite.prepare("INSERT INTO orders (session_id, created_at, livemode, fulfillment, amount_total, items) VALUES ('cs_live_pick0001', 1, 1, 'pickup', 100, '[]')").run();
  const P = '/api/orders/cs_live_ship0001/shipments';
  // Refused: no carrier, no tracking, too many, pickup orders
  assert.equal((await call(P, 'POST', { carrier: 'pony', tracking: ['1'], items: [{ i: 0, q: 1 }] })).status, 400);
  assert.equal((await call(P, 'POST', { carrier: 'usps', tracking: [], items: [{ i: 0, q: 1 }] })).status, 400);
  assert.match((await call(P, 'POST', { carrier: 'usps', tracking: ['1'], items: [{ i: 0, q: 3 }] })).body.error, /Only 2/);
  assert.equal((await call('/api/orders/cs_live_pick0001/shipments', 'POST', { carrier: 'usps', tracking: ['1'], items: [{ i: 0, q: 1 }] })).status, 400);
  // Partial: one jug in one box
  const a = await call(P, 'POST', { carrier: 'usps', tracking: ['9400 1111 2222'], items: [{ i: 0, q: 1 }] });
  assert.deepEqual([a.status, a.body.status, a.body.emailed], [200, 'partial', true]);
  assert.equal(mail[0].to[0], 'pat@example.com'); assert.match(mail[0].subject, /^Part of your 799 order 799-SHIP0001 has shipped$/);
  assert.match(mail[0].html, /tLabels=940011112222/); assert.match(mail[0].text, /Still to ship:\n  1 × Tuff Jug 5 Gallon Utility Jug, Red\n  1 × Tuff Jug Electric Transfer Pump/);
  // The rest in two boxes with another carrier, no email
  const b = await call(P, 'POST', { carrier: 'other', carrierName: 'Speedee', tracking: ['A1', 'A2', 'A1'], items: [{ i: 0, q: 1 }, { i: 1, q: 1 }], email: false });
  assert.deepEqual([b.body.status, b.body.emailed], ['done', null]); assert.equal(mail.length, 1);
  const o = (await call('/api/orders/cs_live_ship0001')).body.order;
  assert.equal(o.shipments.length, 2); assert.deepEqual(o.shipments[1].tracking, [{ number: 'A1', url: null }, { number: 'A2', url: null }]);
  assert.equal(o.shipments[1].carrierName, 'Speedee'); assert.deepEqual(o.items.map(i => i.remaining), [0, 0]);
  assert.equal(s.sqlite.prepare("SELECT status FROM orders WHERE session_id = 'cs_live_ship0001'").get().status, 'done');
  assert.match((await call(P, 'POST', { carrier: 'ups', tracking: ['1Z'], items: [{ i: 1, q: 1 }] })).body.error, /Only 0/, 'nothing left to ship');
  // Edit the first shipment (fix tracking) and email the correction; its own item can stay in it
  const e = await call(P + '/' + a.body.id, 'PUT', { carrier: 'ups', tracking: ['1Z999'], items: [{ i: 0, q: 1 }], email: true });
  assert.deepEqual([e.body.status, e.body.emailed], ['done', true]); assert.match(mail[1].subject, /^Your 799 order 799-SHIP0001 has shipped$/); assert.match(mail[1].html, /ups\.com\/track\?tracknum=1Z999/);
  // Remove the second: back to partly shipped, no email
  const d = await call(P + '/' + b.body.id, 'DELETE');
  assert.equal(d.body.status, 'partial'); assert.equal(mail.length, 2);
  assert.equal((await call(P + '/999', 'DELETE')).status, 404);
});

test('prices: list price saves to catalog.json; dealer cost saves to the database only, never to GitHub', async t => {
  const s = setup(t);
  let x = (await s.call('/api/products')).body.products.find(p => p.cart === 'xzns400a');
  assert.equal(x.list, 124.11); assert.equal(x.cost, null);
  // Cost alone: no commit, and it never appears in catalog.json.
  const r = await s.call('/api/products/xzns400a', { method: 'PUT', data: { cost: '67.46' } });
  assert.equal(r.status, 200); assert.equal(r.body.cost, 67.46);
  assert.equal(s.commits.length, 0);
  assert.doesNotMatch(s.file(), /67\.46/);
  assert.equal(s.sqlite.prepare("SELECT cents FROM product_costs WHERE cart = 'xzns400a'").get().cents, 6746);
  x = (await s.call('/api/products')).body.products.find(p => p.cart === 'xzns400a');
  assert.equal(x.cost, 67.46);
  // List with cost: list goes to GitHub, cost to the database.
  const r2 = await s.call('/api/products/xzns400a', { method: 'PUT', data: { list: '130', cost: '66' } });
  assert.equal(r2.status, 200);
  assert.equal(JSON.parse(s.file()).products.find(p => p.cart === 'xzns400a').list, 130);
  assert.match(s.commits[0].message, /list \$124\.11 → \$130\.00/);
  assert.doesNotMatch(s.commits[0].message + s.file(), /\b66\.00\b|"cost"/);
  assert.equal(s.sqlite.prepare("SELECT cents FROM product_costs WHERE cart = 'xzns400a'").get().cents, 6600);
  // Clearing the cost, bad values, unknown products.
  assert.equal((await s.call('/api/products/xzns400a', { method: 'PUT', data: { cost: '' } })).status, 200);
  assert.equal(s.sqlite.prepare("SELECT COUNT(*) AS n FROM product_costs").get().n, 0);
  assert.equal((await s.call('/api/products/xzns400a', { method: 'PUT', data: { cost: '-1' } })).status, 400);
  assert.equal((await s.call('/api/products/xzns400a', { method: 'PUT', data: { list: '0' } })).status, 400);
  assert.equal((await s.call('/api/products/nope', { method: 'PUT', data: { cost: '5' } })).status, 404);
});

test('prices: each configurator option has its own price, MAP, list and private cost', async t => {
  const s = setup(t);
  const m = (await s.call('/api/products')).body.products.find(p => p.cart === 'mvrk');
  assert.equal(m.price, null);
  const fr = m.variants.find(v => v.sku === 'FR6USA');
  assert.deepEqual([fr.name, fr.price, fr.map, fr.list, fr.cost, fr.status], ['3/8" Flex, 12"', 149.99, 109.52, 149.35, null, 'live']);
  assert.equal(m.variants.find(v => v.sku === 'R4USA').status, 'coming-soon');
  // Cost alone for one option: saved under its SKU, no commit.
  assert.equal((await s.call('/api/products/' + encodeURIComponent('mvrk/FR6USA'), { method: 'PUT', data: { cost: '81.18' } })).status, 200);
  assert.equal(s.commits.length, 0);
  assert.equal(s.sqlite.prepare("SELECT cents FROM product_costs WHERE cart = 'FR6USA'").get().cents, 8118);
  assert.equal((await s.call('/api/products')).body.products.find(p => p.cart === 'mvrk').variants.find(v => v.sku === 'FR6USA').cost, 81.18);
  // A price change edits only that option's line.
  const before = JSON.parse(s.file()).products.find(p => p.cart === 'mvrk').variants;
  const r = await s.call('/api/products/' + encodeURIComponent('mvrk/R6USA'), { method: 'PUT', data: { price: '114.99', list: '119.50' } });
  assert.equal(r.status, 200);
  const after = JSON.parse(s.file()).products.find(p => p.cart === 'mvrk').variants;
  assert.equal(after.find(v => v.sku === 'R6USA').price, '114.99');
  assert.equal(after.find(v => v.sku === 'R6USA').list, 119.5);
  assert.deepEqual(after.filter(v => v.sku !== 'R6USA'), before.filter(v => v.sku !== 'R6USA'));
  assert.match(s.commits[0].message, /VIM MVRK Ratchets, 3\/8" Fixed, 8" .*price \$119\.99 → \$114\.99/);
  // The product itself has no single price, and unknown options are refused.
  assert.equal((await s.call('/api/products/mvrk', { method: 'PUT', data: { price: '99' } })).status, 404);
  assert.equal((await s.call('/api/products/' + encodeURIComponent('mvrk/NOPE'), { method: 'PUT', data: { price: '99' } })).status, 404);
  assert.equal((await s.call('/api/products/' + encodeURIComponent('mvrk/FR6USA'), { method: 'PUT', data: { freeShipping: true } })).status, 400);
});

test('setPrice adds a list price after MAP when a product has none, and edits it in place after', () => {
  const text = CATALOG.replace(/("cart": "pump", "map": [0-9.]+), "list": [0-9.]+,/, '$1,');
  assert.equal(JSON.parse(text).products.find(p => p.cart === 'pump').list, undefined);
  const out = setPrice(text, 'pump', { list: 80 });
  assert.match(out, /"cart": "pump", "map": 63\.74, "list": 80,/);
  assert.equal(JSON.parse(setPrice(out, 'pump', { list: 81.5 })).products.find(p => p.cart === 'pump').list, 81.5);
  assert.equal(JSON.parse(out).products.find(p => p.cart === 'jug').list, 45.99);
});
