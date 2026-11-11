// Pitwall: the private 799 back office (events, stock, orders, prices).
// Lives on pitwall.799motorsport.com (live) and pitwall-test.799motorsport.com (test store), behind
// Cloudflare Access. Every request must carry a valid Access sign-in (checked here too, not only by Access).
// Bindings: DB = the store's D1 database. Vars: ACCESS_TEAM (e.g. 799motorsport.cloudflareaccess.com),
// ACCESS_AUD (the Access application's audience tag), ALLOWED_EMAILS (comma-separated, optional),
// GITHUB_REPO, GITHUB_BRANCH, STORE_LABEL. Secret: GITHUB_TOKEN (repo contents read/write, for prices).
import { PAGE } from './page.mjs';
// Product names and order come from the product list bundled at deploy time (every catalog change redeploys Pitwall).
import bundledCatalog from '../store/catalog.json' with { type: 'json' };
import { backInStockEmail, shippedEmail, carrierName, trackingUrl, CARRIERS, FROM, REPLY_TO, SITE } from '../store/emails.mjs';
import { syncNews, forgetNews, newsReady } from '../store/resend.mjs';

const CATALOG_PATH = 'store/catalog.json';
class APIError extends Error { constructor(status, message) { super(message); this.status = status; } }

// ---- Cloudflare Access sign-in ----
const b64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
let certCache = { at: 0, keys: [] };
export async function verifyAccess(token, { team, aud, now = Date.now(), fetchCerts = u => fetch(u) } = {}) {
  if (!token || !team || !aud) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, claims;
  try { header = JSON.parse(new TextDecoder().decode(b64url(parts[0]))); claims = JSON.parse(new TextDecoder().decode(b64url(parts[1]))); } catch { return null; }
  if (header.alg !== 'RS256') return null;
  if (now - certCache.at > 3600e3 || !certCache.keys.some(k => k.kid === header.kid)) {
    const res = await fetchCerts('https://' + team + '/cdn-cgi/access/certs');
    if (!res.ok) return null;
    certCache = { at: now, keys: (await res.json()).keys || [] };
  }
  const jwk = certCache.keys.find(k => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) return null;
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud) || claims.iss !== 'https://' + team) return null;
  if (!claims.exp || claims.exp * 1000 < now || (claims.nbf && claims.nbf * 1000 > now + 60e3)) return null;
  return claims.email ? { email: String(claims.email).toLowerCase() } : null;
}
export function _resetCertCache() { certCache = { at: 0, keys: [] }; }

// ---- Editing store/catalog.json without reformatting it ----
function productSpan(text, cart) {
  const at = text.indexOf('"cart": ' + JSON.stringify(cart));
  if (at < 0) throw new APIError(404, 'Unknown product.');
  const start = text.lastIndexOf('{', at), next = text.indexOf('"slug":', at);
  const end = next < 0 ? text.length : text.lastIndexOf('{', next);
  return [start, end];
}
const fmt = n => (Math.round(Number(n) * 100) / 100).toFixed(2);
export function setPrice(text, cart, { price, map, list, freeShipping }) {
  const [start, end] = productSpan(text, cart);
  let part = text.slice(start, end);
  if (price !== undefined) {
    if (!/"price": "[0-9.]+"/.test(part)) throw new APIError(500, 'Price field not found.');
    part = part.replace(/"price": "[0-9.]+"/, '"price": "' + fmt(price) + '"');
  }
  if (map !== undefined) {
    if (/"map": [0-9.]+/.test(part)) part = part.replace(/"map": [0-9.]+/, '"map": ' + Number(fmt(map)));
    else part = part.replace('"cart": ' + JSON.stringify(cart) + ',', '"cart": ' + JSON.stringify(cart) + ', "map": ' + Number(fmt(map)) + ',');
  }
  if (list !== undefined) {
    if (/"list": [0-9.]+/.test(part)) part = part.replace(/"list": [0-9.]+/, '"list": ' + Number(fmt(list)));
    else if (/"map": [0-9.]+,/.test(part)) part = part.replace(/("map": [0-9.]+),/, '$1, "list": ' + Number(fmt(list)) + ',');
    else part = part.replace('"cart": ' + JSON.stringify(cart) + ',', '"cart": ' + JSON.stringify(cart) + ', "list": ' + Number(fmt(list)) + ',');
  }
  if (freeShipping !== undefined) {
    const v = freeShipping === true;
    if (/"freeShipping": (true|false)/.test(part)) part = part.replace(/"freeShipping": (true|false)/, '"freeShipping": ' + v);
    else if (v) part = part.replace('"cart": ' + JSON.stringify(cart) + ',', '"cart": ' + JSON.stringify(cart) + ', "freeShipping": true,');
  }
  return text.slice(0, start) + part + text.slice(end);
}
// A configurator option's price, MAP and list live on its own one-line object in "variants": { "sku": "FR6USA", ... }.
export function setVariantPrice(text, cart, sku, { price, map, list }) {
  const [start, end] = productSpan(text, cart);
  const at = text.indexOf('{ "sku": ' + JSON.stringify(sku) + ',', start);
  if (at < 0 || at > end) throw new APIError(404, 'Unknown option.');
  const close = text.indexOf('}', at);
  let part = text.slice(at, close);
  const put = (k, v, quoted) => {
    const val = quoted ? '"' + fmt(v) + '"' : String(Number(fmt(v))), re = new RegExp('"' + k + '": ' + (quoted ? '"[0-9.]+"' : '[0-9.]+'));
    part = re.test(part) ? part.replace(re, '"' + k + '": ' + val) : part.replace(/\s*$/, ', "' + k + '": ' + val + ' ');
  };
  if (map !== undefined) put('map', map, false);
  if (list !== undefined) put('list', list, false);
  if (price !== undefined) put('price', price, true);
  return text.slice(0, at) + part + text.slice(close);
}
export function setPolicy(text, brand, policy) {
  const key = JSON.stringify(brand) + ': { "mapPolicy": ';
  const at = text.indexOf(key);
  if (at < 0) {
    const open = text.indexOf('"brands": {');
    if (open < 0) throw new APIError(500, 'Brands list not found.');
    const ins = open + '"brands": {'.length;
    return text.slice(0, ins) + '\n    ' + key + JSON.stringify(policy) + ' },' + text.slice(ins);
  }
  const from = at + key.length, close = text.indexOf(' }', from);
  JSON.parse(text.slice(from, close)); // the old value must be one JSON string
  return text.slice(0, from) + JSON.stringify(policy) + text.slice(close);
}

