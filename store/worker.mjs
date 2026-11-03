// Paste this entire file into Cloudflare's Worker editor for scirocco799-store.
// Bindings: D1 database as DB. Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
// Optional secret: RESEND_API_KEY (branded order confirmation emails through Resend).
// Optional variables: STRIPE_TAX=on (Stripe Tax), ALLOWED_ORIGINS (extra comma-separated origins),
// ORDER_FROM (sender, default orders@scirocco799.com), ORDER_COPY=off (stop the copy to Mike),
// SAMPLE_EMAILS=on (temporarily lets /api/sample-emails send three sample confirmations to Mike only).

// ---- Catalog: prices in cents, MSRP from the Tuff Jug price list. MAP = MSRP - 15%. ----
export const SHIPPING = Object.freeze({
  ship: { cents: 2500, label: 'Flat-rate shipping (lower 48)' },
  pickup: { cents: 0, label: 'Local pickup: Downtown Traverse City, MI (by appointment)' },
  table: { cents: 0, label: 'At the 799 table: paid and collected in person' }
});
export const CATALOG = Object.freeze({
  jug: {
    name: 'Tuff Jug 5 Gallon Utility Jug', description: 'Auto-Stop Spout, view strip', cents: 4599, map: 3909,
    colors: ['Red', 'White', 'Yellow', 'Kawi Green', 'Orange', 'Black'],
    skus: { 'Red': 'RUASVS20', 'White': 'WUASVS20', 'Yellow': 'YUASVS20', 'Kawi Green': 'KUASVS20', 'Orange': 'OUAS20VS', 'Black': 'BLKUASVS20' }
  },
  pump: { name: 'Tuff Jug Electric Transfer Pump', description: 'Includes Tuff Jug adapter', cents: 7499, map: 6374, sku: '' },
  ripper: { name: 'Tuff Jug Black Ripper Cap, 5 Gallon', description: 'Fits 5 gallon Tuff Jugs', cents: 2745, map: 2333, sku: 'BLKR20' },
  tuffspout: { name: 'Tuff Jug Tuff Spout with Auto Stop, 5 Gallon', description: 'Stays flexible from -22°F to 200°F', cents: 2499, map: 2124, sku: '' }
});
export const ADDONS = ['pump', 'ripper', 'tuffspout'];

const ORIGINS = ['https://scirocco799.com', 'https://www.scirocco799.com', 'https://mwtcmi.github.io'];
const SITE = 'https://scirocco799.com';
const RETURN_PATH = '/paddock';
const MAX_LINES = 10, MAX_QTY = 10, MAX_BODY = 8192, SIG_TOLERANCE = 300;

class APIError extends Error { constructor(status, message) { super(message); this.status = status; } }

