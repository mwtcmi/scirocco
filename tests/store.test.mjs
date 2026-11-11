import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import * as worker from '../store/worker.mjs';
import { createWorker, priceWarnings, verifySignature, orderEmail, checkoutParams, buyer } from '../store/worker.mjs';

const require = createRequire(import.meta.url);
const { database } = require('./helpers/d1.cjs');
const SECRET = 'whsec_test123';

function service(t, { key = 'rk_test_abc', stripeStatus = 200, emailStatus = 200 } = {}) {
  const storage = database('../../store/migrations'); t.after(storage.close);
  let time = 1800000000000; const sent = [];
  const stripeFetch = async (url, init) => { sent.push({ url, init, params: new URLSearchParams(init.body.toString()) });
    return new Response(JSON.stringify(stripeStatus === 200 ? { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' } : { error: { message: 'nope' } }), { status: stripeStatus }); };
  const mail = [];
  const emailFetch = async (url, init) => { mail.push({ url, init, body: JSON.parse(init.body) }); return new Response('{"id":"em_1"}', { status: emailStatus }); };
  const worker = createWorker({ now: () => time, stripeFetch, emailFetch });
  const env = { DB: storage.db, STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: SECRET };
  async function call(path, { method = 'GET', data, origin = 'https://799motorsport.com', raw, headers = {} } = {}) {
    const h = { ...headers }; if (origin) h.origin = origin;
    const body = raw ?? (data === undefined ? undefined : JSON.stringify(data));
    const res = await worker.fetch(new Request('https://store.example' + path, { method, headers: h, body }), env);
    const text = method === 'OPTIONS' ? '' : await res.text();
    return { status: res.status, body: text && /json/.test(res.headers.get('content-type') || '') ? JSON.parse(text) : text || null, res };
  }
  function sign(payload, at = Math.floor(time / 1000)) {
    const sig = crypto.createHmac('sha256', SECRET).update(at + '.' + payload).digest('hex');
    return 't=' + at + ',v1=' + sig;
  }
  async function webhook(event, sig) {
    const raw = JSON.stringify(event);
    return call('/api/stripe-webhook', { method: 'POST', raw, origin: null, headers: { 'stripe-signature': sig ?? sign(raw) } });
  }
  return { ...storage, call, webhook, sign, sent, mail, env };
}

const paid = (id, items, fulfillment = 'pickup') => ({ type: 'checkout.session.completed', data: { object: {
  id, livemode: false, payment_status: 'paid', amount_total: 4999, customer_details: { email: 'a@b.c' }, metadata: { items: JSON.stringify(items), fulfillment } } } });

test('health reports setup state and no MAP warnings at MSRP', async t => {
  const s = service(t);
  const r = await s.call('/');
  assert.equal(r.body.ok, true); assert.equal(r.body.stripeKey, 'test'); assert.equal(r.body.webhookSecret, 'set');
  assert.deepEqual(priceWarnings(), []);
});

test('catalog returns stock and options', async t => {
  const s = service(t);
  const r = await s.call('/api/catalog');
  assert.equal(r.status, 200); assert.equal(r.body.stock['jug/color/Red'], 2); assert.equal(r.body.stock.pump, 2);
  assert.equal(r.body.catalog.jug.cents, 4599); assert.equal(r.body.catalog.ripper.cents, 2799); assert.equal(r.body.stock.tuffspout, 2);
  assert.equal(r.body.catalog.spoutbender.cents, 799); assert.equal(r.body.stock.spoutbender, 2);
  assert.equal(r.res.headers.get('access-control-allow-origin'), 'https://799motorsport.com');
});

test('merchant feed lists every live SKU with live stock and price', async t => {
  const s = service(t);
  const r = await s.call('/api/merchant-feed.xml', { origin: null });
  assert.equal(r.status, 200); assert.match(r.res.headers.get('content-type'), /xml/);
  const item = id => r.body.split('<item>').find(x => x.startsWith('<g:id>' + id + '<'));
  assert.ok(item('RUASVS20') && item('LTP') && item('BLKR20'));
  assert.match(item('LTP'), /<g:availability>in_stock<\/g:availability>/); assert.match(item('BLKR20'), /<g:price>27\.99 USD<\/g:price>/);
  const fr6 = item('FR6USA');
  assert.match(fr6, /<title>VIM MVRK 3\/8&quot; Drive Flex Head Ratchet, 12&quot;<\/title>/);
  assert.match(fr6, /<g:item_group_id>vim-mvrk-ratchets<\/g:item_group_id>/); assert.match(fr6, /\?sku=FR6USA<\/link>/);
  assert.match(fr6, /<g:gtin>092308686192<\/g:gtin>/); assert.match(fr6, /<g:price>149\.99 USD<\/g:price>/);
  assert.match(fr6, /<g:image_link>[^<]*vim-fr6usa-side-900\.webp</); // a plain photo leads; the measured shot is extra
  assert.ok(!r.body.includes('MVRK-SET')); // only real SKUs
});

test('other origins are refused', async t => {
  const s = service(t);
  assert.equal((await s.call('/api/catalog', { origin: 'https://evil.example' })).status, 403);
});

test('pickup checkout prices on the server and skips shipping address', async t => {
  const s = service(t);
  const r = await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', items: [
    { product: 'jug', color: 'Red', qty: 1, cents: 1 }, { product: 'pump', qty: 1 }, { product: 'ripper', qty: 1 }] } });
  assert.equal(r.status, 200); assert.match(r.body.url, /checkout\.stripe\.com/);
  const p = s.sent[0].params;
  assert.equal(p.get('line_items[0][price_data][unit_amount]'), '4599');
  assert.match(p.get('line_items[0][price_data][product_data][description]'), /RUASVS20/);
  assert.equal(p.get('line_items[2][price_data][unit_amount]'), '2799');
  assert.equal(p.get('line_items[1][price_data][unit_amount]'), '7499');
  assert.equal(p.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
  assert.equal(p.get('shipping_address_collection[allowed_countries][0]'), null);
  assert.equal(p.get('allow_promotion_codes'), 'true');
  assert.equal(p.get('payment_method_types[0]'), 'card'); assert.equal(p.get('payment_method_types[1]'), null); assert.equal(p.get('excluded_payment_method_types[0]'), null);
  assert.equal(p.get('success_url'), 'https://799motorsport.com/paddock?order=success&via=pickup&ref={CHECKOUT_SESSION_ID}');
  assert.equal(s.sent[0].init.headers.Authorization, 'Bearer rk_test_abc');
});

test('ship checkout collects a US address and charges the flat rate', async t => {
  const s = service(t);
  await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'ship', items: [{ product: 'jug', color: 'Black', qty: 2 }] } });
  const p = s.sent[0].params;
  assert.equal(p.get('shipping_address_collection[allowed_countries][0]'), 'US');
  assert.equal(p.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '2500');
  assert.equal(p.get('line_items[0][quantity]'), '2');
});