// ---- GitHub (catalog.json lives in the repo; a commit there redeploys the pages and checkout) ----
const toB64 = s => { const b = new TextEncoder().encode(s); let out = ''; for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(out); };
const fromB64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0)));
async function gh(env, ghFetch, method, body) {
  if (!env.GITHUB_TOKEN) throw new APIError(503, 'Price editing is not connected to GitHub yet.');
  const url = 'https://api.github.com/repos/' + env.GITHUB_REPO + '/contents/' + CATALOG_PATH + (method === 'GET' ? '?ref=' + encodeURIComponent(env.GITHUB_BRANCH) : '');
  const res = await ghFetch(url, { method, headers: { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': '799-pitwall',
    'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) throw new APIError(409, 'Someone else just changed prices. Reload and try again.');
  if (!res.ok) { console.log('GitHub error', res.status, JSON.stringify(data).slice(0, 300)); throw new APIError(502, 'GitHub refused the change (' + res.status + ').'); }
  return data;
}
async function readCatalog(env, ghFetch) {
  const f = await gh(env, ghFetch, 'GET');
  const text = fromB64(f.content);
  return { text, sha: f.sha, data: JSON.parse(text) };
}
function productList(data) {
  const brands = data.brands || {};
  return data.products.filter(p => p.cart && (p.status || 'live') !== 'retired').map(p => ({ cart: p.cart, status: p.status || 'live', name: p.name, brand: p.brand, price: p.variants ? null : Number(p.price), map: p.map ?? null, list: p.list ?? null,
    freeShipping: p.freeShipping === true, category: p.category,
    ...(p.variants ? { variants: p.variants.map(v => ({ sku: v.sku, name: optionName(v), status: v.status || 'live', price: Number(v.price), map: v.map ?? null, list: v.list ?? null })) } : {}) }))
    .map(p => ({ ...p, policy: brands[p.brand]?.mapPolicy || "" }));
}

// ---- Dealer cost (private, in D1) ----
async function costMap(db) {
  try { const { results } = await db.prepare('SELECT cart, cents FROM product_costs').all(); return Object.fromEntries(results.map(r => [r.cart, r.cents / 100])); }
  catch { return {}; } // table not migrated yet
}
async function saveCost(db, cart, cents, t) {
  if (cents === null) return db.prepare('DELETE FROM product_costs WHERE cart = ?').bind(cart).run();
  return db.prepare('INSERT INTO product_costs (cart, cents, updated_at) VALUES (?, ?, ?) ON CONFLICT (cart) DO UPDATE SET cents = excluded.cents, updated_at = excluded.updated_at').bind(cart, cents, t).run();
}

// ---- Data helpers ----
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v, n) => String(v ?? '').trim().slice(0, n);
export function slugify(name, starts) {
  const base = clean(name, 60).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
  return (base + '-' + String(starts).slice(0, 4)).slice(0, 60);
}
export function eventInput(d) {
  const e = { name: clean(d.name, 80), starts: clean(d.starts, 10), ends: clean(d.ends || d.starts, 10), place: clean(d.place, 80),
    whereToFind: clean(d.whereToFind, 200), orderBy: clean(d.orderBy, 10), active: d.active === false || d.active === 0 ? 0 : 1 };
  if (!e.name) throw new APIError(400, 'Give the event a name.');
  if (!DATE.test(e.starts) || !DATE.test(e.ends) || !DATE.test(e.orderBy)) throw new APIError(400, 'Dates must be filled in.');
  if (e.ends < e.starts) throw new APIError(400, 'The event ends before it starts.');
  if (e.orderBy > e.ends) throw new APIError(400, 'The order-by date must be on or before the last day of the event.');
  return e;
}
// One naming rule everywhere in Pitwall: the product's full name, then ", Color" for a color option.
// Stock is grouped by product, one row per variant (SKU), in the product list's order.
const optionName = v => v.label || v.opts.join(' ') + (v.size ? ', ' + v.size : ''); // "label" overrides, e.g. "All 6 ratchets"
const variantsOf = p => p.variants ? p.variants.map(v => ({ name: optionName(v), sku: v.sku, status: v.status || 'live', ...(v.includes ? { includes: v.includes } : {}) }))
  : p.colors ? p.colors.map(c => ({ name: c.name, sku: c.sku, img: c.img })) : [{ name: '', sku: p.sku }];
export function stockGroups(data) {
  return data.products.filter(p => p.cart).map(p => ({ product: p.cart, name: p.name, status: p.status || 'live',
    items: variantsOf(p).map(v => ({ sku: v.sku, variant: v.name, label: p.name + (v.name ? ', ' + v.name : ''), ...(v.status ? { status: v.status } : {}), ...(v.includes ? { includes: v.includes } : {}) })) }));
}
export function skuIndex(data) {
  const out = {};
  for (const p of data.products.filter(p => p.cart)) for (const v of variantsOf(p)) out[v.sku] = { p, v };
  return out;
}
function lineNames(data) {
  const idx = skuIndex(data);
  const byCart = Object.fromEntries(data.products.filter(p => p.cart).map(p => [p.cart, p]));
  return items => items.map(i => {
    const hit = i.s ? idx[i.s] : null, p = hit ? hit.p : byCart[i.p], variant = hit ? hit.v.name : i.c;
    const set = i.k && idx[i.k] ? ' (part of the ' + String(idx[i.k].v.name).split(':')[0].split(',')[0] + ' set)' : ''; // sets are sold as single ratchets
    return (i.q || 1) + ' × ' + (p ? p.name : (i.s || i.p)) + (variant ? ', ' + variant : '') + set;
  });
}
// The "It's back" email for one SKU, with the product's own photo and page.
export function restockMessage(data, sku) {
  const hit = skuIndex(data)[sku];
  if (!hit) return null;
  const { p, v } = hit;
  const base = p.variantImage && v.img ? p.variantImage.replace('{img}', v.img) : null;
  const image = base ? SITE + base + '-900.webp' : p.images?.[0]?.src ? SITE + p.images[0].src : '';
  const alt = p.variantAlt ? p.variantAlt.replace('{name}', p.name).replace('{variant}', v.name) : p.images?.[0]?.alt || p.name;
  return backInStockEmail({ name: p.name, variant: v.name, cents: Math.round(Number(p.price) * 100), image, imageAlt: alt, url: SITE + '/paddock/products/' + p.slug + '/' });
}
async function sendRestockNotices(env, db, data, sku, mailFetch, now) {
  const { results } = await db.prepare('SELECT id, email FROM restock_requests WHERE sku = ? AND notified_at IS NULL ORDER BY created_at').bind(sku).all();
  if (!results.length) return { sent: 0, failed: 0 };
  if (!env.RESEND_API_KEY) return { sent: 0, failed: 0, waiting: results.length, off: true };
  const mail = restockMessage(data, sku);
  if (!mail) return { sent: 0, failed: results.length };
  let sent = 0, failed = 0;
  for (const r of results) {
    const res = await mailFetch('https://api.resend.com/emails', { method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'restock-' + r.id + '-' + sku },
      body: JSON.stringify({ from: env.MAIL_FROM || FROM, to: [r.email], reply_to: REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text }) })
      .catch(e => ({ ok: false, status: 0, text: async () => String(e?.message || e) }));
    if (res.ok) { sent++; await db.prepare('UPDATE restock_requests SET notified_at = ? WHERE id = ?').bind(now, r.id).run(); }
    else { failed++; console.log('Resend error', res.status, (await res.text().catch(() => '')).slice(0, 200)); }
  }
  return { sent, failed };
}

// ---- Orders and shipments ----
const orderNumber = id => '799-' + String(id).slice(-8).toUpperCase();
// An order's items with names and the price each sold at (older orders have no saved price).
function orderItems(data, o) {
  const idx = skuIndex(data), byCart = Object.fromEntries(data.products.filter(p => p.cart).map(p => [p.cart, p]));
  return parseJSON(o.items, []).map(i => {
    const hit = i.s ? idx[i.s] : null, p = hit ? hit.p : byCart[i.p], v = hit ? hit.v : (p ? variantsOf(p).find(x => x.name === i.c) || variantsOf(p)[0] : null);
    const unit = Number.isFinite(i.u) ? i.u : null;
    return { name: p ? p.name : (i.s || i.p), variant: v?.name || i.c || '', sku: v?.sku || i.s || '', qty: i.q || 1, unit, line: unit === null ? null : unit * (i.q || 1) };
  });
}
// Shipments of one order, with tracking links, and how many of each item have shipped.
async function orderShipments(db, items, sessionId) {
  const { results } = await db.prepare('SELECT * FROM shipments WHERE session_id = ? ORDER BY created_at, id').bind(sessionId).all();
  const shipped = items.map(() => 0);
  const list = results.map(r => {
    const its = parseJSON(r.items, []).filter(x => items[x.i]);
    its.forEach(x => { shipped[x.i] += x.q; });
    return { id: r.id, carrier: r.carrier, carrierName: carrierName(r.carrier), tracking: parseJSON(r.tracking, []).map(n => ({ number: n, url: trackingUrl(r.carrier, n) })),
      items: its.map(x => ({ i: x.i, qty: x.q, name: items[x.i].name, variant: items[x.i].variant })), emailed: r.emailed_at, created: r.created_at };
  });
  return { list, shipped, remaining: items.map((it, k) => Math.max(it.qty - shipped[k], 0)) };
}
// A ship order's status follows its shipments: nothing shipped = open, some = partly shipped, everything = done.
async function syncShipStatus(db, o, remaining, shippedAny, now) {
  if (o.fulfillment !== 'ship') return o.status || 'new';
  const status = remaining.every(n => n === 0) ? 'done' : shippedAny ? 'partial' : 'new';
  if (status !== (o.status || 'new')) await db.prepare('UPDATE orders SET status = ?, handled_at = ? WHERE session_id = ?').bind(status, status === 'done' ? now : null, o.session_id).run();
  return status;
}
// Validate a shipment from Pitwall: a known carrier (or "other:<name>"), 1–10 tracking numbers, and items that are still to ship.
function readShipment(body, items, remaining) {
  let carrier = String(body.carrier || '').toLowerCase().trim();
  if (carrier === 'other') { const nm = String(body.carrierName || '').trim().slice(0, 40); if (!nm) throw new APIError(400, 'Name the carrier.'); carrier = 'other:' + nm; }
  else if (!CARRIERS[carrier]) throw new APIError(400, 'Pick a carrier.');
  const tracking = [...new Set((Array.isArray(body.tracking) ? body.tracking : []).map(n => String(n || '').replace(/\s+/g, '').toUpperCase().slice(0, 40)).filter(Boolean))];
  if (!tracking.length) throw new APIError(400, 'Add a tracking number.');
  if (tracking.length > 10) throw new APIError(400, 'Up to 10 tracking numbers per shipment.');
  const picked = (Array.isArray(body.items) ? body.items : []).map(x => ({ i: Number(x.i), q: Number(x.q) })).filter(x => Number.isInteger(x.i) && Number.isInteger(x.q) && x.q > 0);
  if (!picked.length) throw new APIError(400, 'Pick at least one item for this shipment.');
  const seen = new Set();
  for (const x of picked) {
    if (!items[x.i] || seen.has(x.i)) throw new APIError(400, 'Unknown item in the shipment.');
    seen.add(x.i);
    if (x.q > remaining[x.i]) throw new APIError(400, 'Only ' + remaining[x.i] + ' × ' + items[x.i].name + ' left to ship.');
  }
  return { carrier, tracking, items: picked };
}
async function emailShipment(env, mailFetch, o, items, ship, remaining) {
  if (!env.RESEND_API_KEY || !o.email) return false;
  const first = String(o.name || '').trim().split(/\s+/)[0] || '';
  const mail = shippedEmail({ firstName: first, number: orderNumber(o.session_id), carrier: carrierName(ship.carrier),
    tracking: ship.tracking.map(n => ({ number: n, url: trackingUrl(ship.carrier, n) })),
    items: ship.items.map(x => ({ name: items[x.i].name, variant: items[x.i].variant, qty: x.q })),
    remaining: items.map((it, k) => ({ name: it.name, variant: it.variant, qty: remaining[k] })).filter(x => x.qty > 0), shipTo: parseJSON(o.ship_to, null) });
  const res = await mailFetch('https://api.resend.com/emails', { method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'ship-' + ship.id + '-' + ship.version },
    body: JSON.stringify({ from: env.MAIL_FROM || FROM, to: [o.email], reply_to: REPLY_TO, subject: mail.subject, html: mail.html, text: mail.text }) })
    .catch(e => ({ ok: false, status: 0, text: async () => String(e?.message || e) }));
  if (!res.ok) console.log('Resend error', res.status, (await res.text().catch(() => '')).slice(0, 200));
  return res.ok;
}

