// Store Worker for scirocco799-store. Deployed by GitHub Actions from store/wrangler.jsonc (see store/README.md).
// Bindings: D1 database as DB. Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
// Optional secret: RESEND_API_KEY (branded order confirmation emails through Resend).
// Optional variables: STRIPE_TAX=on (Stripe Tax), ALLOWED_ORIGINS (extra comma-separated origins),
// ORDER_FROM (sender, default orders@scirocco799.com), ORDER_COPY=off (stop the copy to Mike),
// SAMPLE_EMAILS=on (temporarily lets /api/sample-emails send three sample confirmations to Mike only).

// ---- Catalog: built from store/catalog.json, the one product list for the site and checkout. ----
// Prices in cents. map = minimum advertised price (Tuff Jug policy: MSRP - 15%).
import catalogFile from './catalog.json' with { type: 'json' };
import { frame, FROM as PADDOCK_FROM, REPLY_TO } from './emails.mjs';
export const SHIPPING = Object.freeze({
  ship: { cents: 2500, label: 'Flat-rate shipping (lower 48)' },
  pickup: { cents: 0, label: 'Local pickup: Downtown Traverse City, MI (by appointment)' },
  table: { cents: 0, label: 'At the 799 table: paid and collected in person' },
  event: { cents: 0, label: 'Paddock pickup at the event' }
});
const cents = v => Math.round(Number(v) * 100);
// Every sellable thing is a variant with its own SKU. A product with "colors" has one variant per color;
// any other product has a single variant (its own SKU). Stock, cart lines and orders all use SKUs.
export function variantsOf(p) {
  return p.colors ? p.colors.map(c => ({ name: c.name, sku: c.sku })) : [{ name: '', sku: p.sku }];
}
export function buildCatalog(file) {
  const out = {};
  for (const p of file.products) {
    if (!p.cart || (p.status || 'live') !== 'live') continue; // only live products can be bought
    const variants = variantsOf(p);
    for (const v of variants) if (!v.sku) throw new Error(p.slug + ': every variant needs a SKU');
    const item = { name: p.name, description: p.checkoutNote, cents: cents(p.price), map: cents(p.map ?? p.price), option: p.colors ? 'Color' : null, variants };
    // Older field names, kept so a cached copy of the store page keeps working during a deploy.
    if (p.colors) { item.colors = p.colors.map(c => c.name); item.skus = Object.fromEntries(p.colors.map(c => [c.name, c.sku])); }
    else item.sku = p.sku;
    out[p.cart] = item;
  }
  return out;
}
export const CATALOG = Object.freeze(buildCatalog(catalogFile));
export const SKUS = Object.freeze(Object.fromEntries(Object.entries(CATALOG).flatMap(([id, p]) => p.variants.map(v => [v.sku, { id, variant: v }]))));
// The stock keys used before SKUs (jug/color/<Color> and the product id). Kept as aliases in /api/catalog.
export const legacyKey = (id, v) => CATALOG[id].colors ? 'jug/color/' + v.name : id;

const ORIGINS = ['https://799motorsport.com', 'https://www.799motorsport.com', 'https://scirocco799.com', 'https://www.scirocco799.com', 'https://mwtcmi.github.io'];
const SITE = 'https://799motorsport.com';
const RETURN_PATH = '/paddock';
const MAX_LINES = 10, MAX_QTY = 10, MAX_BODY = 8192, SIG_TOLERANCE = 300;