test('bad items and over-stock carts are refused', async t => {
  const s = service(t);
  assert.equal((await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', items: [{ product: 'jug', color: 'Pink', qty: 1 }] } })).status, 400);
  assert.equal((await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'mail', items: [{ product: 'pump', qty: 1 }] } })).status, 400);
  const r = await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', items: [{ product: 'jug', color: 'Red', qty: 3 }] } });
  assert.equal(r.status, 409); assert.deepEqual(r.body.soldOut, ['RUASVS20']);
  assert.equal(s.sent.length, 0);
});

test('checkout without a key or with a Stripe error fails cleanly', async t => {
  const a = service(t, { key: '' });
  assert.equal((await a.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', items: [{ product: 'pump', qty: 1 }] } })).status, 503);
  const b = service(t, { stripeStatus: 400 });
  assert.equal((await b.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', items: [{ product: 'pump', qty: 1 }] } })).status, 502);
});

test('paid webhook takes stock off once, even if Stripe retries', async t => {
  const s = service(t);
  const ev = paid('cs_test_1', [{ p: 'jug', c: 'Red', q: 1 }, { p: 'pump', q: 1 }, { p: 'tuffspout', q: 2 }]);
  assert.equal((await s.webhook(ev)).body.result, 'recorded');
  assert.equal((await s.webhook(ev)).body.result, 'duplicate');
  const stock = (await s.call('/api/catalog')).body.stock;
  assert.equal(stock['jug/color/Red'], 1); assert.equal(stock.tuffspout, 0); assert.equal(stock.pump, 1);
  const order = s.sqlite.prepare('SELECT * FROM orders').get();
  assert.equal(order.fulfillment, 'pickup'); assert.equal(order.email, 'a@b.c');
});

test('webhooks with bad or old signatures are rejected', async t => {
  const s = service(t);
  const ev = paid('cs_test_2', [{ p: 'pump', q: 1 }]);
  assert.equal((await s.webhook(ev, 't=1,v1=deadbeef')).status, 400);
  const raw = JSON.stringify(ev);
  assert.equal((await s.webhook(ev, s.sign(raw, Math.floor(1800000000000 / 1000) - 1000))).status, 400);
  assert.equal(await verifySignature(raw, s.sign(raw), SECRET, Math.floor(1800000000000 / 1000)), true);
  assert.equal((await s.call('/api/catalog')).body.stock.pump, 2);
});

test('unpaid sessions are ignored', async t => {
  const s = service(t);
  const ev = paid('cs_test_3', [{ p: 'pump', q: 1 }]); ev.data.object.payment_status = 'unpaid';
  assert.match((await s.webhook(ev)).body.ignored, /completed/);
  assert.equal((await s.call('/api/catalog')).body.stock.pump, 2);
});

test('Stripe Tax on: pre-tax prices with tax codes, and pickup collects a billing address', async t => {
  const s = service(t); s.env.STRIPE_TAX = 'on';
  await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', items: [{ product: 'jug', color: 'Red', qty: 1 }] } });
  const p = s.sent[0].params;
  assert.equal(p.get('automatic_tax[enabled]'), 'true');
  assert.equal(p.get('line_items[0][price_data][tax_behavior]'), 'exclusive');
  assert.equal(p.get('line_items[0][price_data][product_data][tax_code]'), 'txcd_99999999');
  assert.equal(p.get('shipping_options[0][shipping_rate_data][tax_code]'), 'txcd_92010001');
  assert.equal(p.get('billing_address_collection'), 'required');
  assert.equal((await s.call('/')).body.tax, 'stripe');
});

test('Stripe Tax off by default', async t => {
  const s = service(t);
  await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'ship', items: [{ product: 'pump', qty: 1 }] } });
  assert.equal(s.sent[0].params.get('automatic_tax[enabled]'), null);
});

test('paid order sends one branded confirmation through Resend, with a copy to Mike', async t => {
  const s = service(t); s.env.RESEND_API_KEY = 're_test';
  const ev = paid('cs_live_abcd1234', [{ p: 'jug', c: 'Orange', q: 2 }, { p: 'ripper', q: 1 }]);
  Object.assign(ev.data.object, { customer_details: { email: 'buyer@example.com', name: 'Pat <Smith>' }, amount_subtotal: 11943, amount_total: 12660,
    total_details: { amount_shipping: 0, amount_tax: 717, amount_discount: 0 } });
  const r = await s.webhook(ev);
  assert.equal(r.body.email, 'sent'); assert.equal(s.mail.length, 1);
  const m = s.mail[0];
  assert.equal(m.url, 'https://api.resend.com/emails'); assert.equal(m.init.headers.Authorization, 'Bearer re_test');
  assert.equal(m.init.headers['Idempotency-Key'], 'order-cs_live_abcd1234');
  assert.deepEqual(m.body.to, ['buyer@example.com']); assert.deepEqual(m.body.bcc, ['mike@scirocco799.com']);
  assert.equal(m.body.reply_to, 'mike@scirocco799.com'); assert.equal(m.body.from, '799 Motorsport Paddock <paddock@799motorsport.com>');
  assert.equal(m.body.subject, 'Your 799 Motorsport order 799-ABCD1234'); assert.match(m.body.html, /799 <span style="color:#20C933">MOTORSPORT/);
  assert.match(m.body.html, /OUAS20VS/); assert.match(m.body.html, /\$91\.98/); assert.match(m.body.html, /\$7\.17/); assert.match(m.body.html, /\$126\.60/);
  assert.match(m.body.html, /Thanks, Pat/); assert.doesNotMatch(m.body.html, /<Smith>/);
  assert.match(m.body.text, /pickup in Downtown Traverse City/);
  assert.equal((await s.webhook(ev)).body.email, 'skipped'); assert.equal(s.mail.length, 1);
});

test('shipping confirmation shows the address; no key means no email; Resend errors do not fail the webhook', async t => {
  const session = { id: 'cs_x_00000001', metadata: { fulfillment: 'ship', items: JSON.stringify([{ p: 'pump', q: 1 }]) }, customer_details: { email: 'x@y.z' },
    amount_total: 9999, collected_information: { shipping_details: { name: 'Pat Smith', address: { line1: '1 Main St', city: 'Detroit', state: 'MI', postal_code: '48201' } } },
    total_details: { amount_shipping: 2500, amount_tax: 0 } };
  const m = orderEmail(session);
  assert.match(m.html, /Shipping to/); assert.match(m.html, /Detroit, MI 48201/); assert.match(m.text, /ship within 2 business days/); assert.match(m.html, /\$25\.00/);
  const off = service(t);
  assert.equal((await off.webhook(paid('cs_test_9', [{ p: 'pump', q: 1 }]))).body.email, 'off'); assert.equal(off.mail.length, 0);
  assert.equal((await off.call('/')).body.email, 'off');
  const bad = service(t, { emailStatus: 422 }); bad.env.RESEND_API_KEY = 're_test';
  const r = await bad.webhook(paid('cs_test_10', [{ p: 'pump', q: 1 }]));
  assert.equal(r.status, 200); assert.equal(r.body.result, 'recorded'); assert.equal(r.body.email, 'failed');
});

test('sample emails go to Mike only, and only while SAMPLE_EMAILS is on', async t => {
  const s = service(t); s.env.RESEND_API_KEY = 're_test';
  assert.equal((await s.call('/api/sample-emails')).status, 404); assert.equal(s.mail.length, 0);
  s.env.SAMPLE_EMAILS = 'on';
  const r = await s.call('/api/sample-emails');
  assert.equal(r.status, 200); assert.deepEqual(r.body.results, ['sent', 'sent', 'sent', 'sent']);
  assert.equal(s.mail.length, 4); assert.match(s.mail[3].body.subject, /You're on the list/);
  for (const m of s.mail) { assert.deepEqual(m.body.to, ['mike@scirocco799.com']); assert.equal(m.body.bcc, undefined); assert.match(m.body.subject, /^\[Sample\] /); }
  assert.match(s.mail[1].body.html, /Columbus, OH 43215/); assert.match(s.mail[1].body.html, /Discount/);
  assert.equal((await s.call('/api/stock')).status, 404);
});

test('track-table checkout: free, no phone or address, table wording, and a table email', async t => {
  const s = service(t); s.env.STRIPE_TAX = 'on';
  const r = await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'table', items: [{ product: 'jug', color: 'Red', qty: 1 }] } });
  assert.equal(r.status, 200);
  const p = s.sent[0].params;
  assert.equal(p.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
  assert.equal(p.get('phone_number_collection[enabled]'), null); assert.equal(p.get('shipping_address_collection[allowed_countries][0]'), null);
  assert.equal(p.get('billing_address_collection'), 'required');
  assert.match(p.get('custom_text[submit][message]'), /799 table/);
  assert.equal(p.get('success_url'), 'https://799motorsport.com/paddock?order=success&via=table&ref={CHECKOUT_SESSION_ID}');
  const m = orderEmail({ id: 'cs_live_tbl00001', metadata: { fulfillment: 'table', items: JSON.stringify([{ p: 'jug', c: 'Red', q: 1 }]) }, amount_subtotal: 4599, amount_total: 4875, total_details: { amount_tax: 276 } });
  assert.match(m.text, /Paid at the 799 table/); assert.doesNotMatch(m.text, /Local pickup|Shipping:/); assert.match(m.text, /Total paid: \$48\.75/);
});

