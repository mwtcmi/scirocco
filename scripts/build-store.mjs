#!/usr/bin/env node
// Builds The Paddock store pages from store/catalog.json:
//   paddock/<category>/index.html            category pages (24 products a page; more add /page/2/ ...)
//   paddock/products/<product>/index.html    product pages for products sold through the 799 cart (the address
//                                            never depends on the category, so a product can move without losing it)
//   paddock/brands/<brand>/index.html        brand pages, for brands that aren't already a category of their own
//   _redirects                               the part between "# store:redirects" markers (old product addresses)
//   paddock.html                             the parts between <!-- store:... --> markers (category tiles, brand row, structured data, cart)
// Head styles, menus and the footer are copied from paddock.html and scripts/site-footer.html,
// so the store pages always match the rest of the site. Run after any catalog change, then
// node scripts/wrap-up.mjs before committing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://799motorsport.com';
const PAGE_SIZE = 24;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const catalog = JSON.parse(read('store/catalog.json'));
const footer = read('scripts/site-footer.html').trim();
let home = read('paddock.html');

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cats = catalog.categories;
const catBySlug = Object.fromEntries(cats.map(c => [c.slug, c]));
const products = catalog.products;
// A product can go in before its photos exist: with no "images" it shows a "Photo coming soon" placeholder
// until real photos are added.
for (const p of products) if (!p.colors && !p.external && !p.images?.length) p.images = [{ src: '/images/optimized/photo-coming-soon-900.webp', src480: '/images/optimized/photo-coming-soon-480.webp', w: 900, h: 900, alt: `${p.name} (photo coming soon)` }];
// Product lifecycle: "status" is "live" (default: shown and sold), "coming-soon" (shown, not sold yet) or
// "retired" (hidden from the store; its page stays up as "no longer available", pointing to "replacedBy" or
// its category, so old links and search results keep working). Nothing is ever deleted.
const STATUSES = ['live', 'coming-soon', 'retired'];
// Configurator products ("options" + "variants"): one product with a picker, e.g. the MVRK ratchets
// (Drive 1/4" 3/8" 1/2" x Head Fixed/Flex). Each variant is one combination with its own SKU, price, MAP and list;
// "opts" lists its value for each option in order and "size" is shown after it ("3/8\" Flex, 12\"").
// A variant can be "coming-soon" while the rest sell. Photos with a "sku" belong to that variant; untagged
// photos show for every variant. The product's price is its lowest variant price ("from").
const optionName = v => v.label || v.opts.join(' ') + (v.size ? ', ' + v.size : ''); // "label" overrides, e.g. "All 6 ratchets"
const PLACEHOLDER = { src: '/images/optimized/photo-coming-soon-900.webp', src480: '/images/optimized/photo-coming-soon-480.webp', w: 900, h: 900 };
for (const p of products.filter(p => p.variants)) {
  if (!Array.isArray(p.options) || !p.options.length) throw new Error(`${p.slug}: "variants" needs "options"`);
  if (p.colors) throw new Error(`${p.slug}: use "colors" or "variants", not both`);
  const seen = new Set(), combos = new Set();
  if (p.pick && p.pick !== 'many') throw new Error(`${p.slug}: "pick" can only be "many"`);
  if (p.pick === 'many' && p.options.length !== 2) throw new Error(`${p.slug}: "pick": "many" needs exactly two options (columns and rows)`);
  for (const v of p.variants) {
    if (!v.sku || seen.has(v.sku)) throw new Error(`${p.slug}: every variant needs its own SKU`);
    seen.add(v.sku);
    if (v.includes) { if (!v.label && !v.opts) throw new Error(`${p.slug} ${v.sku}: a set needs a "label"`); if (!v.opts) { if (!(Number(v.price) > 0)) throw new Error(`${p.slug} ${v.sku}: needs a price`); continue; } }
    if (!Array.isArray(v.opts) || v.opts.length !== p.options.length || v.opts.some((x, i) => !p.options[i].values.includes(x))) throw new Error(`${p.slug} ${v.sku}: "opts" must give one listed value per option`);
    if (combos.has(v.opts.join('|'))) throw new Error(`${p.slug}: two variants are ${v.opts.join(' ')}`);
    combos.add(v.opts.join('|'));
    if (!(Number(v.price) > 0)) throw new Error(`${p.slug} ${v.sku}: needs a price`);
    if (v.status && !['live', 'coming-soon'].includes(v.status)) throw new Error(`${p.slug} ${v.sku}: status must be live or coming-soon`);
  }
  for (const v of p.variants) if ((v.cut || v.inches) && !(v.cut && Number(v.inches) > 0)) throw new Error(`${p.slug} ${v.sku}: "cut" (a same-scale cut-out photo) and "inches" go together`);
  // A set: "includes" lists other (single) SKUs of this product; it sells as one line and takes one of each part.
  for (const v of p.variants.filter(v => v.includes)) {
    if (!Array.isArray(v.includes) || v.includes.length < 2 || v.includes.some(k => !p.variants.some(x => x.sku === k && !x.includes))) throw new Error(`${p.slug} ${v.sku}: "includes" must list two or more of this product's single SKUs`);
  }
  for (const i of p.images || []) for (const k of [i.sku, ...(i.skus || [])].filter(Boolean)) if (!seen.has(k)) throw new Error(`${p.slug}: photo for unknown SKU ${k}`);
  for (const q of p.quick || []) if (!q.label || !Array.isArray(q.skus) || !q.skus.length || q.skus.some(k => !seen.has(k))) throw new Error(`${p.slug}: every "quick" button needs a label and this product's SKUs`);
  if (p.defaultSku && !seen.has(p.defaultSku)) throw new Error(`${p.slug}: defaultSku ${p.defaultSku} is not a variant`);
  const forSale = p.variants.filter(v => (v.status || 'live') === 'live');
  p.price = Math.min(...(forSale.length ? forSale : p.variants).map(v => Number(v.price))).toFixed(2);
}
const status = p => p.status || 'live';
for (const p of products) if (!STATUSES.includes(status(p))) throw new Error(`${p.slug}: status must be ${STATUSES.join(', ')}`);
const isLive = p => status(p) === 'live', isRetired = p => status(p) === 'retired';
const inCat = slug => products.filter(p => p.category === slug && !isRetired(p));
const cartProducts = products.filter(p => p.cart);
const sellable = cartProducts.filter(isLive);
const catUrl = c => `/paddock/${c.slug}/`;
const prodUrl = p => p.external || `/paddock/products/${p.slug}/`;
// Brands: every product sold through the 799 cart names its "brand". A brand gets its own page at
// /paddock/brands/<brand>/, unless a category already holds exactly that brand's products (Tuff Jug today):
// then the category page is the brand page, so the store never has two pages with the same list.
const slugify = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const brandInfo = catalog.brands || {};
for (const p of products) if (p.cart && !p.brand) throw new Error(`${p.slug}: products sold through the cart need a brand`);
const abs = u => u.startsWith('http') ? u : SITE + u;
const money = s => '$' + s;
for (const p of products) if (!catBySlug[p.category]) throw new Error(`${p.slug}: unknown category ${p.category}`);

