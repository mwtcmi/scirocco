// Google Merchant Center product feed (RSS 2.0 with the g: namespace), built from store/catalog.json plus live stock.
// One item per SKU. Options and colors of one product share an item_group_id (the product's slug), each with its own
// link (?sku= / ?color=) that opens the page with that option picked. Spec: https://support.google.com/merchants/answer/7052112
// Shipping and returns are set in Merchant Center itself ($25 flat to the lower 48; all sales final). An item marked
// "freeShipping" in the catalog carries shipping_label "free-shipping" so a Merchant Center rule can price it at $0.

const optionName = v => v.label || v.opts.join(' ') + (v.size ? ', ' + v.size : '');
const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = n => Number(n).toFixed(2) + ' USD';

// "feedDesc" on a product replaces the description for Shopping (one listing is one SKU).
// "feedTitle" on a product: a template for option titles, e.g. "VIM MVRK {Drive} Drive {Head} Head Ratchet, {size}".
function optionTitle(p, v) {
  if (!p.feedTitle) return `${p.name}, ${optionName(v)}`;
  return p.feedTitle.replace(/\{(\w+)\}/g, (m, k) => {
    if (k === 'size') return v.size || '';
    const i = (p.options || []).findIndex(o => o.name === k);
    return i >= 0 ? v.opts[i] : m;
  });
}

export function feedItems(catalog, stock, site) {
  const abs = u => (u.startsWith('http') ? u : site + u);
  const cats = Object.fromEntries((catalog.categories || []).map(c => [c.slug, c.name]));
  const items = [];
  for (const p of catalog.products) {
    if (!p.cart || (p.status || 'live') !== 'live' || p.external) continue;
    const page = `${site}/paddock/products/${p.slug}/`;
    const base = {
      description: (p.feedDesc || [p.desc, ...(p.facts || [])].filter(Boolean).join(' ') || p.about || p.name).slice(0, 5000),
      brand: p.brand, condition: 'new', product_type: ['Paddock Store', cats[p.category]].filter(Boolean).join(' > '),
      ...(p.freeShipping ? { shipping_label: 'free-shipping' } : {})
    };
    const imgs = p.images || [];
    if (p.variants) {
      for (const v of p.variants) {
        if ((v.status || 'live') !== 'live' || v.includes) continue; // only real, live SKUs
        const own = imgs.filter(i => i.sku === v.sku), shared = imgs.filter(i => i.skus && i.skus.includes(v.sku));
        const all = [...own, ...shared], pics = [...all.filter(i => !/-dim-/.test(i.src)), ...all.filter(i => /-dim-/.test(i.src))].map(i => abs(i.src)); // main image: a plain photo; the measured shot (text on it) goes after
        items.push({ ...base, id: v.sku, item_group_id: p.slug, title: optionTitle(p, v), link: `${page}?sku=${encodeURIComponent(v.sku)}`,
          image_link: pics[0], image_alt: (all.find(i => abs(i.src) === pics[0]) || {}).alt, additional_image_link: pics.slice(1, 11), price: money(v.price), cents: Math.round(v.price * 100), sku: v.sku, gtin: v.upc, ...(v.size ? { size: optionName(v) } : {}) });
      }
    } else if (p.colors) {
      for (const c of p.colors) {
        const img = p.variantImage ? abs(p.variantImage.replace('{img}', c.img) + '-900.webp') : imgs[0] && abs(imgs[0].src);
        items.push({ ...base, id: c.sku, item_group_id: p.slug, title: `${p.name}, ${c.name}`, link: `${page}?color=${encodeURIComponent(c.name)}`,
          image_link: img, image_alt: (p.variantAlt || '{name}, {variant}').replace('{name}', p.name).replace('{variant}', c.name), additional_image_link: [], price: money(p.price), cents: Math.round(p.price * 100), sku: c.sku, gtin: c.upc, color: c.name });
      }
    } else {
      if (!p.sku) continue;
      const pics = imgs.map(i => abs(i.src));
      items.push({ ...base, id: p.sku, title: p.name, link: page, image_link: pics[0], image_alt: imgs[0]?.alt, additional_image_link: pics.slice(1, 11),
        price: money(p.price), cents: Math.round(p.price * 100), sku: p.sku, gtin: p.upc, ...(p.color ? { color: p.color } : {}) });
    }
  }
  return items.filter(i => i.image_link).map(i => ({ ...i, availability: (stock[i.sku] ?? 0) > 0 ? 'in_stock' : 'out_of_stock' }));
}

// One SKU's title, link (with its option picked), main photo and price: the same as its Shopping listing.
// Used by the store emails so a customer sees one name for one thing everywhere.
export function skuInfo(catalog, sku, site) { return feedItems(catalog, {}, site).find(i => i.id === sku) || null; }

export function feedXml(catalog, stock, site) {
  const tag = (k, v) => (v === undefined || v === null || v === '' ? '' : `<g:${k}>${xml(v)}</g:${k}>`);
  const items = feedItems(catalog, stock, site).map(i => `<item>${[
    tag('id', i.id), tag('item_group_id', i.item_group_id), `<title>${xml(i.title)}</title>`, `<description>${xml(i.description)}</description>`,
    `<link>${xml(i.link)}</link>`, tag('image_link', i.image_link), ...i.additional_image_link.map(u => tag('additional_image_link', u)),
    tag('availability', i.availability), tag('price', i.price), tag('brand', i.brand), tag('gtin', i.gtin), tag('mpn', i.sku),
    tag('condition', i.condition), tag('product_type', i.product_type), tag('color', i.color), tag('size', i.size), tag('shipping_label', i.shipping_label)
  ].join('')}</item>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>` +
    `<title>${xml(catalog.seller || '799 Paddock Store')}</title><link>${xml(site)}/paddock</link><description>799 Paddock Store</description>\n` +
    items.join('\n') + '\n</channel></rss>\n';
}