test('cancelled checkout returns to the store page the buyer came from, and only under /paddock', async t => {
  const s = service(t);
  await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', returnPath: '/paddock/products/tuff-spout/', items: [{ product: 'tuffspout', qty: 1 }] } });
  assert.equal(s.sent[0].params.get('cancel_url'), 'https://799motorsport.com/paddock/products/tuff-spout/?order=cancelled');
  assert.match(s.sent[0].params.get('success_url'), /^https:\/\/799motorsport\.com\/paddock\?order=success/);
  for (const bad of ['https://evil.example/', '//evil.example', '/returns', '/paddock/../x', '/paddock/a?b=1']) {
    await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', returnPath: bad, items: [{ product: 'tuffspout', qty: 1 }] } });
    assert.equal(s.sent.at(-1).params.get('cancel_url'), 'https://799motorsport.com/paddock?order=cancelled', bad);
  }
});

test('checkout catalog comes from store/catalog.json: every cart product priced, at or above MAP', async () => {
  const file = JSON.parse(fs.readFileSync(new URL('../store/catalog.json', import.meta.url), 'utf8'));
  const cart = file.products.filter(p => p.cart && (p.status || 'live') === 'live'); // checkout sells live products only
  assert.deepEqual(Object.keys(worker.CATALOG).sort(), cart.map(p => p.cart).sort());
  for (const p of cart) {
    const c = worker.CATALOG[p.cart];
    if (p.variants) { // a configurator: every option priced at or above its own MAP
      for (const v of p.variants) { const cv = c.variants.find(x => x.sku === v.sku); assert.ok(cv && cv.cents === Math.round(Number(v.price) * 100) && typeof v.map === 'number' && cv.map <= cv.cents, p.cart + ' ' + v.sku); }
      assert.ok(p.checkoutNote, p.cart + ' needs a checkoutNote'); continue;
    }
    assert.equal(c.cents, Math.round(Number(p.price) * 100), p.cart + ' price');
    assert.ok(typeof p.map === 'number' && c.map <= c.cents, p.cart + ' needs a map at or below price');
    assert.ok(p.checkoutNote, p.cart + ' needs a checkoutNote');
  }
  assert.deepEqual(worker.priceWarnings(), []);
});

