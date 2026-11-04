import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { createWorker, priceWarnings, verifySignature, orderEmail } from '../store/worker.mjs';

const require = createRequire(import.meta.url);
const { database } = require('./helpers/d1.cjs');
const SECRET = 'whsec_test123';

function service(t, { key = 'rk_test_abc', stripeStatus = 200, emailStatus = 200 } = {}) {
  const storage = database('../../store/schema.sql'); t.after(storage.close);
  let time = 1800000000000; const sent = [];
  const stripeFetch = async (url, init) => { sent.push({ url, init, params: new URLSearchParams(init.body.toString()) });
    return new Response(JSON.stringify(stripeStatus === 200 ? { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' } : { error: { message: 'nope' } }), { status: stripeStatus }); };
  const mail = [];
  const emailFetch = async (url, init) => { mail.push({ url, init, body: JSON.parse(init.body) }); return new Response('{"id":"em_1"}', { status: emailStatus }); };
  const worker = createWorker({ now: () => time, stripeFetch, emailFetch });
  const env = { DB: storage.db, STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: SECRET };
  async function call(path, { method = 'GET', data, origin = 'https://scirocco799.com', raw, headers = {} } = {}) {
    const h = { ...headers }; if (origin) h.origin = origin;
    const body = raw ?? (data === undefined ? undefined : JSON.stringify(data));
    const res = await worker.fetch(new Request('https://store.example' + path, { method, headers: h, body }), env);
    return { status: res.status, body: method === 'OPTIONS' ? null : await res.json(), res };
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
  assert.equal(r.body.catalog.jug.cents, 4599); assert.equal(r.body.catalog.ripper.cents, 2745); assert.equal(r.body.stock.tuffspout, 2);
  assert.equal(r.res.headers.get('access-control-allow-origin'), 'https://scirocco799.com');
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
  assert.equal(p.get('line_items[2][price_data][unit_amount]'), '2745');
  assert.equal(p.get('line_items[1][price_data][unit_amount]'), '7499');
  assert.equal(p.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
  assert.equal(p.get('shipping_address_collection[allowed_countries][0]'), null);
  assert.equal(p.get('allow_promotion_codes'), 'true');
  assert.equal(p.get('excluded_payment_method_types[0]'), 'affirm'); assert.equal(p.get('excluded_payment_method_types[1]'), 'klarna');
  assert.equal(p.get('success_url'), 'https://scirocco799.com/paddock?order=success&via=pickup&ref={CHECKOUT_SESSION_ID}');
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
  assert.equal(r.status, 409); assert.deepEqual(r.body.soldOut, ['jug/color/Red']);
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
  assert.equal(m.body.reply_to, 'mike@scirocco799.com'); assert.equal(m.body.from, 'Scirocco 799 <orders@scirocco799.com>');
  assert.equal(m.body.subject, 'Your Scirocco 799 order 799-ABCD1234');
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
  assert.equal(r.status, 200); assert.deepEqual(r.body.results, ['sent', 'sent', 'sent']);
  assert.equal(s.mail.length, 3);
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
  assert.equal(p.get('success_url'), 'https://scirocco799.com/paddock?order=success&via=table&ref={CHECKOUT_SESSION_ID}');
  const m = orderEmail({ id: 'cs_live_tbl00001', metadata: { fulfillment: 'table', items: JSON.stringify([{ p: 'jug', c: 'Red', q: 1 }]) }, amount_subtotal: 4599, amount_total: 4875, total_details: { amount_tax: 276 } });
  assert.match(m.text, /Paid at the 799 table/); assert.doesNotMatch(m.text, /Local pickup|Shipping:/); assert.match(m.text, /Total paid: \$48\.75/);
});

test('cancelled checkout returns to the store page the buyer came from, and only under /paddock', async t => {
  const s = service(t);
  await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', returnPath: '/paddock/fuel-fluids/tuff-spout/', items: [{ product: 'tuffspout', qty: 1 }] } });
  assert.equal(s.sent[0].params.get('cancel_url'), 'https://scirocco799.com/paddock/fuel-fluids/tuff-spout/?order=cancelled');
  assert.match(s.sent[0].params.get('success_url'), /^https:\/\/scirocco799\.com\/paddock\?order=success/);
  for (const bad of ['https://evil.example/', '//evil.example', '/returns', '/paddock/../x', '/paddock/a?b=1']) {
    await s.call('/api/checkout', { method: 'POST', data: { fulfillment: 'pickup', returnPath: bad, items: [{ product: 'tuffspout', qty: 1 }] } });
    assert.equal(s.sent.at(-1).params.get('cancel_url'), 'https://scirocco799.com/paddock?order=cancelled', bad);
  }
});