// ---- Pieces copied from paddock.html ----
const baseStyle = home.match(/<style>\n:root[\s\S]*?<\/style>/)[0];
const menu = home.match(/<nav>[\s\S]*?<\/nav>/)[0]
  .replace(/href="index\.html"/g, 'href="/"')
  .replace(/href="photos\/"/g, 'href="/photos/"')
  .replace(/href="([a-z0-9-]+\.html)"/g, 'href="/$1"');

// Variants: every sellable thing has a SKU. A product with "colors" has one variant per color (photo from
// "variantImage" with {img}); any other product is a single variant with its own SKU and first photo.
const imgOf = i => ({ src: i.src, srcset: i.src480 ? `${i.src480} 480w,${i.src} ${i.w}w` : '', alt: i.alt });
function variantsOf(p) {
  if (p.variants) return p.variants.map(v => {
    // A set shows its own photos if it has any, otherwise its parts' photos.
    // Photos: "sku" = that option's own photo (shown first); "skus" = a shared photo (e.g. a close-up true for every
    // fixed-head size). A set shows its own photos if it has any, otherwise its parts'.
    const shows = (p.images || []).some(i => i.sku === v.sku) ? [v.sku] : v.includes || [v.sku];
    const imgs = p.images || [], own = imgs.filter(i => shows.includes(i.sku)).concat(imgs.filter(i => i.skus && i.skus.some(k => shows.includes(k)))), name = optionName(v);
    return { name, sku: v.sku, upc: v.upc || '', opts: v.opts, size: v.size || '', ...(v.cut ? { cut: v.cut, inches: v.inches } : {}), cents: Math.round(Number(v.price) * 100), soon: (v.status || 'live') !== 'live', shows,
      ...(v.includes ? { includes: v.includes } : {}), img: imgOf(own[0] || { ...PLACEHOLDER, alt: `${p.name}, ${name} (photo coming soon)` }) };
  });
  if (!p.colors) { const i = p.images?.[0]; return [{ name: '', sku: p.sku || '', upc: p.upc || '', img: i ? { src: i.src, srcset: i.src480 ? `${i.src480} 480w,${i.src} ${i.w}w` : '', alt: i.alt } : null }]; }
  return p.colors.map(c => {
    const base = p.variantImage ? p.variantImage.replace('{img}', c.img) : null;
    const alt = (p.variantAlt || '{name}, {variant}').replace('{name}', p.name).replace('{variant}', c.name);
    return { name: c.name, sku: c.sku, upc: c.upc, hex: c.hex, img: base ? { src: `${base}-900.webp`, srcset: `${base}-480.webp 480w,${base}-900.webp 900w`, alt } : null };
  });
}
const defaultVariant = p => { const vs = variantsOf(p); return vs.find(v => v.name === p.defaultColor || v.sku === p.defaultSku) || vs[0]; };
const multi = p => !!p.colors || !!p.variants;
const picker = p => !!p.variants;
// "madeInUSA": true puts a small US flag over the bottom-right corner of the product's photo.
const FLAG_SVG = (() => {
  const stripes = Array.from({ length: 13 }, (_, i) => i % 2 ? '' : `<rect y="${(i * 100 / 13).toFixed(2)}" width="190" height="${(100 / 13).toFixed(2)}" fill="#b22234"/>`).join('');
  const stars = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) stars.push(`<circle cx="${(r % 2 ? 12.67 : 6.33) + c * 12.67}" cy="${5.38 + r * 5.38}" r="1.9"/>`);
  return `<svg viewBox="0 0 190 100" aria-hidden="true" focusable="false"><rect width="190" height="100" fill="#fff"/>${stripes}<rect width="76" height="53.85" fill="#3c3b6e"/><g fill="#fff">${stars.join('')}</g></svg>`;
})();
const usaFlag = p => p.madeInUSA ? `<span class="usa-flag" role="img" aria-label="Made in USA" title="Made in USA">${FLAG_SVG}</span>` : '';
// Optional product-page story: "story" {kicker, title, text} and "points" [{title, text}] (e.g. Repair / Replacement / Support).
for (const p of products) {
  if (p.story && !(p.story.title && p.story.text)) throw new Error(`${p.slug}: "story" needs a title and text`);
  if (p.points && !(Array.isArray(p.points) && p.points.every(x => x.title && x.text))) throw new Error(`${p.slug}: every one of "points" needs a title and text`);
}
for (const p of products) if (p.madeInUSA !== undefined && typeof p.madeInUSA !== 'boolean') throw new Error(`${p.slug}: madeInUSA must be true or false`);