// ---- Dashboard ----
// Start of today / this week (Monday) / this month in Michigan time, as UTC milliseconds.
function tzOffset(ms, tz = 'America/Detroit') {
  const d = new Date(ms), f = z => new Date(d.toLocaleString('en-US', { timeZone: z }));
  return f(tz) - f('UTC');
}
export function periodStarts(now, tz = 'America/Detroit') {
  const local = new Date(now + tzOffset(now, tz));
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), day = local.getUTCDate(), dow = (local.getUTCDay() + 6) % 7;
  const at = (yy, mm, dd) => { const guess = Date.UTC(yy, mm, dd); return guess - tzOffset(guess, tz); };
  return { today: at(y, m, day), week: at(y, m, day - dow), month: at(y, m, 1), last30: now - 30 * 864e5 };
}
export async function dashboard(db, data, now) {
  const p = periodStarts(now), idx = skuIndex(data), byCart = Object.fromEntries(data.products.filter(x => x.cart).map(x => [x.cart, x]));
  const sales = {};
  for (const k of ['today', 'week', 'month']) {
    const r = await db.prepare('SELECT COALESCE(SUM(CASE WHEN NOT (refunded_cents > 0 AND refunded_cents >= COALESCE(amount_total, 0)) THEN 1 ELSE 0 END), 0) AS n, COALESCE(SUM(COALESCE(amount_total, 0) - refunded_cents), 0) AS cents FROM orders WHERE created_at >= ?').bind(p[k]).first();
    sales[k] = { orders: r.n, cents: r.cents };
  }
  const open = (await db.prepare("SELECT fulfillment, COUNT(*) AS n FROM orders WHERE COALESCE(status, 'new') <> 'done' AND NOT (refunded_cents > 0 AND refunded_cents >= COALESCE(amount_total, 0)) GROUP BY fulfillment").all()).results;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Detroit' }).format(new Date(now));
  const ev = await db.prepare('SELECT e.*, (SELECT COUNT(*) FROM orders o WHERE o.event_id = e.id AND NOT (o.refunded_cents > 0 AND o.refunded_cents >= COALESCE(o.amount_total, 0))) AS orders FROM events e WHERE e.active = 1 AND e.ends >= ? ORDER BY e.starts LIMIT 1').bind(today).first();
  const stockRows = Object.fromEntries((await db.prepare('SELECT key, qty FROM stock').all()).results.map(r => [r.key, r.qty]));
  const wait = Object.fromEntries((await db.prepare('SELECT sku, COUNT(*) AS n FROM restock_requests WHERE notified_at IS NULL GROUP BY sku').all()).results.map(r => [r.sku, r.n]));
  const attention = stockGroups(data).filter(g => g.status === 'live').flatMap(g => g.items).filter(i => (i.status || 'live') === 'live' && !i.includes).map(i => ({ label: i.label, sku: i.sku, qty: stockRows[i.sku] ?? 0, waiting: wait[i.sku] || 0 }))
    .filter(i => i.qty < 2 || i.waiting);
  const cust = await db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS month, SUM(CASE WHEN marketing = 'opt_in' THEN 1 ELSE 0 END) AS optin, SUM(CASE WHEN orders_count > 0 THEN 1 ELSE 0 END) AS buyers FROM customers").bind(p.month).first();
  const signups = await db.prepare("SELECT COUNT(*) AS n FROM customers WHERE marketing_source = 'site sign-up (confirmed)' AND marketing_at >= ?").bind(p.month).first().catch(() => ({ n: 0 }));
  const recent = (await db.prepare('SELECT items, amount_total FROM orders WHERE created_at >= ? AND NOT (refunded_cents > 0 AND refunded_cents >= COALESCE(amount_total, 0))').bind(p.last30).all()).results;
  const sold = {};
  for (const o of recent) { let items = []; try { items = JSON.parse(o.items || '[]'); } catch {}
    for (const i of items) { const prod = i.s ? idx[i.s]?.p : byCart[i.p], key = prod ? prod.name : (i.s || i.p); sold[key] = (sold[key] || 0) + (i.q || 1); } }
  const top = Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, units]) => ({ name, units }));
  return { sales, open: { total: open.reduce((n, r) => n + r.n, 0), by: Object.fromEntries(open.map(r => [r.fulfillment, r.n])) },
    nextEvent: ev ? { name: ev.name, starts: ev.starts, ends: ev.ends, place: ev.place, orderBy: ev.order_by, orders: ev.orders, open: today <= ev.order_by,
      daysToCutoff: Math.round((Date.parse(ev.order_by) - Date.parse(today)) / 864e5) } : null,
    stock: attention, customers: { total: cust.total || 0, month: cust.month || 0, optIn: cust.optin || 0, buyers: cust.buyers || 0, signups: signups?.n || 0 }, top };
}