// ---- Events (managed in Pitwall): paddock pickup and the "We'll be at..." line ----
// Event dates are local calendar dates in Michigan time, YYYY-MM-DD.
export function localDate(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function eventDates(e) {
  const [y1, m1, d1] = e.starts.split('-').map(Number), [y2, m2, d2] = e.ends.split('-').map(Number);
  if (e.starts === e.ends) return MONTHS[m1 - 1] + ' ' + d1 + ', ' + y1;
  if (y1 === y2 && m1 === m2) return MONTHS[m1 - 1] + ' ' + d1 + '–' + d2 + ', ' + y1;
  return MONTHS[m1 - 1] + ' ' + d1 + (y1 === y2 ? '' : ', ' + y1) + ' – ' + MONTHS[m2 - 1] + ' ' + d2 + ', ' + y2;
}
// Upcoming events (not over yet). open = still taking order-ahead pickups.
export async function upcomingEvents(db, today) {
  const { results } = await db.prepare('SELECT id, name, starts, ends, place, order_by FROM events WHERE active = 1 AND ends >= ? ORDER BY starts, name LIMIT 12').bind(today).all();
  return results.map(e => ({ id: e.id, name: e.name, starts: e.starts, ends: e.ends, place: e.place, orderBy: e.order_by, dates: eventDates(e), open: today <= e.order_by }));
}
async function eventRow(db, id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(id)) return null;
  return db.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
}

class APIError extends Error { constructor(status, message) { super(message); this.status = status; } }

// Each cart line ({sku, qty}; older carts send {product, color, qty}) becomes a priced line plus the stock it uses.
export function priceLine(line) {
  const qty = Number(line?.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new APIError(400, 'Invalid quantity.');
  let id, v;
  if (typeof line.sku === 'string') {
    const hit = Object.hasOwn(SKUS, line.sku) ? SKUS[line.sku] : null;
    if (!hit) throw new APIError(400, 'Unknown product.');
    id = hit.id; v = hit.variant;
  } else {
    id = line.product;
    const p = typeof id === 'string' && Object.hasOwn(CATALOG, id) ? CATALOG[id] : null;
    if (!p) throw new APIError(400, 'Unknown product.');
    v = p.variants.length > 1 ? p.variants.find(x => x.name === line.color) : p.variants[0];
    if (!v) throw new APIError(400, 'Unknown option.');
  }
  const p = CATALOG[id], multi = p.variants.length > 1;
  return { product: id, sku: v.sku, variant: v.name, qty, cents: p.cents, map: p.map, name: p.name,
    description: (multi ? v.name + ', ' : '') + p.description + ' (' + v.sku + ')', keys: [v.sku] };
}
// Order metadata items: {s: sku, q} now, {p, c, q} before SKUs.
const itemLine = i => priceLine(i.s ? { sku: i.s, qty: i.q } : { product: i.p, color: i.c, qty: i.q });

export function priceWarnings() {
  return Object.entries(CATALOG).filter(([, v]) => v.cents < v.map).map(([k]) => k + ' is below MAP');
}

function needs(lines) {
  const need = {};
  for (const l of lines) for (const k of l.keys) need[k] = (need[k] || 0) + l.qty;
  return need;
}

async function stockMap(db) {
  const { results } = await db.prepare('SELECT key, qty FROM stock').all();
  return Object.fromEntries(results.map(r => [r.key, r.qty]));
}
// Stock by SKU, plus the older keys as aliases for a cached copy of the store page.
function publicStock(stock) {
  const out = {};
  for (const [sku, { id, variant }] of Object.entries(SKUS)) { out[sku] = stock[sku] ?? 0; out[legacyKey(id, variant)] = stock[sku] ?? 0; }
  return out;
}

function form(params) {
  const body = new URLSearchParams();
  const add = (prefix, v) => {
    if (v === undefined || v === null) return;
    if (typeof v === 'object') for (const [k, x] of Object.entries(v)) add(prefix ? prefix + '[' + k + ']' : k, x);
    else body.append(prefix, String(v));
  };
  add('', params);
  return body;
}

export function checkoutParams(lines, fulfillment, returnBase, env = {}, cancelBase = returnBase, event = null) {
  const ship = fulfillment === 'ship', rate = SHIPPING[fulfillment];
  const rateLabel = fulfillment === 'event' && event ? 'Paddock pickup: ' + event.name + ', ' + eventDates(event) : rate.label;
  const items = lines.map(l => ({ s: l.sku, q: l.qty }));
  const p = {
    mode: 'payment',
    success_url: returnBase + '?order=success&via=' + fulfillment + '&ref={CHECKOUT_SESSION_ID}',
    cancel_url: cancelBase + '?order=cancelled',
    allow_promotion_codes: 'true',
    excluded_payment_method_types: ['affirm', 'klarna'], // no pay-later: they cost about 6% a sale
    line_items: lines.map(l => ({ quantity: l.qty, price_data: { currency: 'usd', unit_amount: l.cents,
      product_data: { name: l.name, description: l.description } } })),
    shipping_options: [{ shipping_rate_data: { type: 'fixed_amount', display_name: rateLabel,
      fixed_amount: { amount: rate.cents, currency: 'usd' } } }],
    metadata: { items: JSON.stringify(items), fulfillment, ...(event ? { event_id: event.id, event: event.name } : {}) },
    payment_intent_data: { description: '799 Motorsport store order', metadata: { fulfillment, ...(event ? { event: event.name } : {}) } }
  };
  const policy = 'All sales final. Wrong or damaged items and warranty help: 799motorsport.com/returns';
  if (ship) {
    p.shipping_address_collection = { allowed_countries: ['US'] };
    p.custom_text = { submit: { message: policy } };
  } else if (fulfillment === 'event' && event) {
    p.phone_number_collection = { enabled: 'true' };
    p.custom_text = { submit: { message: 'Pick up in the 799 paddock at ' + event.name + ' (' + eventDates(event) + (event.place ? ', ' + event.place : '') + "). We'll email you where to find us. " + policy } };
  } else if (fulfillment === 'table') {
    p.custom_text = { submit: { message: 'Paying at the 799 table. Show the confirmation screen to collect your gear. ' + policy } };
  } else {
    p.phone_number_collection = { enabled: 'true' };
    p.custom_text = { submit: { message: "Pickup is by appointment in Downtown Traverse City, MI. We'll email you to set a time. " + policy } };
  }
  // Stripe Tax: prices are pre-tax; jugs and parts are general tangible goods, shipping is taxed as shipping.
  if (env.STRIPE_TAX === 'on') {
    p.automatic_tax = { enabled: 'true' };
    p.line_items.forEach(li => { li.price_data.tax_behavior = 'exclusive'; li.price_data.product_data.tax_code = 'txcd_99999999'; });
    Object.assign(p.shipping_options[0].shipping_rate_data, { tax_behavior: 'exclusive', tax_code: 'txcd_92010001' });
    if (!ship) p.billing_address_collection = 'required';
  }
  return p;
}

function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }

export async function verifySignature(payload, header, secret, nowSec) {
  if (!header || !secret) return false;
  const parts = header.split(',').map(s => s.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length || Math.abs(nowSec - t) > SIG_TOLERANCE) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(t + '.' + payload)));
  return sigs.some(s => {
    if (s.length !== expected.length) return false;
    let diff = 0; for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

async function recordOrder(db, session, now) {
  let items;
  try { items = JSON.parse(session.metadata?.items || '[]'); } catch { items = []; }
  const lines = items.map(itemLine);
  const need = needs(lines);
  const who = session.customer_details || {}, shipTo = session.collected_information?.shipping_details || session.shipping_details || null;
  const statements = [db.prepare('INSERT INTO orders (session_id, created_at, livemode, fulfillment, email, amount_total, items, event_id, name, phone, ship_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(session.id, now, session.livemode ? 1 : 0, session.metadata?.fulfillment || 'unknown', who.email || null, session.amount_total ?? null, JSON.stringify(items),
      session.metadata?.event_id || null, who.name || null, who.phone || null, shipTo ? JSON.stringify(shipTo) : null)];
  for (const [k, q] of Object.entries(need)) statements.push(db.prepare('UPDATE stock SET qty = MAX(qty - ?, 0), updated_at = ? WHERE key = ?').bind(q, now, k));
  try { await db.batch(statements); return 'recorded'; }
  catch (e) { if (/UNIQUE|PRIMARY KEY|constraint/i.test(String(e?.message))) return 'duplicate'; throw e; }
}

// ---- Branded order confirmation (sent through Resend after a paid webhook) ----
const OWNER_EMAIL = REPLY_TO;
const ORDER_FROM = PADDOCK_FROM;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = c => '$' + (Number(c || 0) / 100).toFixed(2);

function sessionLines(session) {
  let items;
  try { items = JSON.parse(session.metadata?.items || '[]'); } catch { items = []; }
  return items.map(itemLine);
}

export function orderNumber(session) { return '799-' + String(session.id || '').slice(-8).toUpperCase(); }

export function orderEmail(session, event = null) {
  const lines = sessionLines(session);
  const who = session.customer_details || {};
  const how = session.metadata?.fulfillment, table = how === 'table', atEvent = how === 'event', pickup = how !== 'ship' && !table;
  const shipTo = session.collected_information?.shipping_details || session.shipping_details || null;
  const td = session.total_details || {};
  const subtotal = session.amount_subtotal ?? lines.reduce((t, l) => t + l.cents * l.qty, 0);
  const shipping = td.amount_shipping ?? session.shipping_cost?.amount_total ?? 0;
  const tax = td.amount_tax ?? 0, discount = td.amount_discount ?? 0, total = session.amount_total ?? subtotal + shipping + tax - discount;
  const number = orderNumber(session), first = String(who.name || '').trim().split(/\s+/)[0];
  const a = shipTo?.address || {};
  const address = shipTo ? [shipTo.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + ' ' + (a.postal_code || '')].filter(v => v && v.trim()) : [];
  const eventName = event?.name || session.metadata?.event || 'the event';
  const next = table
    ? 'Paid at the 799 table. Show this email or your confirmation screen to collect your gear.'
    : atEvent
    ? 'Your order will be waiting in the 799 paddock at ' + eventName + (event ? ' (' + eventDates(event) + (event.place ? ', ' + event.place : '') + ')' : '') + '. ' +
      (event?.where_to_find ? 'Find us: ' + event.where_to_find + '. ' : "We'll email you where to find us before the event. ") + 'Show this email to collect your gear.'
    : pickup
    ? 'Your order is set for free local pickup in Downtown Traverse City, MI. Reply to this email with a few days and times that work, and Mike will confirm a pickup time and the address.'
    : 'Orders ship within 2 business days. You will get an email from Mike when it is on the way.';
  const totals = [['Subtotal', money(subtotal)], ...(discount ? [['Discount', '-' + money(discount)]] : []),
    ...(table ? [] : [[atEvent ? 'Paddock pickup' : pickup ? 'Local pickup' : 'Shipping', shipping ? money(shipping) : 'Free']]), ...(tax ? [['Sales tax', money(tax)]] : [])];

  const row = (l, r, strong) => '<tr><td style="padding:6px 0;color:' + (strong ? '#050505' : '#555') + ';font-weight:' + (strong ? '700' : '400') + '">' + l +
    '</td><td align="right" style="padding:6px 0;color:#050505;font-weight:' + (strong ? '700' : '400') + '">' + r + '</td></tr>';
  const items = lines.map(l => '<tr><td style="padding:12px 0;border-bottom:1px solid #e6e6e6"><div style="font-weight:700;color:#050505">' + esc(l.name) +
    '</div><div style="color:#666;font-size:14px;margin-top:2px">' + esc(l.description) + (l.qty > 1 ? ' &times; ' + l.qty : '') +
    '</div></td><td align="right" valign="top" style="padding:12px 0;border-bottom:1px solid #e6e6e6;color:#050505">' + money(l.cents * l.qty) + '</td></tr>').join('');
  const html = frame({ preheader: 'Order ' + number + ' is confirmed and paid.', body: '<h1 style="margin:0 0 6px;font-size:22px;color:#050505">' + (first ? 'Thanks, ' + esc(first) + '.' : 'Thanks for your order.') + '</h1>' +
    '<p style="margin:0 0 18px;color:#555;font-size:15px">Order ' + number + ' is confirmed and paid.</p>' +
    '<p style="margin:0 0 22px;color:#050505;font-size:15px;line-height:1.6;background:#f3fbf4;border-left:4px solid #20C933;padding:12px 14px">' + esc(next) + '</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">' + items + '</table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;margin-top:10px">' +
    totals.map(([l, r]) => row(l, r)).join('') + row('Total paid', money(total), true) + '</table>' +
    (address.length ? '<p style="margin:22px 0 0;color:#555;font-size:14px;line-height:1.5"><strong style="color:#050505">Shipping to</strong><br>' + address.map(esc).join('<br>') + '</p>' : '') +
    '<p style="margin:26px 0 0;color:#777;font-size:13px;line-height:1.6">Questions? Reply to this email.<br>All sales final. Wrong or damaged item? See ' +
    '<a href="https://799motorsport.com/returns" style="color:#050505">799motorsport.com/returns</a>.</p>' });
  const text = [(first ? 'Thanks, ' + first + '.' : 'Thanks for your order.'), 'Order ' + number + ' is confirmed and paid.', '', next, '',
    ...lines.map(l => l.qty + ' x ' + l.name + ' (' + l.description + ')  ' + money(l.cents * l.qty)), '',
    ...totals.map(([l, r]) => l + ': ' + r), 'Total paid: ' + money(total),
    ...(address.length ? ['', 'Shipping to:', ...address] : []), '',
    'Questions? Reply to this email.', 'All sales final. Wrong or damaged item? See https://799motorsport.com/returns'].join('\n');
  return { to: who.email || null, subject: 'Your 799 Motorsport order ' + number, html, text };
}

async function sendOrderEmail(env, session, emailFetch, event = null) {
  if (!env.RESEND_API_KEY) return 'off';
  const mail = orderEmail(session, event);
  if (!mail.to) return 'no-address';
  const body = { from: env.ORDER_FROM || ORDER_FROM, to: [mail.to], reply_to: OWNER_EMAIL, subject: mail.subject, html: mail.html, text: mail.text };
  if (env.ORDER_COPY !== 'off' && mail.to.toLowerCase() !== OWNER_EMAIL) body.bcc = [OWNER_EMAIL];
  try {
    const res = await emailFetch('https://api.resend.com/emails', { method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'order-' + session.id },
      body: JSON.stringify(body) });
    if (res.ok) return 'sent';
    console.log('Resend error', res.status, await res.text().catch(() => ''));
  } catch (e) { console.log('Resend error', e?.message || e); }
  return 'failed';
}

// Sample orders for /api/sample-emails: they go to Mike only, and only while SAMPLE_EMAILS=on.
export const SAMPLE_ORDERS = [
  { id: 'cs_sample_pickup01', metadata: { fulfillment: 'pickup', items: JSON.stringify([{ p: 'jug', c: 'Orange', q: 2 }, { p: 'ripper', q: 1 }]) },
    customer_details: { name: 'Pat Sample' }, amount_subtotal: 11943, amount_total: 12660, total_details: { amount_shipping: 0, amount_tax: 717, amount_discount: 0 } },
  { id: 'cs_sample_shipped2', metadata: { fulfillment: 'ship', items: JSON.stringify([{ p: 'jug', c: 'Kawi Green', q: 1 }, { p: 'pump', q: 1 }, { p: 'tuffspout', q: 1 }]) },
    customer_details: { name: 'Jordan Sample' }, amount_subtotal: 14597, amount_total: 16257, total_details: { amount_shipping: 2500, amount_tax: 0, amount_discount: 840 },
    collected_information: { shipping_details: { name: 'Jordan Sample', address: { line1: '123 Main Street', line2: 'Apt 4', city: 'Columbus', state: 'OH', postal_code: '43215' } } } },
  { id: 'cs_sample_single03', metadata: { fulfillment: 'ship', items: JSON.stringify([{ p: 'jug', c: 'Black', q: 1 }]) },
    customer_details: { name: 'Sam Sample' }, amount_subtotal: 4599, amount_total: 7525, total_details: { amount_shipping: 2500, amount_tax: 426, amount_discount: 0 },
    collected_information: { shipping_details: { name: 'Sam Sample', address: { line1: '400 Front Street', city: 'Traverse City', state: 'MI', postal_code: '49684' } } } }
];

async function sendSamples(env, emailFetch, stamp) {
  const results = [];
  for (const order of SAMPLE_ORDERS) {
    const mail = orderEmail(order);
    const res = await emailFetch('https://api.resend.com/emails', { method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': order.id + '-' + stamp },
      body: JSON.stringify({ from: env.ORDER_FROM || ORDER_FROM, to: [OWNER_EMAIL], reply_to: OWNER_EMAIL, subject: '[Sample] ' + mail.subject, html: mail.html, text: mail.text }) })
      .catch(e => ({ ok: false, status: 0, text: async () => String(e?.message || e) }));
    results.push(res.ok ? 'sent' : 'failed ' + res.status + ' ' + (await res.text().catch(() => '')).slice(0, 200));
  }
  return results;
}

// A clock and fetch dependency keep the Worker testable without Stripe.
export function createWorker({ now = () => Date.now(), stripeFetch = (...a) => fetch(...a), emailFetch = (...a) => fetch(...a) } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url), origin = request.headers.get('origin');
      const allowed = [...ORIGINS, ...(env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean)];
      const isWebhook = url.pathname === '/api/stripe-webhook';
      const permitted = isWebhook || !origin || allowed.includes(origin);
      const headers = { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
      if (origin && permitted && !isWebhook) Object.assign(headers, {
        'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' });
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
      try {
        if (!permitted) throw new APIError(403, 'This origin is not allowed.');
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        const db = env.DB;
        if (!db) throw new Error('Missing DB binding');
        const key = env.STRIPE_SECRET_KEY || '';

        if (request.method === 'GET' && ['/', '/api/health'].includes(url.pathname)) {
          const meta = await db.prepare('SELECT version FROM store_meta WHERE id = 1').first().catch(() => null);
          return json({ ok: meta?.version === 1, service: 'Scirocco 799 store', schema: meta?.version === 1 ? 'installed' : 'missing',
            stripeKey: key ? (/_test_/.test(key) ? 'test' : 'live') : 'missing', webhookSecret: env.STRIPE_WEBHOOK_SECRET ? 'set' : 'missing',
            tax: env.STRIPE_TAX === 'on' ? 'stripe' : 'off', email: env.RESEND_API_KEY ? 'resend' : 'off', priceWarnings: priceWarnings() });
        }

        if (request.method === 'GET' && url.pathname === '/api/sample-emails') {
          if (env.SAMPLE_EMAILS !== 'on' || !env.RESEND_API_KEY) throw new APIError(404, 'Not found.');
          return json({ to: OWNER_EMAIL, results: await sendSamples(env, emailFetch, now()) });
        }

        if (request.method === 'GET' && url.pathname === '/api/catalog') {
          const stock = await stockMap(db);
          const events = await upcomingEvents(db, localDate(now())).catch(() => []);
          return json({ catalog: CATALOG, shipping: SHIPPING, stock: publicStock(stock), events, mode: /_test_/.test(key) ? 'test' : 'live' });
        }

        if (request.method === 'POST' && url.pathname === '/api/checkout') {
          if (!key) throw new APIError(503, 'Checkout is not set up yet.');
          const text = await request.text();
          if (text.length > MAX_BODY) throw new APIError(413, 'Request too large.');
          let data; try { data = JSON.parse(text); } catch { throw new APIError(400, 'Invalid request.'); }
          if (!Array.isArray(data.items) || !data.items.length || data.items.length > MAX_LINES) throw new APIError(400, 'Your cart is empty.');
          if (!['ship', 'pickup', 'table', 'event'].includes(data.fulfillment)) throw new APIError(400, 'Choose pickup or shipping.');
          let event = null;
          if (data.fulfillment === 'event') {
            event = await eventRow(db, data.eventId);
            const today = localDate(now());
            if (!event || !event.active || today > event.order_by) throw new APIError(400, 'Paddock pickup for that event is closed. Please choose another option.');
          }
          const lines = data.items.map(priceLine);
          const stock = await stockMap(db), short = [];
          for (const [k, q] of Object.entries(needs(lines))) if ((stock[k] ?? 0) < q) short.push(k);
          if (short.length) return json({ error: 'Some items just went out of stock. Please update your cart.', soldOut: short, stock: publicStock(stock) }, 409);
          const site = origin && allowed.includes(origin) ? origin : SITE, base = site + RETURN_PATH;
          // Cancelled checkouts go back to the store page the buyer came from (only paths under /paddock).
          const back = typeof data.returnPath === 'string' && /^\/paddock(\/[a-z0-9-]+){0,4}\/?$/.test(data.returnPath) ? site + data.returnPath : base;
          const res = await stripeFetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST',
            headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form(checkoutParams(lines, data.fulfillment, base, env, back, event)) });
          const session = await res.json().catch(() => ({}));
          if (!res.ok || !session.url) { console.log('Stripe error', res.status, JSON.stringify(session.error || session)); throw new APIError(502, 'Checkout is unavailable right now. Please try again.'); }
          return json({ url: session.url });
        }

        // "Email me when it's back" for an out-of-stock item. Pitwall sends the email when stock comes back.
        if (request.method === 'POST' && url.pathname === '/api/notify') {
          const text = await request.text();
          if (text.length > 1024) throw new APIError(413, 'Request too large.');
          let data; try { data = JSON.parse(text); } catch { throw new APIError(400, 'Invalid request.'); }
          if (data.website) return json({ ok: true }); // filled in only by bots (hidden field)
          const sku = typeof data.sku === 'string' && Object.hasOwn(SKUS, data.sku) ? data.sku : null;
          const email = String(data.email || '').trim().toLowerCase();
          if (!sku) throw new APIError(400, 'Unknown product.');
          if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new APIError(400, 'Please enter a valid email address.');
          const waiting = await db.prepare('SELECT COUNT(*) AS n FROM restock_requests WHERE email = ? AND notified_at IS NULL').bind(email).first();
          if ((waiting?.n || 0) >= 20) throw new APIError(429, 'That email already has a lot of requests waiting.');
          await db.prepare('INSERT INTO restock_requests (sku, email, created_at) VALUES (?, ?, ?) ON CONFLICT (sku, email) DO UPDATE SET created_at = excluded.created_at, notified_at = NULL')
            .bind(sku, email, now()).run();
          return json({ ok: true });
        }

        if (request.method === 'POST' && isWebhook) {
          const payload = await request.text();
          if (!(await verifySignature(payload, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET, Math.floor(now() / 1000))))
            throw new APIError(400, 'Bad signature.');
          const event = JSON.parse(payload), session = event.data?.object;
          const paid = (event.type === 'checkout.session.completed' && session?.payment_status === 'paid') || event.type === 'checkout.session.async_payment_succeeded';
          if (!paid) return json({ received: true, ignored: event.type });
          const result = await recordOrder(db, session, now());
          const pickupEvent = session.metadata?.event_id ? await eventRow(db, session.metadata.event_id).catch(() => null) : null;
          const email = result === 'recorded' ? await sendOrderEmail(env, session, emailFetch, pickupEvent) : 'skipped';
          return json({ received: true, result, email });
        }

        throw new APIError(404, 'Not found.');
      } catch (error) {
        if (error instanceof APIError) return json({ error: error.message }, error.status);
        console.log('Store error', error?.stack || error);
        return json({ error: 'Something went wrong.' }, 500);
      }
    }
  };
}

export default createWorker();