// The data the shared cart script needs on every store page.
const onPage = cartProducts.filter(p => isLive(p) || (picker(p) && !isRetired(p))); // a coming-soon configurator still lets you pick
const clientData = {
  products: Object.fromEntries(onPage.map(p => [p.cart, { name: p.name, short: p.short || p.name, cat: p.category, option: p.colors ? 'Color' : picker(p) ? 'Option' : null, freeShipping: p.freeShipping === true,
    default: defaultVariant(p).name, variants: variantsOf(p), ...(picker(p) ? { options: p.options.map(o => o.name), ...(p.pick ? { pick: p.pick } : {}) } : {}) }])),
  fallback: Object.fromEntries(sellable.map(p => [p.cart, { cents: Math.round(p.price * 100) }]))
};

// "season" in catalog.json: the line that says what buying here does (gets 799 to the start line), on the store front,
// every category page and in the cart. Leave it out to hide it.
const season = catalog.season || null;
const seasonLine = season ? `<p class="season-line">${esc(season.line)} <strong>${esc(season.bold)}</strong>${season.link ? ` <a href="${season.link}">${esc(season.linkText || 'See the schedule')} →</a>` : ''}</p>` : '';
const cartBlock = `<button class="cart-btn" id="cart-btn" aria-haspopup="dialog" aria-controls="cart"><span>Cart</span><b id="cart-count">0</b><em id="cart-total">$0.00</em></button>
<div class="cart-shade" id="cart-shade" hidden></div>
<aside class="cart" id="cart" role="dialog" aria-modal="true" aria-label="Cart" hidden>
  <div class="cart-head"><div class="kicker">Your Cart</div><button class="cart-close" id="cart-close" aria-label="Close cart">&times;</button></div>
  <ul class="cart-lines" id="cart-lines"></ul>
  <div class="upsell" id="upsell" hidden><span>Goes with your order</span><div class="upsell-btns" id="upsell-btns"></div></div>
  <fieldset class="opt get"><legend>How do you want it?</legend>
    <label id="get-table" style="display:none"><input type="radio" name="get" value="table"> <span><strong>Take it now, free</strong><small>Paying here at the 799 table. Show your confirmation screen to collect.</small></span></label>
    <div id="get-events"></div>
    <label><input type="radio" name="get" value="pickup" checked> <span><strong>Local pickup, free</strong><small>Downtown Traverse City, MI, by appointment. We'll email you to set a time.</small></span></label>
    <label><input type="radio" name="get" value="ship"> <span><strong id="ship-label">Ship to me</strong><small id="ship-note">Lower 48. Address on the next screen.</small></span></label>
  </fieldset>
  <p class="cart-error" id="cart-error" role="alert" hidden></p>
  <div class="cart-sum"><span id="sum-label">Subtotal</span><strong id="cart-sub">$0.00</strong></div>
  <button class="checkout" id="checkout">Checkout</button>${season?.cart ? `
  <p class="cart-season">${esc(season.cart)}</p>` : ''}
  <p class="fine">All sales final. See <a href="/returns">returns, warranty &amp; shipping</a>, <a href="/terms">terms</a> and <a href="/privacy">privacy</a>. Secure checkout by Stripe: card, Apple Pay and Google Pay. Promo codes go on the next screen. Orders include occasional 799 News by email; say no at checkout or unsubscribe any time.</p>
</aside>
<script>window.PADDOCK=${JSON.stringify(clientData)};</script>
<script src="/paddock-store.js?v=25"></script>`;

// ---- Structured data ----
const seller = { '@type': 'Organization', name: catalog.seller };
// Availability here is a safe default (the build can't see stock); paddock-store.js swaps in live stock on load.
function offer(p, url) { return { '@type': 'Offer', price: p.price, priceCurrency: 'USD', availability: 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition', seller, url: abs(url) }; }
// Same titles and main photo as the Merchant Center feed (store/feed.mjs): "feedTitle" template, and a plain photo
// first (the measured shot has text on it, which Google doesn't allow as a main image).
const feedTitle = (p, v) => p.feedTitle ? p.feedTitle.replace(/\{(\w+)\}/g, (m, k) => k === 'size' ? v.size : (i => i >= 0 ? v.opts[i] : m)(p.options.findIndex(o => o.name === k))) : `${p.name}, ${v.name}`;
const plainPhoto = (p, v) => { const own = (p.images || []).filter(i => i.sku === v.sku || (i.skus || []).includes(v.sku)); return (own.find(i => !/-dim-/.test(i.src)) || own[0] || v.img).src; };
function productLd(p) {
  const url = prodUrl(p), brand = { '@type': 'Brand', name: p.brand };
  if (picker(p)) return { '@context': 'https://schema.org', '@type': 'ProductGroup', name: p.name, productGroupID: p.slug, brand, url: abs(url), description: p.about, variesBy: ['https://schema.org/size'],
    hasVariant: variantsOf(p).filter(v => !v.soon).map(v => ({ '@type': 'Product', name: feedTitle(p, v), size: v.name, sku: v.sku, mpn: v.sku, ...(v.upc ? { gtin12: v.upc } : {}), brand,
      image: abs(plainPhoto(p, v)), offers: { ...offer(p, `${url}?sku=${encodeURIComponent(v.sku)}`), price: (v.cents / 100).toFixed(2) } })) };
  if (p.colors) return { '@context': 'https://schema.org', '@type': 'ProductGroup', name: p.name + ' with Auto-Stop Spout', productGroupID: p.slug, brand, url: abs(url),
    description: p.about, variesBy: ['https://schema.org/color'],
    hasVariant: p.colors.map(c => ({ '@type': 'Product', name: `${p.name}, ${c.name}, Auto-Stop Spout`, sku: c.sku, mpn: c.sku, gtin12: c.upc, color: c.name, brand,
      image: abs(variantsOf(p).find(v => v.sku === c.sku).img.src), offers: offer(p, `${url}?color=${encodeURIComponent(c.name)}`) })) };
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.name, brand, description: p.about, image: p.images.map(i => abs(i.src)), url: abs(url), offers: offer(p, url) };
  if (p.sku) Object.assign(ld, { sku: p.sku, mpn: p.sku });
  if (p.upc) ld.gtin12 = p.upc;
  if (p.color) ld.color = p.color;
  return ld;
}
const crumbsLd = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(url) })) });
const ldScript = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