// Clock in these tests: 1800000000000 = 2027-01-15 in Michigan.
function addEvent(s, e) {
  s.sqlite.prepare('INSERT INTO events (id, name, starts, ends, place, where_to_find, order_by, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)')
    .run(e.id, e.name, e.starts, e.ends, e.place || '', e.where || '', e.orderBy, e.active ?? 1);
}

test('catalog lists upcoming events and which still take paddock pickup orders', async t => {
  const s = service(t);
  addEvent(s, { id: 'empire-2027', name: 'Empire Hill Climb', starts: '2027-09-18', ends: '2027-09-19', place: 'Empire, MI', orderBy: '2027-09-15' });
  addEvent(s, { id: 'pine-2027', name: 'Pine Mountain', starts: '2027-01-16', ends: '2027-01-17', place: 'Kentucky', orderBy: '2027-01-14' });
  addEvent(s, { id: 'past', name: 'Old', starts: '2026-10-01', ends: '2026-10-02', orderBy: '2026-09-28' });
  addEvent(s, { id: 'off', name: 'Hidden', starts: '2027-05-01', ends: '2027-05-01', orderBy: '2027-04-28', active: 0 });
  const r = await s.call('/api/catalog');
  assert.deepEqual(r.body.events.map(e => [e.id, e.open, e.dates]), [['pine-2027', false, 'Jan 16–17, 2027'], ['empire-2027', true, 'Sep 18–19, 2027']]);
  assert.equal('where_to_find' in r.body.events[0], false);
});

test('paddock pickup checkout: open event only, free, phone collected, event in Stripe', async t => {
  const s = service(t);
  addEvent(s, { id: 'empire-2027', name: 'Empire Hill Climb', starts: '2027-09-18', ends: '2027-09-19', place: 'Empire, MI', orderBy: '2027-09-15' });
  addEvent(s, { id: 'closed', name: 'Closed One', starts: '2027-01-20', ends: '2027-01-20', orderBy: '2027-01-10' });
  const items = [{ product: 'pump', qty: 1 }];
  assert.equal((await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'event', eventId: 'closed', items } })).status, 400);
  assert.equal((await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'event', eventId: 'nope', items } })).status, 400);
  assert.equal((await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'event', items } })).status, 400);
  const r = await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'event', eventId: 'empire-2027', items } });
  assert.equal(r.status, 200);
  const p = s.sent[0].params;
  assert.equal(p.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
  assert.equal(p.get('shipping_options[0][shipping_rate_data][display_name]'), 'Paddock pickup: Empire Hill Climb, Sep 18–19, 2027');
  assert.equal(p.get('phone_number_collection[enabled]'), 'true');
  assert.equal(p.get('shipping_address_collection[allowed_countries][0]'), null);
  assert.equal(p.get('metadata[event_id]'), 'empire-2027');
  assert.match(p.get('success_url'), /via=event/);
  assert.match(p.get('custom_text[submit][message]'), /799 paddock at Empire Hill Climb/);
});

test('paddock pickup order: saved with the event, buyer details, and an email that says where to find 799', async t => {
  const s = service(t); s.env.RESEND_API_KEY = 're_test';
  addEvent(s, { id: 'empire-2027', name: 'Empire Hill Climb', starts: '2027-09-18', ends: '2027-09-19', place: 'Empire, MI', where: 'Paddock row B, green Scirocco', orderBy: '2027-09-15' });
  const ev = paid('cs_test_evt12345', [{ p: 'pump', q: 1 }], 'event');
  Object.assign(ev.data.object.metadata, { event_id: 'empire-2027', event: 'Empire Hill Climb' });
  Object.assign(ev.data.object.customer_details, { name: 'Pat Buyer', phone: '+12315550100' });
  const r = await s.webhook(ev);
  assert.equal(r.body.result, 'recorded'); assert.equal(r.body.email, 'sent');
  const row = s.sqlite.prepare('SELECT event_id, name, phone, status FROM orders WHERE session_id = ?').get('cs_test_evt12345');
  assert.deepEqual({ ...row }, { event_id: 'empire-2027', name: 'Pat Buyer', phone: '+12315550100', status: 'new' });
  const m = s.mail[0].body;
  assert.match(m.text, /waiting in the 799 paddock at Empire Hill Climb \(Sep 18–19, 2027, Empire, MI\)/);
  assert.match(m.text, /Find us: Paddock row B, green Scirocco/);
  assert.match(m.text, /Paddock pickup: Free/);
});