// Each cart line becomes a priced line plus the stock keys it uses.
export function priceLine(line) {
  const qty = Number(line?.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new APIError(400, 'Invalid quantity.');
  if (line.product === 'jug') {
    const j = CATALOG.jug;
    if (!j.colors.includes(line.color)) throw new APIError(400, 'Unknown jug color.');
    return { product: 'jug', color: line.color, qty, cents: j.cents, map: j.map, name: j.name,
      description: line.color + ', ' + j.description + ' (' + j.skus[line.color] + ')', keys: ['jug/color/' + line.color] };
  }
  if (ADDONS.includes(line.product)) {
    const p = CATALOG[line.product];
    return { product: line.product, qty, cents: p.cents, map: p.map, name: p.name,
      description: p.description + (p.sku ? ' (' + p.sku + ')' : ''), keys: [line.product] };
  }
  throw new APIError(400, 'Unknown product.');
}

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

export function checkoutParams(lines, fulfillment, returnBase, env = {}) {
  const ship = fulfillment === 'ship', rate = SHIPPING[fulfillment];
  const items = lines.map(l => l.product === 'jug' ? { p: 'jug', c: l.color, q: l.qty } : { p: l.product, q: l.qty });
  const p = {
    mode: 'payment',
    success_url: returnBase + '?order=success&via=' + fulfillment + '&ref={CHECKOUT_SESSION_ID}',
    cancel_url: returnBase + '?order=cancelled',
    allow_promotion_codes: 'true',
    line_items: lines.map(l => ({ quantity: l.qty, price_data: { currency: 'usd', unit_amount: l.cents,
      product_data: { name: l.name, description: l.description } } })),
    shipping_options: [{ shipping_rate_data: { type: 'fixed_amount', display_name: rate.label,
      fixed_amount: { amount: rate.cents, currency: 'usd' } } }],
    metadata: { items: JSON.stringify(items), fulfillment },
    payment_intent_data: { description: '799 Motorsport store order', metadata: { fulfillment } }
  };
  const policy = 'All sales final. Wrong or damaged items and warranty help: scirocco799.com/returns';
  if (ship) {
    p.shipping_address_collection = { allowed_countries: ['US'] };
    p.custom_text = { submit: { message: policy } };
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
  const lines = items.map(i => priceLine(i.p === 'jug' ? { product: 'jug', color: i.c, qty: i.q } : { product: i.p, qty: i.q }));
  const need = needs(lines);
  const statements = [db.prepare('INSERT INTO orders (session_id, created_at, livemode, fulfillment, email, amount_total, items) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(session.id, now, session.livemode ? 1 : 0, session.metadata?.fulfillment || 'unknown', session.customer_details?.email || null, session.amount_total ?? null, JSON.stringify(items))];
  for (const [k, q] of Object.entries(need)) statements.push(db.prepare('UPDATE stock SET qty = MAX(qty - ?, 0), updated_at = ? WHERE key = ?').bind(q, now, k));
  try { await db.batch(statements); return 'recorded'; }
  catch (e) { if (/UNIQUE|PRIMARY KEY|constraint/i.test(String(e?.message))) return 'duplicate'; throw e; }
}

// ---- Branded order confirmation (sent through Resend after a paid webhook) ----
const OWNER_EMAIL = 'mike@scirocco799.com';
const ORDER_FROM = 'Scirocco 799 <orders@scirocco799.com>';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = c => '$' + (Number(c || 0) / 100).toFixed(2);

function sessionLines(session) {
  let items;
  try { items = JSON.parse(session.metadata?.items || '[]'); } catch { items = []; }
  return items.map(i => priceLine(i.p === 'jug' ? { product: 'jug', color: i.c, qty: i.q } : { product: i.p, qty: i.q }));
}

export function orderNumber(session) { return '799-' + String(session.id || '').slice(-8).toUpperCase(); }

export function orderEmail(session) {
  const lines = sessionLines(session);
  const who = session.customer_details || {};
  const how = session.metadata?.fulfillment, table = how === 'table', pickup = how !== 'ship' && !table;
  const shipTo = session.collected_information?.shipping_details || session.shipping_details || null;
  const td = session.total_details || {};
  const subtotal = session.amount_subtotal ?? lines.reduce((t, l) => t + l.cents * l.qty, 0);
  const shipping = td.amount_shipping ?? session.shipping_cost?.amount_total ?? 0;
  const tax = td.amount_tax ?? 0, discount = td.amount_discount ?? 0, total = session.amount_total ?? subtotal + shipping + tax - discount;
  const number = orderNumber(session), first = String(who.name || '').trim().split(/\s+/)[0];
  const a = shipTo?.address || {};
  const address = shipTo ? [shipTo.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + ' ' + (a.postal_code || '')].filter(v => v && v.trim()) : [];
  const next = table
    ? 'Paid at the 799 table. Show this email or your confirmation screen to collect your gear.'
    : pickup
    ? 'Your order is set for free local pickup in Downtown Traverse City, MI. Reply to this email with a few days and times that work, and Mike will confirm a pickup time and the address.'
    : 'Orders ship within 2 business days. You will get an email from Mike when it is on the way.';
  const totals = [['Subtotal', money(subtotal)], ...(discount ? [['Discount', '-' + money(discount)]] : []),
    ...(table ? [] : [[pickup ? 'Local pickup' : 'Shipping', shipping ? money(shipping) : 'Free']]), ...(tax ? [['Sales tax', money(tax)]] : [])];

  const row = (l, r, strong) => '<tr><td style="padding:6px 0;color:' + (strong ? '#050505' : '#555') + ';font-weight:' + (strong ? '700' : '400') + '">' + l +
    '</td><td align="right" style="padding:6px 0;color:#050505;font-weight:' + (strong ? '700' : '400') + '">' + r + '</td></tr>';
  const items = lines.map(l => '<tr><td style="padding:12px 0;border-bottom:1px solid #e6e6e6"><div style="font-weight:700;color:#050505">' + esc(l.name) +
    '</div><div style="color:#666;font-size:14px;margin-top:2px">' + esc(l.description) + (l.qty > 1 ? ' &times; ' + l.qty : '') +
    '</div></td><td align="right" valign="top" style="padding:12px 0;border-bottom:1px solid #e6e6e6;color:#050505">' + money(l.cents * l.qty) + '</td></tr>').join('');
  const html = '<!doctype html><html><body style="margin:0;background:#f2f2f2;font-family:Arial,Helvetica,sans-serif">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:24px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden">' +
    '<tr><td style="background:#050505;padding:22px 28px"><span style="color:#fff;font-size:22px;font-weight:900;letter-spacing:.04em">SCIROCCO <span style="color:#20C933">799</span></span>' +
    '<div style="color:#20C933;font-size:11px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;margin-top:6px">The Paddock</div></td></tr>' +
    '<tr><td style="padding:28px">' +
    '<h1 style="margin:0 0 6px;font-size:22px;color:#050505">' + (first ? 'Thanks, ' + esc(first) + '.' : 'Thanks for your order.') + '</h1>' +
    '<p style="margin:0 0 18px;color:#555;font-size:15px">Order ' + number + ' is confirmed and paid.</p>' +
    '<p style="margin:0 0 22px;color:#050505;font-size:15px;line-height:1.6;background:#f3fbf4;border-left:4px solid #20C933;padding:12px 14px">' + esc(next) + '</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">' + items + '</table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;margin-top:10px">' +
    totals.map(([l, r]) => row(l, r)).join('') + row('Total paid', money(total), true) + '</table>' +
    (address.length ? '<p style="margin:22px 0 0;color:#555;font-size:14px;line-height:1.5"><strong style="color:#050505">Shipping to</strong><br>' + address.map(esc).join('<br>') + '</p>' : '') +
    '<p style="margin:26px 0 0;color:#777;font-size:13px;line-height:1.6">Questions? Reply to this email.<br>All sales final. Wrong or damaged item? See ' +
    '<a href="https://scirocco799.com/returns" style="color:#050505">scirocco799.com/returns</a>.</p>' +
    '</td></tr><tr><td style="background:#050505;padding:16px 28px;color:#aaa;font-size:12px">799 Motorsport &middot; Traverse City, MI &middot; ' +
    '<a href="https://scirocco799.com/paddock" style="color:#20C933;text-decoration:none">scirocco799.com</a></td></tr>' +
    '</table></td></tr></table></body></html>';
  const text = [(first ? 'Thanks, ' + first + '.' : 'Thanks for your order.'), 'Order ' + number + ' is confirmed and paid.', '', next, '',
    ...lines.map(l => l.qty + ' x ' + l.name + ' (' + l.description + ')  ' + money(l.cents * l.qty)), '',
    ...totals.map(([l, r]) => l + ': ' + r), 'Total paid: ' + money(total),
    ...(address.length ? ['', 'Shipping to:', ...address] : []), '',
    'Questions? Reply to this email.', 'All sales final. Wrong or damaged item? See https://scirocco799.com/returns'].join('\n');
  return { to: who.email || null, subject: 'Your Scirocco 799 order ' + number, html, text };
}

async function sendOrderEmail(env, session, emailFetch) {
  if (!env.RESEND_API_KEY) return 'off';
  const mail = orderEmail(session);
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
          return json({ catalog: CATALOG, shipping: SHIPPING, stock, mode: /_test_/.test(key) ? 'test' : 'live' });
        }

        if (request.method === 'POST' && url.pathname === '/api/checkout') {
          if (!key) throw new APIError(503, 'Checkout is not set up yet.');
          const text = await request.text();
          if (text.length > MAX_BODY) throw new APIError(413, 'Request too large.');
          let data; try { data = JSON.parse(text); } catch { throw new APIError(400, 'Invalid request.'); }
          if (!Array.isArray(data.items) || !data.items.length || data.items.length > MAX_LINES) throw new APIError(400, 'Your cart is empty.');
          if (!['ship', 'pickup', 'table'].includes(data.fulfillment)) throw new APIError(400, 'Choose pickup or shipping.');
          const lines = data.items.map(priceLine);
          const stock = await stockMap(db), short = [];
          for (const [k, q] of Object.entries(needs(lines))) if ((stock[k] ?? 0) < q) short.push(k);
          if (short.length) return json({ error: 'Some items just sold out. Please update your cart.', soldOut: short, stock }, 409);
          const base = (origin && allowed.includes(origin) ? origin : SITE) + RETURN_PATH;
          const res = await stripeFetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST',
            headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form(checkoutParams(lines, data.fulfillment, base, env)) });
          const session = await res.json().catch(() => ({}));
          if (!res.ok || !session.url) { console.log('Stripe error', res.status, JSON.stringify(session.error || session)); throw new APIError(502, 'Checkout is unavailable right now. Please try again.'); }
          return json({ url: session.url });
        }

        if (request.method === 'POST' && isWebhook) {
          const payload = await request.text();
          if (!(await verifySignature(payload, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET, Math.floor(now() / 1000))))
            throw new APIError(400, 'Bad signature.');
          const event = JSON.parse(payload), session = event.data?.object;
          const paid = (event.type === 'checkout.session.completed' && session?.payment_status === 'paid') || event.type === 'checkout.session.async_payment_succeeded';
          if (!paid) return json({ received: true, ignored: event.type });
          const result = await recordOrder(db, session, now());
          const email = result === 'recorded' ? await sendOrderEmail(env, session, emailFetch) : 'skipped';
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