// ---- HTML pieces ----
function head({ title, desc, url, image, imageAlt, ld, robots }) {
  const t = esc(title), d = esc(desc), img = image || `${SITE}/images/social/799-paddock-v1.jpg`;
  const alt = esc(imageAlt || 'PADDOCK TESTED. — Tools, equipment, and lessons from race weekends.');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">${robots ? `\n<meta name="robots" content="${robots}">` : ''}
${baseStyle}
<link rel="stylesheet" href="/mobile-nav.css?v=1"><script src="/mobile-nav.js?v=1" defer></script><!-- Site icons and link previews -->
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<meta name="theme-color" content="#050505">
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="Scirocco 799">
<meta property="og:type" content="website">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">${image ? '' : `
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">`}
<meta property="og:image:alt" content="${alt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<meta name="twitter:image:alt" content="${alt}">
<!-- /Site icons and link previews -->
<link rel="stylesheet" href="/footer.css?v=2">
<link rel="stylesheet" href="/paddock-store.css?v=21">
${ld.map(ldScript).join('\n')}
</head>
<body>
${menu}`;
}
const foot = `${cartBlock}
${footer}
</body></html>
`;
function crumbs(items) {
  return `<nav class="crumbs" aria-label="Breadcrumb"><div class="wrap"><ol>${items.map(([name, url], i) =>
    i === items.length - 1 ? `<li><span aria-current="page">${esc(name)}</span></li>` : `<li><a href="${url}">${esc(name)}</a></li>`).join('')}</ol></div></nav>`;
}
function photoTag(p, { big = false, lazy = true } = {}) {
  if (multi(p)) {
    const v = defaultVariant(p);
    return `<img data-variant-img="${p.cart}"${big ? ' id="main-photo"' : ''} src="${v.img.src}" srcset="${v.img.srcset}" sizes="(max-width:800px) 100vw,560px" alt="${esc(v.img.alt)}" width="900" height="900"${lazy ? ' loading="lazy"' : ''}>`;
  }
  const i = p.images[0];
  const src = !big && i.src480 ? i.src480 : i.src;
  return `<img${big ? ' id="main-photo"' : ''} src="${src}"${i.src480 && big ? ` srcset="${i.src480} 480w,${i.src} ${i.w}w" sizes="(max-width:800px) 100vw,560px"` : ''} alt="${esc(i.alt)}" width="${big ? i.w : (i.src480 ? 480 : i.w)}" height="${big ? i.h : (i.src480 ? 480 : i.h)}"${lazy ? ' loading="lazy"' : ''}>`;
}
const idLine = p => { const v = defaultVariant(p); return v.sku ? `<div class="idline"${multi(p) ? ` data-variant-ids="${p.cart}"` : ''}>SKU ${esc(v.sku)}${v.upc ? ` · UPC ${esc(v.upc)}` : ''}</div>` : '<div class="idline">SKU and UPC to come</div>'; };
const pickers = p => p.options.map((o, i) => `<fieldset class="opt pick"><legend>${esc(o.name)} <span data-pick-name="${p.cart}" data-opt="${i}">${esc(defaultVariant(p).opts[i])}</span></legend><div class="pick-row">${o.values.map(val =>
  `<button type="button" class="pick-btn" data-pick="${p.cart}" data-opt="${i}" data-val="${esc(val)}" aria-pressed="${defaultVariant(p).opts[i] === val}">${esc(val)}</button>`).join('')}</div></fieldset>`).join('');
// "pick": "many": a grid (rows = second option, columns = first) where any mix of options can be picked at once.
// If the picks match a set exactly, the set's price applies. paddock-store.js runs it.
const grid2 = p => {
  const [cols, rows] = p.options, single = p.variants.filter(v => !v.includes), d = defaultVariant(p).sku;
  const cell = (c, r) => { const v = single.find(x => x.opts[0] === c && x.opts[1] === r); return v ? `<button type="button" class="gp-cell" data-cell="${p.cart}" data-sku="${v.sku}" aria-pressed="${v.sku === d}" aria-label="${esc(optionName(v))}"><b>${esc(v.size || c)}</b><small>${money(Number(v.price).toFixed(2))}</small></button>` : '<span class="gp-none"></span>'; };
  const quick = p.quick || []; // shortcut buttons that pick a group of real ratchets ("All fixed"); no SKUs of their own
  return `<fieldset class="opt pick gp" data-grid="${p.cart}"><legend>Build your set <span data-grid-count="${p.cart}"></span></legend>
<div class="gp-table" style="--cols:${cols.values.length}"><span></span>${cols.values.map(c => `<span class="gp-col">${esc(c)}</span>`).join('')}
${rows.values.map(r => `<span class="gp-row">${esc(r)}</span>${cols.values.map(c => cell(c, r)).join('')}`).join('\n')}</div>
${quick.length ? `<div class="gp-quick">${quick.map(q => `<button type="button" data-quick="${p.cart}" data-skus="${q.skus.join(' ')}" data-label="${esc(q.label)}">${esc(q.label)}</button>`).join('')}<button type="button" data-quick="${p.cart}" data-skus="">Clear</button></div>` : ''}
<p class="gp-sum" data-grid-sum="${p.cart}"></p></fieldset>`;
};
const options = p => p.pick === 'many' ? grid2(p) : picker(p) ? pickers(p) : multi(p) ? `<fieldset class="opt"><legend>Color <span data-option-name="${p.cart}">${esc(defaultVariant(p).name)}</span></legend><div class="swatches" data-options="${p.cart}"></div></fieldset>` : '';
const stockLine = p => `<div class="stock" data-stock="${p.cart}"></div>`;
const shipBadge = p => p.freeShipping ? '<div class="freeship">Free shipping to the lower 48</div>' : '';
const fine = p => p.fine ? `<p class="fine note-above">${esc(p.fine)}</p>` : '';
// "Email me when it's back", shown by paddock-store.js only when the chosen item is out of stock.
const notifyForm = p => `<form class="notify" data-notify="${p.cart}" hidden novalidate><label for="notify-${p.cart}">Want one? Get an email when it's back.</label><div class="notify-row"><input id="notify-${p.cart}" type="email" autocomplete="email" placeholder="you@example.com" required><button type="submit">Notify me</button></div><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><p class="notify-msg" role="status"></p><p class="fine">You'll also get occasional 799 News. Unsubscribe any time.</p></form>`;

// A product card in a grid (store front, category pages, "goes with" rows).
function card(p, lazy = true) {
  const url = prodUrl(p), link = multi(p) ? ` data-variant-link="${p.cart}"` : '';
  return `<article class="item" data-id="${p.cart}">
  <div class="item-photo"><a href="${url}"${link} tabindex="-1" aria-hidden="true">${photoTag(p, { lazy })}</a>${usaFlag(p)}</div>
  <div class="item-body">
    <span class="badge">${esc(catBySlug[p.category].name)}</span>
    <h3><a href="${url}"${link}>${esc(p.name)}</a></h3>
    <div class="price" data-price="${p.cart}">${money(p.price)}</div>${shipBadge(p)}
    ${idLine(p)}
    <p class="desc">${esc(p.desc)}</p>
    <ul class="facts">${p.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    ${options(p)}${fine(p)}${stockLine(p)}
    <button class="add" data-add="${p.cart}">Add to cart</button>
  </div>
</article>`;
}
// Products sold elsewhere (merch for now) link out.
function extCard(p) {
  return `<a class="ext" href="${p.external}" target="_blank" rel="noopener"><img src="${p.image}-750.webp" srcset="${p.image}-400.webp 400w, ${p.image}-750.webp 750w" sizes="(max-width:800px) 50vw, 280px" width="750" height="750" loading="lazy" alt="${esc(p.alt)}"><div class="ext-body"><h3>${esc(p.name)}</h3><span class="price">${esc(p.priceLabel)}</span><span class="ext-buy">Buy Now →</span></div></a>`;
}
// Products sold through the 799 cart, as a tile on a category page (same layout as the apparel tiles).
// The tile links to the product page, which has the options and the Add to cart button.
function tile(p) {
  const url = prodUrl(p), v = defaultVariant(p);
  const pic = `<img${multi(p) ? ` data-variant-img="${p.cart}"` : ''} src="${v.img.src}"${v.img.srcset ? ` srcset="${v.img.srcset.replace(/,/g, ', ')}"` : ''} sizes="(max-width:800px) 50vw, 280px" width="900" height="900" loading="lazy" alt="${esc(v.img.alt)}">`;
  const body = isLive(p) ? `<h3>${esc(p.name)}</h3><span class="price"${picker(p) ? '' : ` data-price="${p.cart}"`}>${picker(p) ? 'From ' : ''}${money(p.price)}</span><span class="ext-buy">Buy Now →</span>`
    : `<h3>${esc(p.name)}</h3><span class="price">Coming Soon</span><span class="ext-buy">See details →</span>`;
  if (!p.colors || !isLive(p)) return `<a class="ext" href="${url}">${usaFlag(p) ? `<span class="ext-photo">${pic}${usaFlag(p)}</span>` : pic}<div class="ext-body">${body}</div></a>`;
  // Products with options: swatches sit over the bottom of the photo, so the tile keeps the same size as its
  // neighbours. paddock-store.js fills [data-options], swaps [data-variant-img] and adds ?color= to [data-variant-link].
  return `<div class="ext ext-pick"><div class="ext-photo"><a href="${url}" data-variant-link="${p.cart}" tabindex="-1" aria-hidden="true">${pic}</a>${usaFlag(p)}<div class="ext-colors" data-options="${p.cart}" role="group" aria-label="${esc(p.short || p.name)} color"></div></div><a class="ext-body" href="${url}" data-variant-link="${p.cart}">${body}</a></div>`;
}
function grid(list) {
  const cartList = list.filter(p => p.cart), ext = list.filter(p => p.external);
  let html = '';
  if (cartList.length) html += `<div class="ext-grid">${cartList.map(tile).join('')}</div>`;
  if (ext.length) {
    const groups = [...new Set(ext.map(p => p.group || ''))];
    html += groups.map(g => `${g ? `<div class="group-label">${esc(g)}</div>` : ''}<div class="ext-grid">${ext.filter(p => (p.group || '') === g).map(extCard).join('')}</div>`).join('\n');
  }
  return html;
}

// ---- Write pages ----
const written = [];
function write(rel, html) {
  const f = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
  written.push(rel);
}
// Clear old generated pages so removed products and categories disappear.
const storeDir = path.join(ROOT, 'paddock');
if (fs.existsSync(storeDir)) fs.rmSync(storeDir, { recursive: true });

// A category page can lead with one featured product ("featured": its slug, on the category in catalog.json):
// a big photo-and-copy band across the top, so the page reads as a curated landing page. It isn't repeated in the grid.
function featureBand(p) {
  const url = prodUrl(p), v = defaultVariant(p), words = p.name.split(' '), last = words.pop();
  const opts = picker(p) ? `<dl class="feat-opts">${p.options.map(o => `<div><dt>${esc(o.name)}</dt><dd>${o.values.map(esc).join(' · ')}</dd></div>`).join('')}</dl>` : '';
  return `<section class="featured" aria-label="Featured"><div class="wrap feat-grid">
<a class="feat-photo" href="${url}" tabindex="-1" aria-hidden="true"><img src="${v.img.src}"${v.img.srcset ? ` srcset="${v.img.srcset.replace(/,/g, ', ')}"` : ''} sizes="(max-width:800px) 100vw, 560px" width="900" height="900" alt="${esc(v.img.alt)}">${usaFlag(p)}</a>
<div class="feat-copy"><div class="kicker">Featured${p.madeInUSA ? ' · Made in USA' : ''}</div><h2>${esc(words.join(' '))} <span>${esc(last)}.</span></h2><p>${esc(p.desc)}</p>${opts}
${p.pick === 'many' && isLive(p) ? '' : `<div class="feat-price">${isLive(p) ? `${picker(p) ? 'From ' : ''}${money(p.price)}` : 'Coming Soon'}</div>`}
<a class="feat-btn" href="${url}">${p.pick === 'many' ? 'Build your set' : picker(p) ? 'Pick yours' : 'See details'} →</a></div>
</div></section>`;
}
for (const c of cats) if (c.featured && !products.some(p => p.slug === c.featured && p.category === c.slug && !isRetired(p))) throw new Error(`${c.slug}: featured product ${c.featured} is not in this category`);

const live = cats.filter(c => inCat(c.slug).length);
for (const c of live) {
  const feat = c.featured ? inCat(c.slug).find(p => p.slug === c.featured) : null;
  const list = inCat(c.slug).filter(p => p !== feat), pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  for (let n = 1; n <= pages; n++) {
    const url = catUrl(c) + (n > 1 ? `page/${n}/` : ''), slice = list.slice((n - 1) * PAGE_SIZE, n * PAGE_SIZE);
    // Optional "seoTitle" / "seoDescription" in catalog.json override the search title and description.
    const title = c.seoTitle ? c.seoTitle.replace(' | ', n > 1 ? ` (page ${n}) | ` : ' | ') : `${c.name}${n > 1 ? ` (page ${n})` : ''} | Paddock Store | Scirocco 799`;
    const desc = c.seoDescription || c.intro || c.blurb;
    const trail = [['Paddock Store', '/paddock'], [c.name, catUrl(c)]];
    const itemList = { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: [...(feat && n === 1 ? [feat] : []), ...slice].filter(isLive).map((p, i) => ({ '@type': 'ListItem', position: (n - 1) * PAGE_SIZE + i + 1, url: abs(prodUrl(p)), name: p.name })) };
    const pager = pages > 1 ? `<nav class="pager" aria-label="Pages">${n > 1 ? `<a href="${catUrl(c) + (n > 2 ? `page/${n - 1}/` : '')}" rel="prev">‹ Prev</a>` : ''}${Array.from({ length: pages }, (_, i) => i + 1).map(k => k === n ? `<span aria-current="page">${k}</span>` : `<a href="${catUrl(c) + (k > 1 ? `page/${k}/` : '')}">${k}</a>`).join('')}${n < pages ? `<a href="${catUrl(c)}page/${n + 1}/" rel="next">Next ›</a>` : ''}</nav>` : '';
    write(`paddock/${c.slug}/${n > 1 ? `page/${n}/` : ''}index.html`,
      head({ title, desc, url: SITE + url, ld: [crumbsLd(trail), itemList] }) + `
${crumbs(trail)}
<header class="cat-hero"><div class="wrap"><div class="kicker">799 Paddock Store</div><h1>${esc(c.name)}</h1><p>${esc(c.intro || c.blurb)}</p>${seasonLine}</div></header>
${feat && n === 1 ? featureBand(feat) : ''}
<section class="store-page store${feat && !list.length ? ' feat-only' : ''}" id="store"><div class="wrap">
<p class="store-note" id="store-note" role="status" hidden></p>
${grid(slice)}
${pager}
<p class="store-fine">${c.note || 'All sales final. <a href="/returns">Returns, warranty &amp; shipping</a>'}</p>
</div></section>
` + foot);
  }
}

// ---- Brand pages ----
const brandNames = [...new Set(products.filter(p => p.brand && !isRetired(p)).map(p => p.brand))].sort();
const sameList = (a, b) => a.length === b.length && a.every(p => b.includes(p));
const brands = brandNames.map(name => {
  const list = products.filter(p => p.brand === name && !isRetired(p)), slug = slugify(name);
  const asCat = live.find(c => sameList(inCat(c.slug), list));
  return { name, slug, list, info: brandInfo[name] || {}, url: asCat ? catUrl(asCat) : `/paddock/brands/${slug}/`, own: !asCat };
});
for (const b of brands.filter(b => b.own)) {
  const trail = [['Paddock Store', '/paddock'], [b.name, b.url]];
  const desc = b.info.intro || `Every ${b.name} product in the 799 Paddock Store. Stocked by 799, with free pickup in Downtown Traverse City by appointment or $25 flat-rate shipping.`;
  const itemList = { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: b.list.filter(isLive).map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(prodUrl(p)), name: p.name })) };
  write(`paddock/brands/${b.slug}/index.html`,
    head({ title: `${b.name} | Paddock Store | Scirocco 799`, desc, url: SITE + b.url, ld: [crumbsLd(trail), itemList] }) + `
${crumbs(trail)}
<header class="cat-hero"><div class="wrap"><div class="kicker">799 Paddock Store · Brand</div><h1>${esc(b.name)}</h1><p>${esc(desc)}</p></div></header>
<section class="store-page store" id="store"><div class="wrap">
<p class="store-note" id="store-note" role="status" hidden></p>
${grid(b.list)}
<p class="store-fine">All sales final. <a href="/returns">Returns, warranty &amp; shipping</a></p>
</div></section>
` + foot);
}

// ---- Old addresses ----
// Product pages used to live under their category. Every category a product has been in is listed in
// "pastCategories" (plus its current one), and each old address sends visitors and search engines to the new one.
// A brand that once was a category (and isn't any more) keeps that address too.
const moved = [];
for (const p of cartProducts) for (const c of new Set([p.category, ...(p.pastCategories || [])]))
  moved.push([`/paddock/${c}/${p.slug}`, prodUrl(p)], [`/paddock/${c}/${p.slug}/`, prodUrl(p)]);
for (const b of brands.filter(b => b.own && !live.some(c => c.slug === b.slug)))
  moved.push([`/paddock/${b.slug}`, b.url], [`/paddock/${b.slug}/`, b.url]);
const redirectsFile = path.join(ROOT, '_redirects');
const redirects = fs.readFileSync(redirectsFile, 'utf8');
// A hand-written rule that sends a live category away (like the old /paddock/fuel-fluids rule) would hide its page.
const handRules = redirects.replace(/# store:redirects[\s\S]*?# \/store:redirects/, '').split('\n').map(l => l.trim().split(/\s+/)[0]);
for (const c of live) if (handRules.some(r => r === `/paddock/${c.slug}` || r?.startsWith(`/paddock/${c.slug}/`)))
  throw new Error(`_redirects sends /paddock/${c.slug}/ away, but that category now has products. Remove that rule.`);
const block = `# store:redirects (written by scripts/build-store.mjs; edit store/catalog.json instead)\n${moved.map(([a, b]) => `${a} ${b} 301`).join('\n')}\n# /store:redirects`;
const reBlock = /# store:redirects[\s\S]*?# \/store:redirects/;
// Generated lines go first: Cloudflare uses the first rule that matches, so they win over the wildcard rules below.
fs.writeFileSync(redirectsFile, reBlock.test(redirects) ? redirects.replace(reBlock, () => block) : block + '\n' + redirects);
written.push('_redirects');

for (const p of cartProducts) {
  const c = catBySlug[p.category], url = prodUrl(p);
  const trail = [['Paddock Store', '/paddock'], [c.name, catUrl(c)], [p.short, url]];
  const rows = p.colors ? p.colors.map(x => [x.name, x.sku, x.upc]) : picker(p) ? p.variants.map(v => [optionName(v), v.sku, v.includes ? 'Set: ' + v.includes.join(' + ') : v.upc || 'To come']) : [[p.color || '', p.sku || 'To come', p.upc || 'To come']];
  // Thumbnails in the order each option shows them (own photos first); paddock-store.js shows the picked option's.
  const forOf = i => [i.sku, ...(i.skus || [])].filter(Boolean);
  const dv = picker(p) ? defaultVariant(p) : null, fits = (i, v) => !forOf(i).length || forOf(i).some(k => v.shows.includes(k));
  const pics = picker(p) ? [...p.images.filter(i => i.sku && fits(i, dv)), ...p.images.filter(i => !i.sku && fits(i, dv))] : p.images;
  const ordered = picker(p) ? [...p.images.filter(i => i.sku), ...p.images.filter(i => !i.sku)] : p.images;
  const thumbs = picker(p) ? `<div class="thumbs${p.pick === 'many' ? ' one-row' : ''}" data-thumbs="${p.cart}"${p.pick === 'many' ? ' data-keep="1"' : p.images.length > 1 ? '' : ' hidden'}>${ordered.map((i, k) => `<button type="button" data-thumb="${i.src}" data-alt="${esc(i.alt)}"${forOf(i).length ? ` data-for="${forOf(i).join(' ')}"` : ''} aria-pressed="${i === pics[0]}" aria-label="Photo ${k + 1}"${pics.includes(i) ? '' : ' hidden'}><img src="${i.src480 || i.src}" alt="" width="84" height="84" loading="lazy"></button>`).join('')}</div>`
    : !p.colors && p.images.length > 1 ? `<div class="thumbs">${p.images.map((i, k) => `<button type="button" data-thumb="${i.src}" data-alt="${esc(i.alt)}" aria-pressed="${k === 0}" aria-label="Photo ${k + 1}"><img src="${i.src480 || i.src}" alt="" width="84" height="84" loading="lazy"></button>`).join('')}</div>` : '';
  const related = inCat(p.category).filter(x => x.cart && x !== p && isLive(x));
  const gone = isRetired(p), soon = status(p) === 'coming-soon';
  const instead = gone && p.replacedBy ? products.find(x => x.slug === p.replacedBy && !isRetired(x)) : null;
  const buy = gone
    ? `<div class="retired-note"><strong>No longer available.</strong> ${instead ? `See the <a href="${prodUrl(instead)}">${esc(instead.name)}</a>, or browse` : 'Browse'} <a href="${catUrl(c)}">${esc(c.name)}</a>.</div>`
    : soon && picker(p) ? `${options(p)}<button class="add" type="button" data-add="${p.cart}" disabled>Coming Soon</button>`
    : soon ? `<button class="add" type="button" disabled>Coming Soon</button>`
    : `${options(p)}${fine(p)}${stockLine(p)}
  <button class="add" data-add="${p.cart}">Add to cart</button>
  ${notifyForm(p)}`;
  const image = abs(defaultVariant(p).img.src);
  write(`paddock/products/${p.slug}/index.html`,
    head({ title: p.seoTitle || `${p.name} | Paddock Store | Scirocco 799`, desc: p.seoDescription || `${p.desc} ${money(p.price)} from 799 Motorsport: free pickup in Traverse City, MI or ${p.freeShipping ? 'free shipping' : '$25 flat-rate shipping'}.`,
      url: abs(url), image, imageAlt: p.name, ld: isLive(p) ? [productLd(p), crumbsLd(trail)] : [crumbsLd(trail)], robots: gone ? 'noindex,follow' : '' }) + `
${crumbs(trail)}
<section class="pd store" id="store"><div class="wrap">
<p class="store-note" id="store-note" role="status" hidden></p>
<div class="pd-grid">
<div><div class="pd-photo">${photoTag(p, { big: true, lazy: false })}${p.pick === 'many' ? `<div class="lineup" data-lineup="${p.cart}" hidden></div>` : ''}${usaFlag(p)}</div>${thumbs}</div>
<div class="pd-info item" data-id="${p.cart}">
  <span class="badge">${esc(c.name)}</span>
  <h1>${esc(p.name)}</h1>
  ${isLive(p) ? `<div class="price" data-price="${p.cart}">${money(p.price)}</div>${shipBadge(p)}` : `<div class="price">${gone ? 'No longer available' : 'Coming Soon'}</div>`}
  ${idLine(p)}
  <p class="desc">${esc(p.desc)}</p>
  <ul class="facts">${p.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
  ${buy}
  <p class="policy-link">All sales final. <a href="/returns">Returns, warranty &amp; shipping</a></p>
</div>
</div>
</div></section>
${p.story || p.points ? `<section class="pd-story"><div class="wrap">${p.story ? `<div class="story-head"><div class="kicker">${esc(p.story.kicker || '')}</div><h2>${esc(p.story.title)}</h2><p>${esc(p.story.text)}</p></div>` : ''}${p.points ? `<div class="points">${p.points.map(x => `<div class="point"><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></div>`).join('')}</div>` : ''}</div></section>` : ''}
<section class="pd-about"><div class="wrap pd-about-grid">
<div><h2>About</h2><p>${esc(p.about)}</p></div>
<div><h2>Part numbers</h2><div class="spec-scroll"><table class="spec"><thead><tr><th>${picker(p) ? 'Option' : 'Color'}</th><th>SKU</th><th>UPC</th></tr></thead><tbody>${rows.map(r => `<tr>${r.map((v, i) => `<td>${i === 1 && p.pick === 'many' && !/^To come|^Set/.test(v) ? `<a href="?sku=${encodeURIComponent(v)}" data-pick-sku="${esc(v)}" data-pick-for="${p.cart}">${esc(v)}</a>` : esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${p.idNote ? `<p class="fine">${esc(p.idNote)}</p>` : ''}</div>
</div></section>
${related.length ? `<section class="related store"><div class="wrap"><h2>Goes With</h2><div class="store-grid${related.length % 3 === 0 ? ' cols-3' : ''}">\n${related.map(x => card(x)).join('\n')}\n</div></div></section>` : '<div class="related"></div>'}
` + foot);
}

// ---- paddock.html: the parts between markers ----
function fill(name, html) {
  const re = new RegExp(`(<!-- store:${name} -->)[\\s\\S]*?(<!-- /store:${name} -->)`);
  if (!re.test(home)) throw new Error(`paddock.html is missing <!-- store:${name} --> markers`);
  home = home.replace(re, (_, open, close) => `${open}\n${html}\n${close}`); // a function, so "$2" in a price is never read as a pattern
}
fill('season', seasonLine);
// Only categories with products are shown; empty ones stay hidden until they're stocked.
// "teaser": true shows an empty category on the store front as a Coming Soon tile (after the stocked ones), e.g. to
// keep the category grid even. It gets no page until it has products.
const tiles = [...live, ...cats.filter(c => c.teaser && !inCat(c.slug).length)];
fill('categories', tiles.map((c, i) => {
  const n = inCat(c.slug).length, num = String(i + 1).padStart(2, '0');
  return n ? `<a class="cat" href="${catUrl(c)}"><span class="cat-num">${num}</span><h3>${esc(c.name)}</h3><p>${esc(c.blurb)}</p><span class="cat-count">Shop ${n} ${n === 1 ? 'item' : 'items'} →</span></a>`
    : `<div class="cat soon"><span class="cat-num">${num}</span><h3>${esc(c.name)}</h3><p>${esc(c.blurb)}</p><span class="cat-count">Coming Soon</span></div>`;
}).join('\n'));
// "Shop by brand" appears once there are two or more brands; until then the block stays empty.
fill('brands', brands.length < 2 ? '' : `<section class="categories brands-row"><div class="wrap">
<div class="section-head"><div><div class="kicker">Who Makes It</div><h2>Shop By<br>Brand.</h2></div><p>The makers whose gear earned a place in the 799 trailer.</p></div><div class="cat-grid">
${brands.map((b, i) => `<a class="cat" href="${b.url}"><span class="cat-num">${String(i + 1).padStart(2, '0')}</span><h3>${esc(b.name)}</h3><p>${esc(b.info.blurb || `${b.list.length} ${b.list.length === 1 ? 'product' : 'products'} in the Paddock Store.`)}</p><span class="cat-count">Shop ${esc(b.name)} →</span></a>`).join('\n')}
</div></div></section>`);
// Structured data for the store front: the category pages it links to.
fill('jsonld', ldScript({ '@context': 'https://schema.org', '@type': 'ItemList', name: 'Paddock Store categories',
  itemListElement: live.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(catUrl(c)), name: c.name })) }));
fill('cart', cartBlock);
fs.writeFileSync(path.join(ROOT, 'paddock.html'), home);
written.push('paddock.html');

console.log(`Store built: ${written.length} files\n  ${written.join('\n  ')}`);
