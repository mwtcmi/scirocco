// Paste this entire file into Cloudflare's Worker editor for scirocco799-store.
// Bindings: D1 database as DB. Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
// Optional variables: STRIPE_TAX=on (Stripe Tax), ALLOWED_ORIGINS (extra comma-separated origins).

// ---- Catalog: prices in cents, MSRP from the Tuff Jug price list. MAP = MSRP - 15%. ----
export const SHIPPING = Object.freeze({
  ship: { cents: 2500, label: 'Flat-rate shipping (lower 48)' },
  pickup: { cents: 0, label: 'Local pickup: Downtown Traverse City, MI (by appointment)' }
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
const RETURN_PATH = '/paddock-store-preview';
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
    success_url: returnBase + '?order=success&via=' + fulfillment,
    cancel_url: returnBase + '?order=cancelled',
    allow_promotion_codes: 'true',
    line_items: lines.map(l => ({ quantity: l.qty, price_data: { currency: 'usd', unit_amount: l.cents,
      product_data: { name: l.name, description: l.description } } })),
    shipping_options: [{ shipping_rate_data: { type: 'fixed_amount', display_name: rate.label,
      fixed_amount: { amount: rate.cents, currency: 'usd' } } }],
    metadata: { items: JSON.stringify(items), fulfillment },
    payment_intent_data: { description: '799 Motorsport store order', metadata: { fulfillment } }
  };
  if (ship) p.shipping_address_collection = { allowed_countries: ['US'] };
  else {
    p.phone_number_collection = { enabled: 'true' };
    p.custom_text = { submit: { message: "Pickup is by appointment in Downtown Traverse City, MI. We'll email you to set a time." } };
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

// A clock and fetch dependency keep the Worker testable without Stripe.
export function createWorker({ now = () => Date.now(), stripeFetch = (...a) => fetch(...a) } = {}) {
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
            tax: env.STRIPE_TAX === 'on' ? 'stripe' : 'off', priceWarnings: priceWarnings() });
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
          if (!['ship', 'pickup'].includes(data.fulfillment)) throw new APIError(400, 'Choose pickup or shipping.');
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
          return json({ received: true, result: await recordOrder(db, session, now()) });
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
