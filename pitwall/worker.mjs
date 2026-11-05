// Pitwall: the private 799 back office (events, stock, orders, prices).
// Lives on pitwall.799motorsport.com (live) and pitwall-test.799motorsport.com (test store), behind
// Cloudflare Access. Every request must carry a valid Access sign-in (checked here too, not only by Access).
// Bindings: DB = the store's D1 database. Vars: ACCESS_TEAM (e.g. 799motorsport.cloudflareaccess.com),
// ACCESS_AUD (the Access application's audience tag), ALLOWED_EMAILS (comma-separated, optional),
// GITHUB_REPO, GITHUB_BRANCH, STORE_LABEL. Secret: GITHUB_TOKEN (repo contents read/write, for prices).
import { PAGE } from './page.mjs';

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
export function setPrice(text, cart, { price, map }) {
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
  return text.slice(0, start) + part + text.slice(end);
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
  return data.products.filter(p => p.cart && (p.status || 'live') !== 'retired').map(p => ({ cart: p.cart, status: p.status || 'live', name: p.name, brand: p.brand, price: Number(p.price), map: p.map ?? null,
    category: p.category }))
    .map(p => ({ ...p, policy: brands[p.brand]?.mapPolicy || "" }));
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
function stockLabels(data) {
  const out = {};
  for (const p of data.products.filter(p => p.cart)) {
    if (p.colors) for (const c of p.colors) out['jug/color/' + c.name] = p.short + ', ' + c.name;
    else out[p.cart] = p.short || p.name;
  }
  return out;
}
function lineNames(data) {
  const byCart = Object.fromEntries(data.products.filter(p => p.cart).map(p => [p.cart, p.short || p.name]));
  return items => items.map(i => (i.q || 1) + ' × ' + (byCart[i.p] || i.p) + (i.c ? ' (' + i.c + ')' : ''));
}

export function createPitwall({ now = () => Date.now(), ghFetch = (...a) => fetch(...a), fetchCerts = u => fetch(u), catalogFallback = null } = {}) {
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
        const catalog = async () => catalogFallback || (await readCatalog(env, ghFetch)).data;

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

        // Stock
        if (path === '/api/stock' && request.method === 'GET') {
          const labels = stockLabels(await catalog().catch(() => ({ products: [] })));
          const { results } = await db.prepare('SELECT key, qty, updated_at FROM stock ORDER BY key').all();
          return json({ stock: results.filter(r => labels[r.key] || !r.key.startsWith('jug/spout/')).map(r => ({ ...r, label: labels[r.key] || r.key })) });
        }
        if (path === '/api/stock' && request.method === 'PUT') {
          const qty = Number(body.qty), key = clean(body.key, 80);
          if (!Number.isInteger(qty) || qty < 0 || qty > 9999) throw new APIError(400, 'Stock must be a whole number from 0 to 9999.');
          const r = await db.prepare('UPDATE stock SET qty = ?, updated_at = ? WHERE key = ?').bind(qty, t, key).run();
          if (!r.meta?.changes) await db.prepare('INSERT INTO stock (key, qty, updated_at) VALUES (?, ?, ?)').bind(key, qty, t).run();
          return json({ key, qty });
        }

        // Orders
        if (path === '/api/orders' && request.method === 'GET') {
          const names = lineNames(await catalog().catch(() => ({ products: [] })));
          const { results } = await db.prepare('SELECT o.*, e.name AS event_name, e.starts AS event_starts FROM orders o LEFT JOIN events e ON e.id = o.event_id ORDER BY o.created_at DESC LIMIT 200').all();
          return json({ orders: results.map(o => {
            let items = []; try { items = JSON.parse(o.items || '[]'); } catch {}
            let shipTo = null; try { shipTo = o.ship_to ? JSON.parse(o.ship_to) : null; } catch {}
            return { id: o.session_id, number: '799-' + String(o.session_id).slice(-8).toUpperCase(), created: o.created_at, live: !!o.livemode, how: o.fulfillment,
              event: o.event_name, email: o.email, name: o.name, phone: o.phone, shipTo, total: o.amount_total, lines: names(items), status: o.status || 'new', handled: o.handled_at };
          }) });
        }
        if (seg[2] === 'orders' && seg[3] && request.method === 'PUT') {
          const status = body.status === 'done' ? 'done' : 'new';
          const r = await db.prepare('UPDATE orders SET status = ?, handled_at = ? WHERE session_id = ?').bind(status, status === 'done' ? t : null, decodeURIComponent(seg[3])).run();
          if (!r.meta?.changes) throw new APIError(404, 'Order not found.');
          return json({ status });
        }

        // Prices (saved to store/catalog.json in GitHub; the push redeploys the pages and checkout)
        if (path === '/api/products' && request.method === 'GET') {
          const c = await readCatalog(env, ghFetch);
          return json({ products: productList(c.data), brands: Object.entries(c.data.brands || {}).map(([name, b]) => ({ name, policy: b.mapPolicy || '' })) });
        }
        if (seg[2] === 'products' && seg[3] && request.method === 'PUT') {
          const cart = decodeURIComponent(seg[3]), change = {};
          for (const k of ['price', 'map']) if (body[k] !== undefined && body[k] !== null && body[k] !== '') {
            const v = Number(body[k]);
            if (!Number.isFinite(v) || v <= 0 || v > 100000) throw new APIError(400, (k === 'price' ? 'Price' : 'MAP') + ' must be a number above 0.');
            change[k] = v;
          }
          if (!Object.keys(change).length) throw new APIError(400, 'Nothing to change.');
          const c = await readCatalog(env, ghFetch), p = c.data.products.find(x => x.cart === cart);
          if (!p) throw new APIError(404, 'Unknown product.');
          const text = setPrice(c.text, cart, change);
          JSON.parse(text);
          if (text === c.text) return json({ unchanged: true });
          const what = [change.price !== undefined ? 'price $' + p.price + ' → $' + fmt(change.price) : '', change.map !== undefined ? 'MAP $' + fmt(p.map ?? 0) + ' → $' + fmt(change.map) : ''].filter(Boolean).join(', ');
          const r = await gh(env, ghFetch, 'PUT', { message: 'Pitwall: ' + p.name + ' ' + what + ' (' + user.email + ')', content: toB64(text), sha: c.sha, branch: env.GITHUB_BRANCH,
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