test('SKU carts: lines by SKU, stock by SKU, orders stored by SKU; older carts and orders still work', async t => {
  const s = service(t);
  const cat = (await s.call('/api/catalog')).body;
  assert.equal(cat.stock.RUASVS20, 2); assert.equal(cat.stock['jug/color/Red'], 2); assert.equal(cat.stock.LTP, 2); assert.equal(cat.stock.pump, 2);
  assert.deepEqual(cat.catalog.jug.variants.map(v => v.sku).slice(0, 2), ['RUASVS20', 'WUASVS20']);
  assert.deepEqual(cat.catalog.pump.variants, [{ name: '', sku: 'LTP' }]);
  const r = await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', items: [{ sku: 'KUASVS20', qty: 1 }, { sku: 'LTP', qty: 1 }] } });
  assert.equal(r.status, 200);
  const p = s.sent[0].params;
  assert.equal(p.get('line_items[0][price_data][product_data][description]'), 'Kawi Green, Auto-Stop Spout, view strip (KUASVS20)');
  assert.equal(p.get('line_items[1][price_data][product_data][description]'), 'Includes Tuff Jug adapter (LTP)');
  assert.equal(p.get('metadata[items]'), JSON.stringify([{ s: 'KUASVS20', q: 1 }, { s: 'LTP', q: 1 }]));
  assert.equal((await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', items: [{ sku: 'NOPE', qty: 1 }] } })).status, 400);
  assert.equal((await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', items: [{ sku: '__proto__', qty: 1 }] } })).status, 400);
  // A new-style order and an old-style order both take stock off by SKU.
  await s.webhook(paid('cs_test_new1', [{ s: 'KUASVS20', q: 2 }]));
  await s.webhook(paid('cs_test_old1', [{ p: 'pump', q: 1 }]));
  const after = (await s.call('/api/catalog')).body.stock;
  assert.equal(after.KUASVS20, 0); assert.equal(after['jug/color/Kawi Green'], 0); assert.equal(after.LTP, 1);
});

test('notify me: one zine-style "You\'re on the list" email per address while it waits, with the ratchet and a story', async t => {
  const s = service(t); s.env.RESEND_API_KEY = 're_test';
  await s.call('/api/notify', { method: 'POST', data: { sku: 'FR6USA', email: 'pat@example.com' } });
  await s.call('/api/notify', { method: 'POST', data: { sku: 'R6USA', email: 'pat@example.com' } }); // a second pick: no second email
  assert.equal(s.mail.length, 1);
  const m = s.mail[0].body;
  assert.deepEqual(m.to, ['pat@example.com']); assert.equal(m.from, '799 Motorsport Paddock <paddock@799motorsport.com>');
  assert.equal(m.subject, 'You\'re on the list: VIM MVRK 3/8" Drive Flex Head Ratchet, 12"');
  assert.match(m.html, /vim-mvrk-ratchets\/\?sku=FR6USA/); assert.match(m.html, /Named after a wind/); assert.match(m.html, /\/scirocco-history/);
  assert.match(m.html, /meta charset="utf-8"/); assert.match(m.text, /Osnabrück/);
  s.sqlite.prepare("UPDATE restock_requests SET notified_at = 5").run(); // after the restock email, a new request confirms again
  await s.call('/api/notify', { method: 'POST', data: { sku: 'FR6USA', email: 'pat@example.com' } });
  assert.equal(s.mail.length, 2);
  const bad = service(t, { emailStatus: 500 }); bad.env.RESEND_API_KEY = 're_test'; // a mail failure never blocks the request
  assert.equal((await bad.call('/api/notify', { method: 'POST', data: { sku: 'LTP', email: 'q@example.com' } })).status, 200);
});

test('notify me: saves one request per SKU and email, refuses bad input, ignores bots, re-arms after a notice', async t => {
  const s = service(t);
  const ok = await s.call('/api/notify', { method: 'POST', data: { sku: 'SpoutBender', email: ' Pat@Example.com ' } });
  assert.equal(ok.status, 200);
  await s.call('/api/notify', { method: 'POST', data: { sku: 'SpoutBender', email: 'pat@example.com' } });
  assert.equal(s.sqlite.prepare("SELECT COUNT(*) AS n FROM restock_requests").get().n, 1);
  assert.equal(s.sqlite.prepare("SELECT email FROM restock_requests").get().email, 'pat@example.com');
  assert.equal((await s.call('/api/notify', { method: 'POST', data: { sku: 'NOPE', email: 'a@b.co' } })).status, 400);
  assert.equal((await s.call('/api/notify', { method: 'POST', data: { sku: 'LTP', email: 'not-an-email' } })).status, 400);
  assert.equal((await s.call('/api/notify', { method: 'POST', data: { sku: 'LTP', email: 'bot@spam.co', website: 'x' } })).status, 200);
  assert.equal(s.sqlite.prepare("SELECT COUNT(*) AS n FROM restock_requests WHERE email = 'bot@spam.co'").get().n, 0);
  s.sqlite.prepare("UPDATE restock_requests SET notified_at = 5").run();
  await s.call('/api/notify', { method: 'POST', data: { sku: 'SpoutBender', email: 'pat@example.com' } });
  assert.equal(s.sqlite.prepare("SELECT notified_at FROM restock_requests").get().notified_at, null);
  assert.equal((await s.call('/api/notify', { method: 'POST', data: { sku: 'LTP', email: 'x@y.co' }, origin: 'https://evil.example' })).status, 403);
});

test('order copies: the list set in Pitwall gets the blind copy; empty list means none; buyer never copied to self', async t => {
  const s = service(t); s.env.RESEND_API_KEY = 're_test';
  const set = v => s.sqlite.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('order_copies', ?, 0) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(JSON.stringify(v));
  set(['mike@scirocco799.com', 'Crew@799motorsport.com', 'a@b.c']);
  await s.webhook(paid('cs_test_cp1', [{ s: 'LTP', q: 1 }]));
  assert.deepEqual(s.mail[0].body.bcc, ['mike@scirocco799.com', 'crew@799motorsport.com']);
  set([]);
  await s.webhook(paid('cs_test_cp2', [{ s: 'LTP', q: 1 }]));
  assert.equal(s.mail[1].body.bcc, undefined);
});

test('customers: one record per email with details, addresses, totals and opt-in; retries never double count', async t => {
  const s = service(t);
  const addr = (line1) => ({ name: 'Pat Buyer', address: { line1, city: 'Traverse City', state: 'MI', postal_code: '49684', country: 'US' } });
  const order = (id, extra) => { const ev = paid(id, [{ s: 'LTP', q: 1 }], 'ship'); Object.assign(ev.data.object, { amount_total: 9999, customer: 'cus_123',
    customer_details: { email: 'Pat@Example.com', name: 'Pat Buyer', phone: '+12315550100', address: { line1: '1 Bill St', city: 'TC', state: 'MI', postal_code: '49684', country: 'US' } } }, extra); return ev; };
  await s.webhook(order('cs_test_c1', { collected_information: { shipping_details: addr('1 Main St') }, consent: { promotions: 'opt_in' } }));
  await s.webhook(order('cs_test_c1', {})); // Stripe retry
  await s.webhook(order('cs_test_c2', { collected_information: { shipping_details: addr('9 Lake Rd') }, consent: { promotions: 'opt_out' } }));
  const c = s.sqlite.prepare('SELECT * FROM customers').all();
  assert.equal(c.length, 1);
  assert.equal(c[0].email, 'pat@example.com'); assert.equal(c[0].name, 'Pat Buyer'); assert.equal(c[0].phone, '+12315550100');
  assert.equal(c[0].orders_count, 2); assert.equal(c[0].total_spent, 19998); assert.equal(c[0].stripe_customer, 'cus_123');
  assert.equal(c[0].marketing, 'opt_in', 'an unticked box later does not undo an opt-in'); assert.equal(c[0].marketing_source, 'checkout');
  assert.deepEqual(JSON.parse(c[0].addresses).map(a => a.address.line1), ['9 Lake Rd', '1 Main St']);
  assert.equal(JSON.parse(c[0].shipping).address.line1, '9 Lake Rd'); assert.equal(JSON.parse(c[0].billing).address.line1, '1 Bill St');
  assert.deepEqual(s.sqlite.prepare('SELECT DISTINCT customer_id FROM orders').all().map(r => r.customer_id), [c[0].id]);
});

test('customers: checkout creates a Stripe customer and asks "799 News by email" (Yes by default); notify requests opt in by default', async t => {
  const s = service(t);
  await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', items: [{ sku: 'LTP', qty: 1 }] } });
  const p = s.sent[0].params;
  assert.equal(p.get('customer_creation'), 'always'); assert.equal(p.get('consent_collection[promotions]'), null);
  assert.equal(p.get('custom_fields[0][key]'), 'news'); assert.equal(p.get('custom_fields[0][type]'), 'dropdown');
  assert.equal(p.get('custom_fields[0][dropdown][default_value]'), 'yes'); assert.equal(p.get('custom_fields[0][dropdown][options][1][value]'), 'no');
  await s.call('/api/notify', { method: 'POST', data: { sku: 'SpoutBender', email: 'New@Person.co' } });
  const c = s.sqlite.prepare("SELECT email, source, marketing, marketing_source, orders_count FROM customers").get();
  assert.deepEqual({ ...c }, { email: 'new@person.co', source: 'notify', marketing: 'opt_in', marketing_source: 'notify request (default)', orders_count: 0 });
  const ev = paid('cs_test_n1', [{ s: 'LTP', q: 1 }], 'event'); ev.data.object.customer_details.email = 'new@person.co';
  await s.webhook(ev);
  assert.equal(s.sqlite.prepare("SELECT source FROM customers").get().source, 'event', 'first order replaces the notify source');
});

test('799 News at checkout: "No" opts out and a later default "Yes" never re-subscribes them', async t => {
  const s = service(t);
  const order = (id, choice) => { const ev = paid(id, [{ s: 'LTP', q: 1 }]); ev.data.object.customer_details.email = 'pat@example.com';
    if (choice) ev.data.object.custom_fields = [{ key: 'news', type: 'dropdown', dropdown: { value: choice } }]; return ev; };
  await s.webhook(order('cs_test_m1', 'yes'));
  assert.equal(s.sqlite.prepare('SELECT marketing FROM customers').get().marketing, 'opt_in');
  await s.webhook(order('cs_test_m2', 'no'));
  assert.equal(s.sqlite.prepare('SELECT marketing, marketing_source FROM customers').get().marketing, 'opt_out');
  await s.webhook(order('cs_test_m3', 'yes'));
  assert.equal(s.sqlite.prepare('SELECT marketing FROM customers').get().marketing, 'opt_out');
});

test('sign-up: saves, emails a confirm link, confirming opts in and redirects; repeats and bots send nothing', async t => {
  const s = service(t); s.env.RESEND_API_KEY = 're_test'; s.env.SITE_URL = 'https://staging.example';
  const r = await s.call('/api/subscribe', { method: 'POST', data: { email: ' Fan@Example.com ', firstName: 'Fan' } });
  assert.equal(r.status, 200); assert.equal(s.mail.length, 1);
  const m = s.mail[0].body;
  assert.equal(m.from, '799 Motorsport Paddock <paddock@799motorsport.com>'); assert.equal(m.subject, 'Confirm you want 799 News');
  const link = /https:\/\/store\.example\/api\/confirm\?t=([a-f0-9]{48})/.exec(m.html);
  assert.ok(link, 'confirm link');
  assert.equal(s.sqlite.prepare("SELECT marketing, source FROM customers WHERE email = 'fan@example.com'").get().marketing, 'unknown');
  const c = await s.call('/api/confirm?t=' + link[1], { origin: null });
  assert.equal(c.res.status, 302); assert.equal(c.res.headers.get('location'), 'https://staging.example/news?confirmed=1');
  const row = s.sqlite.prepare("SELECT marketing, marketing_source, name, source FROM customers WHERE email = 'fan@example.com'").get();
  assert.deepEqual({ ...row }, { marketing: 'opt_in', marketing_source: 'site sign-up (confirmed)', name: 'Fan', source: 'signup' });
  await s.call('/api/subscribe', { method: 'POST', data: { email: 'fan@example.com' } });
  assert.equal(s.mail.length, 1, 'already on the list: no second email');
  await s.call('/api/subscribe', { method: 'POST', data: { email: 'bot@spam.co', website: 'x' } });
  assert.equal(s.sqlite.prepare("SELECT COUNT(*) AS n FROM customers WHERE email = 'bot@spam.co'").get().n, 0);
  assert.equal((await s.call('/api/subscribe', { method: 'POST', data: { email: 'nope' } })).status, 400);
  const bad = await s.call('/api/confirm?t=' + 'a'.repeat(48), { origin: null });
  assert.equal(bad.res.headers.get('location'), 'https://staging.example/news?confirmed=0');
});

test('Resend sync: opt-ins join the 799 News segment and topic; the hourly sweep retries and picks up unsubscribes', async t => {
  const { newsSweep } = worker;
  const s = service(t);
  const env = { RESEND_API_KEY: 're_test', NEWS_TOPIC: 'top_799', NEWS_SEGMENT: 'seg_799' }, calls = [];
  let unsubscribedInResend = false;
  const fetchFn = async (url, init) => { const path = url.replace('https://api.resend.com', ''); calls.push([init.method, path, init.body ? JSON.parse(init.body) : null]);
    if (init.method === 'POST' && path === '/contacts') return new Response('{"id":"c1"}', { status: 201 });
    if (init.method === 'GET' && path.endsWith('/topics')) return new Response(JSON.stringify({ data: [{ id: 'top_799', subscription: unsubscribedInResend ? 'opt_out' : 'opt_in' }, { id: 'ehc', subscription: 'opt_in' }] }));
    if (init.method === 'GET') return new Response('{"unsubscribed":false}');
    return new Response('{}'); };
  s.sqlite.prepare("INSERT INTO customers (email, name, marketing, created_at, updated_at) VALUES ('pat@example.com', 'Pat Buyer', 'opt_in', 1, 2), ('quiet@example.com', NULL, 'unknown', 1, 2)").run();
  const r1 = await newsSweep(env, s.db, fetchFn, 100, { pause: async () => {} });
  assert.equal(r1.pushed, 1);
  assert.deepEqual(calls[0], ['POST', '/contacts', { email: 'pat@example.com', first_name: 'Pat', last_name: 'Buyer', segments: [{ id: 'seg_799' }], topics: [{ id: 'top_799', subscription: 'opt_in' }] }]);
  assert.ok(!calls.some(c => JSON.stringify(c).includes('quiet@example.com')), 'never asked = never sent to Resend');
  unsubscribedInResend = true;
  const r2 = await newsSweep(env, s.db, fetchFn, 200, { pause: async () => {} });
  assert.equal(r2.unsubscribed, 1);
  const row = s.sqlite.prepare("SELECT marketing, marketing_source FROM customers WHERE email = 'pat@example.com'").get();
  assert.deepEqual({ ...row }, { marketing: 'opt_out', marketing_source: 'unsubscribed (799 News email)' });
  assert.ok(!calls.some(c => c[2] && JSON.stringify(c[2]).includes('"unsubscribed":true')), 'never unsubscribes them from the whole account');
  assert.deepEqual(await newsSweep({}, s.db, fetchFn, 300), { off: true });
});

test('refunds: charge.refunded marks the order, takes it off the customer totals once, and handles partial refunds', async t => {
  const s = service(t);
  const order = (id, pi) => { const ev = paid(id, [{ s: 'LTP', q: 1 }]); Object.assign(ev.data.object, { amount_total: 8000, payment_intent: pi, customer_details: { email: 'pat@example.com', name: 'Pat Buyer' } }); return ev; };
  await s.webhook(order('cs_test_r1', 'pi_one')); await s.webhook(order('cs_test_r2', 'pi_two'));
  const refund = (pi, amount) => ({ type: 'charge.refunded', data: { object: { id: 'ch_' + pi, object: 'charge', payment_intent: pi, amount: 8000, amount_refunded: amount } } });
  assert.equal((await s.webhook(refund('pi_one', 3000))).body.result, 'partly refunded');
  let c = s.sqlite.prepare('SELECT orders_count, total_spent FROM customers').get();
  assert.deepEqual({ ...c }, { orders_count: 2, total_spent: 13000 });
  assert.equal((await s.webhook(refund('pi_one', 8000))).body.result, 'refunded');
  assert.equal((await s.webhook(refund('pi_one', 8000))).body.result, 'no change', 'Stripe retries change nothing');
  c = s.sqlite.prepare('SELECT orders_count, total_spent FROM customers').get();
  assert.deepEqual({ ...c }, { orders_count: 1, total_spent: 8000 });
  const o = s.sqlite.prepare("SELECT refunded_cents, refunded_at FROM orders WHERE session_id = 'cs_test_r1'").get();
  assert.equal(o.refunded_cents, 8000); assert.ok(o.refunded_at);
  assert.equal((await s.webhook(refund('pi_unknown', 100))).body.result, 'unknown order');
  assert.equal(s.sqlite.prepare("SELECT qty FROM stock WHERE key = 'LTP'").get().qty, 0, 'stock is not put back automatically');
});

test('orders keep the price each item sold at and the money breakdown', async t => {
  const s = service(t);
  const ev = paid('cs_test_tot1', [{ s: 'LTP', q: 2 }]);
  Object.assign(ev.data.object, { amount_subtotal: 14998, amount_total: 15898, payment_intent: 'pi_x', total_details: { amount_shipping: 0, amount_tax: 900, amount_discount: 0 } });
  await s.webhook(ev);
  const o = s.sqlite.prepare("SELECT items, amount_subtotal, amount_shipping, amount_tax, amount_discount, payment_intent FROM orders WHERE session_id = 'cs_test_tot1'").get();
  assert.deepEqual(JSON.parse(o.items), [{ s: 'LTP', q: 2, u: 7499 }]);
  assert.deepEqual([o.amount_subtotal, o.amount_shipping, o.amount_tax, o.amount_discount, o.payment_intent], [14998, 0, 900, 0, 'pi_x']);
});

test('free shipping: a ship order is free only when every item is marked free shipping', () => {
  const line = (sku, free) => ({ sku, qty: 1, cents: 1000, name: 'X', description: 'x', freeShipping: free });
  const rate = lines => checkoutParams(lines, 'ship', 'https://799motorsport.com/paddock').shipping_options[0].shipping_rate_data;
  assert.deepEqual([rate([line('A', true), line('B', true)]).fixed_amount.amount, rate([line('A', true), line('B', true)]).display_name], [0, 'Free shipping (lower 48)']);
  assert.equal(rate([line('A', true), line('B', false)]).fixed_amount.amount, 2500);
  assert.equal(rate([line('B', false)]).fixed_amount.amount, 2500);
  assert.equal(checkoutParams([line('A', true)], 'pickup', 'https://799motorsport.com/paddock').shipping_options[0].shipping_rate_data.fixed_amount.amount, 0);
});

test('business name: optional at checkout, saved apart from the person’s name', async t => {
  const p = checkoutParams([{ sku: 'LTP', qty: 1, cents: 7499, name: 'Pump', description: 'p' }], 'pickup', 'https://799motorsport.com/paddock');
  assert.deepEqual(p.name_collection, { business: { enabled: 'true', optional: 'true' } });
  assert.equal(buyer({ customer_details: { name: 'Acme Racing', business_name: 'Acme Racing', individual_name: 'Pat Buyer' } }).name, 'Pat Buyer');
  assert.equal(buyer({ customer_details: { name: 'Acme Racing', business_name: 'Acme Racing' }, collected_information: { shipping_details: { name: 'Pat Buyer' } } }).name, 'Pat Buyer');
  assert.equal(buyer({ customer_details: { name: 'Acme Racing', business_name: 'Acme Racing' } }).name, null);
  assert.deepEqual([buyer({ customer_details: { name: 'Sam Solo' } }).name, buyer({ customer_details: { name: 'Sam Solo' } }).business], ['Sam Solo', null]);
  const s = service(t);
  const ev = paid('cs_test_biz1', [{ s: 'LTP', q: 1 }]);
  ev.data.object.customer_details = { email: 'pat@acme.co', name: 'Acme Racing', business_name: 'Acme Racing', individual_name: 'Pat Buyer' };
  await s.webhook(ev);
  const c = s.sqlite.prepare("SELECT name, business FROM customers WHERE email = 'pat@acme.co'").get();
  assert.deepEqual({ ...c }, { name: 'Pat Buyer', business: 'Acme Racing' });
  assert.equal(s.sqlite.prepare("SELECT business FROM orders WHERE session_id = 'cs_test_biz1'").get().business, 'Acme Racing');
});

test('configurator products: each option has its own price, and Coming Soon options cannot be bought', () => {
  const file = JSON.parse(fs.readFileSync(new URL('../store/catalog.json', import.meta.url)));
  const m = file.products.find(p => p.cart === 'mvrk');
  assert.ok(m.variants.length === 6 && m.options.length === 2 && !m.variants.some(v => v.includes)); // no made-up set SKUs
  const c = worker.buildCatalog(file).mvrk;
  assert.deepEqual(c.variants.map(v => [v.sku, v.cents]), [['R4USA', 8899], ['FR4USA', 12999], ['R6USA', 11999], ['FR6USA', 14999], ['R8USA', 13899], ['FR8USA', 19499]]);
  assert.equal(c.variants.find(v => v.sku === 'FR6USA').name, '3/8" Flex, 12"');
  assert.equal(c.cents, 8899); assert.equal(c.option, 'Option');
  m.variants.find(v => v.sku === 'R4USA').status = 'coming-soon';
  assert.ok(!worker.buildCatalog(file).mvrk.variants.some(v => v.sku === 'R4USA'));
  m.status = 'coming-soon';
  assert.equal(worker.buildCatalog(file).mvrk, undefined);
});

test('a mix of MVRK ratchets checks out as one line per ratchet at its own price', async t => {
  const s = service(t);
  s.sqlite.exec("UPDATE stock SET qty = 2 WHERE key IN ('R4USA','R6USA','R8USA')");
  const ok = await s.call('/api/checkout', { method: 'POST', data: { items: [{ sku: 'R4USA', qty: 1 }, { sku: 'R6USA', qty: 1 }, { sku: 'R8USA', qty: 1 }], fulfillment: 'pickup' } });
  assert.equal(ok.status, 200);
  const p = s.sent.at(-1).params, line = k => p.get('line_items[' + k + '][price_data][unit_amount]');
  assert.deepEqual([line(0), line(1), line(2)], ['8899', '11999', '13899']);
  assert.deepEqual(JSON.parse(p.get('metadata[items]')), [{ s: 'R4USA', q: 1 }, { s: 'R6USA', q: 1 }, { s: 'R8USA', q: 1 }]);
});