// ---- Customers ----
const parseJSON = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
const csvCell = v => { const t = String(v ?? ''); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
const addrText = a => a?.address ? [a.name, a.address.line1, a.address.line2, [a.address.city, a.address.state].filter(Boolean).join(', ') + ' ' + (a.address.postal_code || ''), a.address.country].filter(x => x && String(x).trim()).join(', ') : '';

// Send a customer's 799 News choice to Resend right away (the store's hourly sweep retries if this fails).
async function pushNews(env, db, newsFetch, id, now) {
  const c = await db.prepare('SELECT email, name, marketing FROM customers WHERE id = ?').bind(id).first();
  if (!c || c.marketing === 'unknown') return false;
  const [first, ...rest] = String(c.name || '').trim().split(/\s+/);
  const ok = await syncNews(env, newsFetch, { email: c.email, firstName: first || '', lastName: rest.join(' '), subscribed: c.marketing === 'opt_in' }).catch(() => false);
  if (ok) await db.prepare('UPDATE customers SET news_synced_at = ? WHERE id = ?').bind(now, id).run();
  return ok;
}

export function createPitwall({ now = () => Date.now(), ghFetch = (...a) => fetch(...a), fetchCerts = u => fetch(u), mailFetch = (...a) => fetch(...a), newsFetch = (...a) => fetch(...a), catalogData = bundledCatalog } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' };
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json;charset=utf-8' } });
      try {
        const user = await verifyAccess(request.headers.get('cf-access-jwt-assertion'), { team: env.ACCESS_TEAM, aud: env.ACCESS_AUD, now: now(), fetchCerts });
        const allowed = (env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (!user || (allowed.length && !allowed.includes(user.email))) {
          return new Response('Pitwall is private. Sign in through Cloudflare Access.', { status: 403, headers: { ...headers, 'Content-Type': 'text/plain;charset=utf-8' } });
        }
        if (request.method === 'GET' && url.pathname === '/') {
          return new Response(PAGE.replace('{{STORE}}', env.STORE_LABEL || 'Store'), { headers: { ...headers, 'Content-Type': 'text/html;charset=utf-8',
            'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'" } });
        }
        if (!url.pathname.startsWith('/api/')) throw new APIError(404, 'Not found.');
        // Writes must come from the Pitwall page itself.
        if (request.method !== 'GET') {
          const origin = request.headers.get('origin');
          if (origin && origin !== url.origin) throw new APIError(403, 'Wrong origin.');
          if (request.method !== 'DELETE' && !/application\/json/.test(request.headers.get('content-type') || '')) throw new APIError(415, 'Send JSON.');
        }
        const hasBody = request.method === 'POST' || request.method === 'PUT';
        const db = env.DB, body = hasBody ? await request.json().catch(() => { throw new APIError(400, 'Invalid request.'); }) : null;
        const t = now(), path = url.pathname.replace(/\/+$/, ''), seg = path.split('/');

        if (path === '/api/me') return json({ email: user.email, store: env.STORE_LABEL || '', branch: env.GITHUB_BRANCH || '', prices: !!env.GITHUB_TOKEN });

        // Events
        if (path === '/api/events' && request.method === 'GET') {
          const { results } = await db.prepare('SELECT e.*, (SELECT COUNT(*) FROM orders o WHERE o.event_id = e.id) AS orders FROM events e ORDER BY e.starts DESC, e.name LIMIT 100').all();
          return json({ events: results });
        }
        if (path === '/api/events' && request.method === 'POST') {
          const e = eventInput(body);
          let id = slugify(e.name, e.starts), n = 2;
          while (await db.prepare('SELECT 1 FROM events WHERE id = ?').bind(id).first()) id = slugify(e.name, e.starts) + '-' + n++;
          await db.prepare('INSERT INTO events (id, name, starts, ends, place, where_to_find, order_by, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(id, e.name, e.starts, e.ends, e.place, e.whereToFind, e.orderBy, e.active, t, t).run();
          return json({ id }, 201);
        }
        if (seg[2] === 'events' && seg[3] && seg.length === 4) {
          const id = decodeURIComponent(seg[3]);
          if (request.method === 'PUT') {
            const e = eventInput(body);
            const r = await db.prepare('UPDATE events SET name = ?, starts = ?, ends = ?, place = ?, where_to_find = ?, order_by = ?, active = ?, updated_at = ? WHERE id = ?')
              .bind(e.name, e.starts, e.ends, e.place, e.whereToFind, e.orderBy, e.active, t, id).run();
            if (!r.meta?.changes) throw new APIError(404, 'Event not found.');
            return json({ id });
          }
          if (request.method === 'DELETE') {
            const used = await db.prepare('SELECT COUNT(*) AS n FROM orders WHERE event_id = ?').bind(id).first();
            if (used?.n) throw new APIError(409, 'This event has orders. Switch it off instead of deleting it.');
            await db.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
            return json({ deleted: id });
          }
        }

        // Stock (by SKU), with how many people are waiting for each one to come back
        if (path === '/api/stock' && request.method === 'GET') {
          const { results } = await db.prepare('SELECT key, qty, updated_at FROM stock').all();
          const rows = Object.fromEntries(results.map(r => [r.key, r]));
          const wait = Object.fromEntries((await db.prepare('SELECT sku, COUNT(*) AS n FROM restock_requests WHERE notified_at IS NULL GROUP BY sku').all()).results.map(r => [r.sku, r.n]));
          return json({ groups: stockGroups(catalogData).map(g => ({ ...g, items: g.items.map(i => ({ ...i, qty: rows[i.sku]?.qty ?? 0, updated_at: rows[i.sku]?.updated_at || 0, waiting: wait[i.sku] || 0 })) })),
            email: !!env.RESEND_API_KEY });
        }
        if (path === '/api/stock' && request.method === 'PUT') {
          const known = skuIndex(catalogData), changes = Array.isArray(body.changes) ? body.changes : [];
          if (!changes.length || changes.length > 200) throw new APIError(400, 'Nothing to save.');
          for (const c of changes) {
            if (!Object.hasOwn(known, c.sku)) throw new APIError(400, 'Unknown SKU: ' + String(c.sku).slice(0, 40));
            if (known[c.sku].v.includes) throw new APIError(400, c.sku + ' is a set: its stock comes from its parts.');
            if (!Number.isInteger(c.qty) || c.qty < 0 || c.qty > 9999) throw new APIError(400, 'Stock must be a whole number from 0 to 9999.');
          }
          const notices = {};
          for (const c of changes) {
            const r = await db.prepare('UPDATE stock SET qty = ?, updated_at = ? WHERE key = ?').bind(c.qty, t, c.sku).run();
            if (!r.meta?.changes) await db.prepare('INSERT INTO stock (key, qty, updated_at) VALUES (?, ?, ?)').bind(c.sku, c.qty, t).run();
            if (c.qty > 0) notices[c.sku] = await sendRestockNotices(env, db, catalogData, c.sku, mailFetch, t);
          }
          const sent = Object.values(notices).reduce((n, x) => n + x.sent, 0), failed = Object.values(notices).reduce((n, x) => n + x.failed, 0);
          const held = Object.values(notices).reduce((n, x) => n + (x.off ? x.waiting : 0), 0);
          return json({ saved: changes.length, notified: sent, failed, held });
        }

        // Dashboard
        if (path === '/api/dashboard' && request.method === 'GET') return json(await dashboard(db, catalogData, t));

        // Customers
        if (path === '/api/customers' && request.method === 'GET') {
          const q = clean(url.searchParams.get('q'), 80).toLowerCase(), like = '%' + q.replace(/[%_]/g, '') + '%';
          const { results } = await db.prepare(`SELECT id, email, name, business, phone, marketing, source, orders_count, total_spent, last_order_at, created_at FROM customers
            WHERE ? = '' OR lower(email) LIKE ? OR lower(COALESCE(name, '')) LIKE ? OR lower(COALESCE(business, '')) LIKE ? OR COALESCE(phone, '') LIKE ? ORDER BY COALESCE(last_order_at, created_at) DESC LIMIT 300`).bind(q, like, like, like, like).all();
          return json({ customers: results });
        }
        // Add someone by hand (met at the track, asked at the table). "They asked for 799 News" records an in-person opt-in.
        if (path === '/api/customers' && request.method === 'POST') {
          const email = clean(body.email, 254).toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new APIError(400, 'Please enter a valid email address.');
          const existing = await db.prepare('SELECT id FROM customers WHERE email = ?').bind(email).first();
          if (existing) return json({ error: 'That email is already a customer.', id: existing.id }, 409);
          const news = body.news === true;
          const r = await db.prepare(`INSERT INTO customers (email, business, name, phone, notes, source, marketing, marketing_at, marketing_source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'pitwall', ?, ?, ?, ?, ?)`).bind(email, clean(body.business, 120) || null, ([clean(body.firstName, 60), clean(body.lastName, 60)].filter(Boolean).join(' ') || clean(body.name, 120)) || null, clean(body.phone, 40) || null, clean(body.notes, 2000),
              news ? 'opt_in' : 'unknown', news ? t : null, news ? 'in person: ' + user.email : null, t, t).run();
          const id = r.meta?.last_row_id ?? (await db.prepare('SELECT id FROM customers WHERE email = ?').bind(email).first()).id;
          const synced = news ? await pushNews(env, db, newsFetch, id, t) : false;
          return json({ id, synced }, 201);
        }
        if (path === '/api/customers.csv' && request.method === 'GET') {
          const { results } = await db.prepare('SELECT * FROM customers ORDER BY created_at').all();
          const head = ['email', 'name', 'business', 'phone', 'marketing', 'marketing_source', 'marketing_at', 'source', 'orders', 'total_spent', 'first_order', 'last_order', 'billing_address', 'shipping_address', 'notes', 'stripe_customer', 'created'];
          const iso = ms => ms ? new Date(ms).toISOString() : '';
          const rows = results.map(c => [c.email, c.name, c.business, c.phone, c.marketing, c.marketing_source, iso(c.marketing_at), c.source, c.orders_count, (c.total_spent / 100).toFixed(2),
            iso(c.first_order_at), iso(c.last_order_at), addrText(parseJSON(c.billing)), addrText(parseJSON(c.shipping)), c.notes, c.stripe_customer, iso(c.created_at)]);
          return new Response([head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n', { headers: { ...headers, 'Content-Type': 'text/csv;charset=utf-8',
            'Content-Disposition': 'attachment; filename="799-customers-' + new Date(t).toISOString().slice(0, 10) + '.csv"' } });
        }
        if (seg[2] === 'customers' && /^\d+$/.test(seg[3] || '') && seg.length === 4) {
          const id = Number(seg[3]);
          const c = await db.prepare('SELECT * FROM customers WHERE id = ?').bind(id).first();
          if (!c) throw new APIError(404, 'Customer not found.');
          if (request.method === 'GET') {
            const names = lineNames(catalogData);
            const { results } = await db.prepare('SELECT o.*, e.name AS event_name FROM orders o LEFT JOIN events e ON e.id = o.event_id WHERE o.customer_id = ? ORDER BY o.created_at DESC').bind(id).all();
            const waiting = (await db.prepare('SELECT sku FROM restock_requests WHERE email = ? AND notified_at IS NULL').bind(c.email).all()).results.map(r => skuIndex(catalogData)[r.sku] ? stockGroups(catalogData).flatMap(g => g.items).find(i => i.sku === r.sku).label : r.sku);
            return json({ customer: { ...c, billing: parseJSON(c.billing, null), shipping: parseJSON(c.shipping, null), addresses: parseJSON(c.addresses, []) }, waiting,
              orders: results.map(o => ({ id: o.session_id, number: '799-' + String(o.session_id).slice(-8).toUpperCase(), created: o.created_at, how: o.fulfillment, event: o.event_name,
                total: o.amount_total, refunded: o.refunded_cents || 0, lines: names(parseJSON(o.items, [])), status: o.status || 'new' })) });
          }
          if (request.method === 'PUT') {
            const notes = body.notes === undefined ? c.notes : clean(body.notes, 2000);
            let { marketing, marketing_at, marketing_source } = c;
            if (body.marketing !== undefined && body.marketing !== c.marketing) {
              if (!['opt_in', 'opt_out', 'unknown'].includes(body.marketing)) throw new APIError(400, 'Unknown email setting.');
              marketing = body.marketing; marketing_at = t; marketing_source = 'pitwall: ' + user.email;
            }
            await db.prepare('UPDATE customers SET notes = ?, marketing = ?, marketing_at = ?, marketing_source = ?, updated_at = ? WHERE id = ?').bind(notes, marketing, marketing_at, marketing_source, t, id).run();
            const synced = marketing !== c.marketing ? await pushNews(env, db, newsFetch, id, t) : null;
            return json({ id, notes, marketing, synced });
          }
          if (request.method === 'DELETE') {
            // A deletion request: remove the customer, their notify requests and site sign-ups, and take them off 799 News in
            // Resend; keep orders for the books, without personal details. Stripe keeps its own payment records.
            const news = newsReady(env) ? await forgetNews(env, newsFetch, c.email).catch(() => false) : null;
            await db.batch([
              db.prepare('DELETE FROM signups WHERE email = ?').bind(c.email),
              db.prepare('UPDATE orders SET email = NULL, name = NULL, phone = NULL, ship_to = NULL, billing = NULL, customer_id = NULL WHERE customer_id = ?').bind(id),
              db.prepare('DELETE FROM restock_requests WHERE email = ?').bind(c.email),
              db.prepare('DELETE FROM customers WHERE id = ?').bind(id)]);
            return json({ deleted: id, news }); // news: true = off 799 News in Resend, false = do it by hand, null = Resend not connected
          }
        }

        // Settings: who gets a copy of every order confirmation
        if (path === '/api/settings' && request.method === 'GET') {
          const row = await db.prepare("SELECT value, updated_at, updated_by FROM settings WHERE key = 'order_copies'").first();
          let list = [REPLY_TO]; if (row) { try { list = JSON.parse(row.value); } catch {} }
          return json({ orderCopies: list, updated: row?.updated_at || 0, by: row?.updated_by || '' });
        }
        if (path === '/api/settings' && request.method === 'PUT') {
          const raw = Array.isArray(body.orderCopies) ? body.orderCopies : null;
          if (!raw) throw new APIError(400, 'Send a list of emails.');
          const list = [...new Set(raw.map(e => String(e || '').trim().toLowerCase()).filter(Boolean))];
          if (list.length > 10) throw new APIError(400, 'Up to 10 addresses.');
          const bad = list.find(e => e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e));
          if (bad) throw new APIError(400, 'Not a valid email: ' + bad);
          await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('order_copies', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
            .bind(JSON.stringify(list), t, user.email).run();
          return json({ orderCopies: list });
        }

        // Orders
        if (path === '/api/orders' && request.method === 'GET') {
          const names = lineNames(catalogData);
          const { results } = await db.prepare('SELECT o.*, e.name AS event_name, e.starts AS event_starts FROM orders o LEFT JOIN events e ON e.id = o.event_id ORDER BY o.created_at DESC LIMIT 200').all();
          return json({ orders: results.map(o => {
            let items = []; try { items = JSON.parse(o.items || '[]'); } catch {}
            let shipTo = null; try { shipTo = o.ship_to ? JSON.parse(o.ship_to) : null; } catch {}
            return { id: o.session_id, number: '799-' + String(o.session_id).slice(-8).toUpperCase(), created: o.created_at, live: !!o.livemode, how: o.fulfillment,
              event: o.event_name, email: o.email, name: o.name, phone: o.phone, shipTo, total: o.amount_total, refunded: o.refunded_cents || 0, lines: names(items), status: o.status || 'new', handled: o.handled_at };
          }) });
        }
        // One order, in full: buyer, delivery, items at the price they sold for, money breakdown, refunds, shipments and a link to Stripe.
        if (seg[2] === 'orders' && seg[3] && seg.length === 4 && request.method === 'GET') {
          const o = await db.prepare(`SELECT o.*, e.name AS event_name, e.starts AS event_starts, e.ends AS event_ends, e.place AS event_place, c.id AS cust_id
            FROM orders o LEFT JOIN events e ON e.id = o.event_id LEFT JOIN customers c ON c.id = o.customer_id WHERE o.session_id = ?`).bind(decodeURIComponent(seg[3])).first();
          if (!o) throw new APIError(404, 'Order not found.');
          const items = orderItems(catalogData, o), sh = await orderShipments(db, items, o.session_id);
          items.forEach((it, k) => { it.shipped = sh.shipped[k]; it.remaining = sh.remaining[k]; });
          const pi = o.payment_intent, test = !o.livemode;
          const stripe = pi ? 'https://dashboard.stripe.com/' + (test ? 'test/' : '') + 'payments/' + encodeURIComponent(pi) : null; // no payment (older or free orders): no link
          return json({ order: { id: o.session_id, number: orderNumber(o.session_id), created: o.created_at, live: !!o.livemode, how: o.fulfillment,
            event: o.event_id ? { name: o.event_name || o.event_id, starts: o.event_starts, ends: o.event_ends, place: o.event_place } : null,
            customer: { id: o.cust_id || null, name: o.name, business: o.business, email: o.email, phone: o.phone }, shipTo: parseJSON(o.ship_to, null), billing: parseJSON(o.billing, null),
            items, totals: { subtotal: o.amount_subtotal, shipping: o.amount_shipping, tax: o.amount_tax, discount: o.amount_discount, total: o.amount_total, refunded: o.refunded_cents || 0 },
            status: o.status || 'new', handled: o.handled_at, refundedAt: o.refunded_at, stripe, shipments: sh.list,
            carriers: Object.entries(CARRIERS).map(([code, c]) => ({ code, name: c.name })) } });
        }
        // Shipments: add (POST), change (PUT /:sid) or remove (DELETE /:sid). Adding emails the customer unless told not to;
        // a change emails only when asked; removing never does.
        if (seg[2] === 'orders' && seg[3] && seg[4] === 'shipments') {
          const o = await db.prepare('SELECT * FROM orders WHERE session_id = ?').bind(decodeURIComponent(seg[3])).first();
          if (!o) throw new APIError(404, 'Order not found.');
          if (o.fulfillment !== 'ship') throw new APIError(400, 'Only shipped orders have tracking.');
          const items = orderItems(catalogData, o);
          const sid = seg[5] ? Number(seg[5]) : null;
          const old = sid ? await db.prepare('SELECT * FROM shipments WHERE id = ? AND session_id = ?').bind(sid, o.session_id).first() : null;
          if (sid && !old) throw new APIError(404, 'Shipment not found.');
          let emailed = null, id = sid;
          if (request.method === 'DELETE' && sid) {
            await db.prepare('DELETE FROM shipments WHERE id = ?').bind(sid).run();
          } else if ((request.method === 'POST' && !sid) || (request.method === 'PUT' && sid)) {
            const before = await orderShipments(db, items, o.session_id);
            const room = before.remaining.slice();
            if (old) parseJSON(old.items, []).forEach(x => { if (room[x.i] !== undefined) room[x.i] += x.q; }); // editing: this shipment's own items are available again
            const ship = readShipment(body, items, room);
            if (old) await db.prepare('UPDATE shipments SET carrier = ?, tracking = ?, items = ?, updated_at = ? WHERE id = ?').bind(ship.carrier, JSON.stringify(ship.tracking), JSON.stringify(ship.items), t, sid).run();
            else id = (await db.prepare('INSERT INTO shipments (session_id, carrier, tracking, items, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
              .bind(o.session_id, ship.carrier, JSON.stringify(ship.tracking), JSON.stringify(ship.items), t, t).first()).id;
            const sendIt = old ? body.email === true : body.email !== false;
            if (sendIt) {
              const after = await orderShipments(db, items, o.session_id);
              emailed = await emailShipment(env, mailFetch, o, items, { ...ship, id, version: t }, after.remaining);
              if (emailed) await db.prepare('UPDATE shipments SET emailed_at = ? WHERE id = ?').bind(t, id).run();
            }
          } else throw new APIError(405, 'Not allowed.');
          const now2 = await orderShipments(db, items, o.session_id);
          const status = await syncShipStatus(db, o, now2.remaining, now2.list.length > 0, t);
          return json({ id, status, emailed }); // emailed: true sent, false failed or no email address, null not asked
        }
        if (seg[2] === 'orders' && seg[3] && request.method === 'PUT') {
          const status = body.status === 'done' ? 'done' : body.status === 'partial' ? 'partial' : 'new';
          const r = await db.prepare('UPDATE orders SET status = ?, handled_at = ? WHERE session_id = ?').bind(status, status === 'done' ? t : null, decodeURIComponent(seg[3])).run();
          if (!r.meta?.changes) throw new APIError(404, 'Order not found.');
          return json({ status });
        }

        // Prices (saved to store/catalog.json in GitHub; the push redeploys the pages and checkout)
        if (path === '/api/products' && request.method === 'GET') {
          const c = await readCatalog(env, ghFetch), costs = await costMap(db);
          return json({ products: productList(c.data).map(p => ({ ...p, cost: costs[p.cart] ?? null, ...(p.variants ? { variants: p.variants.map(v => ({ ...v, cost: costs[v.sku] ?? null })) } : {}) })), brands: Object.entries(c.data.brands || {}).map(([name, b]) => ({ name, policy: b.mapPolicy || '' })) });
        }
        if (seg[2] === 'products' && seg[3] && request.method === 'PUT') {
          // "<cart>/<SKU>" is one option of a configurator product (its own price, MAP, list and cost).
          const [cart, sku] = decodeURIComponent(seg[3]).split('/'), change = {}, label = { price: 'Price', map: 'MAP', list: 'List price' };
          for (const k of ['price', 'map', 'list']) if (body[k] !== undefined && body[k] !== null && body[k] !== '') {
            const v = Number(body[k]);
            if (!Number.isFinite(v) || v <= 0 || v > 100000) throw new APIError(400, label[k] + ' must be a number above 0.');
            change[k] = v;
          }
          if (typeof body.freeShipping === 'boolean') { if (sku) throw new APIError(400, 'Free shipping is set on the product, not on one option.'); change.freeShipping = body.freeShipping; }
          // Cost is private: it is saved in the database, never in catalog.json (the repo is public). '' or null clears it.
          let cost;
          if (body.cost !== undefined) {
            if (body.cost === null || body.cost === '') cost = null;
            else { const v = Number(body.cost); if (!Number.isFinite(v) || v < 0 || v > 100000) throw new APIError(400, 'Cost must be a number, 0 or more.'); cost = Math.round(v * 100); }
          }
          if (!Object.keys(change).length && cost === undefined) throw new APIError(400, 'Nothing to change.');
          const known = catalogData.products.find(x => x.cart === cart);
          if (!known || (sku ? !known.variants?.some(v => v.sku === sku) : !!known.variants)) throw new APIError(404, sku ? 'Unknown option.' : 'Unknown product.');
          const costKey = sku || cart; // an option's cost is kept under its SKU
          if (!Object.keys(change).length) {
            await saveCost(db, costKey, cost, t);
            return json({ saved: true, cost: cost === null ? null : cost / 100 });
          }
          const c = await readCatalog(env, ghFetch), p = c.data.products.find(x => x.cart === cart);
          if (!p) throw new APIError(404, 'Unknown product.');
          const v = sku ? p.variants?.find(x => x.sku === sku) : null;
          if (sku && !v) throw new APIError(404, 'Unknown option.');
          if (cost !== undefined) await saveCost(db, costKey, cost, t);
          const was = v || p, text = sku ? setVariantPrice(c.text, cart, sku, change) : setPrice(c.text, cart, change);
          JSON.parse(text);
          if (text === c.text) return json(cost !== undefined ? { saved: true } : { unchanged: true });
          const what = [change.price !== undefined ? 'price $' + was.price + ' → $' + fmt(change.price) : '', change.map !== undefined ? 'MAP $' + fmt(was.map ?? 0) + ' → $' + fmt(change.map) : '',
            change.list !== undefined ? 'list $' + fmt(was.list ?? 0) + ' → $' + fmt(change.list) : '',
            change.freeShipping !== undefined && change.freeShipping !== (p.freeShipping === true) ? 'free shipping ' + (change.freeShipping ? 'on' : 'off') : ''].filter(Boolean).join(', ');
          const r = await gh(env, ghFetch, 'PUT', { message: 'Pitwall: ' + p.name + (v ? ', ' + optionName(v) : '') + ' ' + what + ' (' + user.email + ')', content: toB64(text), sha: c.sha, branch: env.GITHUB_BRANCH,
            committer: { name: 'Pitwall', email: 'pitwall@799motorsport.com' }, author: { name: user.email, email: user.email } });
          return json({ saved: true, commit: r.commit?.sha || null });
        }
        if (seg[2] === 'brands' && seg[3] && request.method === 'PUT') {
          const brand = decodeURIComponent(seg[3]), policy = clean(body.policy, 1000);
          const c = await readCatalog(env, ghFetch);
          if (!c.data.products.some(p => p.brand === brand)) throw new APIError(404, 'Unknown brand.');
          const text = setPolicy(c.text, brand, policy);
          JSON.parse(text);
          if (text === c.text) return json({ unchanged: true });
          await gh(env, ghFetch, 'PUT', { message: 'Pitwall: ' + brand + ' MAP policy (' + user.email + ')', content: toB64(text), sha: c.sha, branch: env.GITHUB_BRANCH,
            committer: { name: 'Pitwall', email: 'pitwall@799motorsport.com' }, author: { name: user.email, email: user.email } });
          return json({ saved: true });
        }
        throw new APIError(404, 'Not found.');
      } catch (error) {
        if (error instanceof APIError) return json({ error: error.message }, error.status);
        console.log('Pitwall error', error?.stack || error);
        return json({ error: 'Something went wrong.' }, 500);
      }
    }
  };
}

export default createPitwall();
