// Branded 799 Motorsport emails (Resend), shared by the store Worker and Pitwall.
// Sent from paddock@799motorsport.com; replies go to Mike.
export const SITE = 'https://799motorsport.com';
export const FROM = '799 Motorsport Paddock <paddock@799motorsport.com>';
export const REPLY_TO = 'mike@scirocco799.com';

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = c => '$' + (Number(c || 0) / 100).toFixed(2);

// The frame every email shares: black 799 Motorsport header, white body, black footer.
export function frame({ preheader = '', kicker = 'Paddock Store', body }) {
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>' +
    '<body style="margin:0;background:#f2f2f2;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(preheader) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:24px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden">' +
    '<tr><td style="background:#050505;padding:22px 28px"><span style="color:#fff;font-size:22px;font-weight:900;letter-spacing:.06em">799 <span style="color:#20C933">MOTORSPORT</span></span>' +
    '<div style="color:#20C933;font-size:11px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;margin-top:6px">' + esc(kicker) + '</div></td></tr>' +
    '<tr><td style="padding:28px">' + body + '</td></tr>' +
    '<tr><td style="background:#050505;padding:16px 28px;color:#aaa;font-size:12px">799 Motorsport &middot; Traverse City, MI &middot; ' +
    '<a href="' + SITE + '/paddock" style="color:#20C933;text-decoration:none">799motorsport.com</a></td></tr>' +
    '</table></td></tr></table></body></html>';
}

export function button(href, label) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px"><tr><td style="background:#20C933;border-radius:4px">' +
    '<a href="' + esc(href) + '" style="display:inline-block;padding:15px 26px;color:#050505;font-size:13px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;text-decoration:none">' +
    esc(label) + '</a></td></tr></table>';
}

// "It's back": one email per request, with the photo, price and a button to the product (with its option picked).
// Pass "title" and "link" (from skuInfo in feed.mjs); name/variant/url are the older way, kept for colors.
export function backInStockEmail({ name, variant = '', title = '', link: to = '', cents, image = '', url, imageAlt = '' }) {
  const full = title || name + (variant ? ', ' + variant : '');
  const link = to || url + (variant ? (url.includes('?') ? '&' : '?') + 'color=' + encodeURIComponent(variant) : '');
  const body =
    '<h1 style="margin:0 0 6px;font-size:24px;line-height:1.15;color:#050505">It\'s back in stock.</h1>' +
    '<p style="margin:0 0 20px;color:#555;font-size:15px;line-height:1.5">You asked us to let you know. ' + esc(full) + ' is back in the 799 Paddock Store.</p>' +
    (image ? '<a href="' + esc(link) + '"><img src="' + esc(image) + '" width="504" alt="' + esc(imageAlt || full) + '" style="display:block;width:100%;max-width:504px;height:auto;border:0;border-radius:6px;background:#2a2a2a"></a>' : '') +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr>' +
    '<td style="font-size:16px;font-weight:700;color:#050505">' + esc(full) + '</td>' +
    '<td align="right" style="font-size:18px;font-weight:900;color:#050505">' + money(cents) + '</td></tr></table>' +
    button(link, 'Get it now') +
    '<p style="margin:18px 0 0;color:#777;font-size:13px;line-height:1.6">Stock is limited, and this email doesn\'t hold one for you. Free pickup in Downtown Traverse City or $25 flat-rate shipping.</p>' +
    '<p style="margin:14px 0 0;color:#999;font-size:12px;line-height:1.6">This is the only email you\'ll get about this request. Questions? Just reply.</p>';
  const text = ['It\'s back in stock.', '', 'You asked us to let you know. ' + full + ' is back in the 799 Paddock Store (' + money(cents) + ').', '', 'Get it now: ' + link, '',
    'Stock is limited, and this email doesn\'t hold one for you.', 'This is the only email you\'ll get about this request. Questions? Just reply.'].join('\n');
  return { subject: 'It\'s back: ' + full, html: frame({ preheader: full + ' is back in stock.', body }), text };
}

// Short stories tucked into the "You're on the list" email, each with a link back to the site. Add more here;
// each person gets one picked from their email address, so the same person sees the same story.
export const STORIES = Object.freeze([
  { kicker: '799 Zine · No. 01', title: 'Named after a wind.',
    text: 'In 1974 Volkswagen needed a coupe. Giugiaro drew one on the Golf\'s bones, Karmann built it in Osnabrück, and it beat the Golf to market by a few months. They named it Scirocco, after the hot Mediterranean wind. Two years later VW took it racing. 799 is a 1976 car from that first racing year, and fifty years on it\'s still climbing hills.',
    image: SITE + '/images/optimized/empire-799-email-900.jpg', imageAlt: 'Scirocco 799, a green 1976 Volkswagen Scirocco, at speed on a hill climb', credit: 'Photo: Nate Bronkema',
    link: SITE + '/scirocco-history', linkText: 'Read the Scirocco story' }
]);
export function pickStory(seed = '') { let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return STORIES[h % STORIES.length]; }

// "You're on the list": sent once when someone asks to hear about a restock, with a short story and a link to the site.
// Styled like a 90s skate mag / zine: blocky caps, typewriter text, a black page with a green tape label, square corners.
const BLOCK = "font-family:Impact,'Arial Black','Helvetica Neue',Arial,sans-serif;font-weight:900;text-transform:uppercase";
const TYPE = "font-family:'Courier New',Courier,monospace";
export function restockConfirmEmail({ title, image = '', imageAlt = '', link, story = STORIES[0] }) {
  const body =
    '<h1 style="margin:0;font-size:38px;line-height:.95;letter-spacing:-.01em;color:#050505;' + BLOCK + '">You\'re on<br>the list.</h1>' +
    '<p style="margin:12px 0 20px;color:#333;font-size:14px;line-height:1.5;' + TYPE + '">We\'ll email you once when it\'s back. That\'s it.</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:3px solid #050505"><tr>' +
    (image ? '<td width="96" style="padding:10px;border-right:3px solid #050505"><a href="' + esc(link) + '"><img src="' + esc(image) + '" width="76" alt="' + esc(imageAlt || title) + '" style="display:block;width:76px;height:auto;border:0"></a></td>' : '') +
    '<td style="padding:10px 14px;font-size:16px;line-height:1.15;color:#050505;' + BLOCK + '"><a href="' + esc(link) + '" style="color:#050505;text-decoration:none">' + esc(title) + '</a></td></tr></table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:30px;background:#050505"><tr><td style="padding:26px 24px 28px">' +
    '<span style="display:inline-block;background:#20C933;color:#050505;padding:5px 10px;font-size:12px;letter-spacing:.16em;' + BLOCK + '">' + esc(story.kicker) + '</span>' +
    '<h2 style="margin:14px 0 18px;font-size:44px;line-height:.9;letter-spacing:-.01em;color:#fff;' + BLOCK + '">' + esc(story.title) + '</h2>' +
    (story.image ? '<a href="' + esc(story.link) + '"><img src="' + esc(story.image) + '" width="444" alt="' + esc(story.imageAlt) + '" style="display:block;width:100%;max-width:444px;height:auto;border:6px solid #fff"></a>' : '') +
    (story.credit ? '<div style="margin:6px 0 0;color:#888;font-size:11px;letter-spacing:.08em;text-transform:uppercase;' + TYPE + '">' + esc(story.credit) + '</div>' : '') +
    '<p style="margin:18px 0 0;color:#ddd;font-size:14px;line-height:1.65;' + TYPE + '">' + esc(story.text) + '</p>' +
    '<p style="margin:20px 0 0"><a href="' + esc(story.link) + '" style="color:#20C933;font-size:15px;letter-spacing:.06em;text-decoration:none;border-bottom:3px solid #20C933;' + BLOCK + '">' + esc(story.linkText) + ' &rarr;</a></p>' +
    '</td></tr></table>' +
    '<p style="margin:22px 0 0;color:#888;font-size:12px;line-height:1.6;' + TYPE + '">You asked at 799motorsport.com. You\'ll also get occasional 799 News, and every one has an unsubscribe link. Didn\'t ask? Just reply and we\'ll take you off.</p>';
  const text = ["You're on the list.", '', "We'll email you once when it's back: " + title, link, '', story.kicker.toUpperCase(), story.title, '', story.text, '',
    story.linkText + ': ' + story.link, '', "You asked at 799motorsport.com. You'll also get occasional 799 News, and every one has an unsubscribe link. Didn't ask? Just reply and we'll take you off."].join('\n');
  return { subject: "You're on the list: " + title, html: frame({ preheader: "We'll email you once when it's back.", body }), text };
}

// Double opt-in for site sign-ups: one button, nothing else.
export function newsConfirmEmail({ firstName = '', link }) {
  const hi = firstName ? 'Hi ' + firstName + ',' : 'Hi,';
  const body =
    '<h1 style="margin:0 0 6px;font-size:24px;line-height:1.15;color:#050505">Confirm you want 799 News.</h1>' +
    '<p style="margin:0 0 6px;color:#555;font-size:15px;line-height:1.6">' + esc(hi) + ' someone (hopefully you) asked for 799 News at 799motorsport.com: race results, new Paddock Store gear and where to find 799 next. A few emails a season.</p>' +
    button(link, 'Yes, sign me up') +
    '<p style="margin:16px 0 0;color:#999;font-size:12px;line-height:1.6">Didn\'t ask for this? Ignore this email and you won\'t hear from us. Unsubscribe any time from any 799 News email.</p>';
  const text = [hi, '', 'Someone (hopefully you) asked for 799 News at 799motorsport.com: race results, new Paddock Store gear and where to find 799 next.', '',
    'Confirm here: ' + link, '', "Didn't ask for this? Ignore this email and you won't hear from us."].join('\n');
  return { subject: 'Confirm you want 799 News', html: frame({ preheader: 'One click to confirm.', kicker: '799 News', body }), text };
}

// ---- Shipping ----
// Carriers Pitwall offers, with their public tracking pages. "Other" has no link.
export const CARRIERS = Object.freeze({
  usps: { name: 'USPS', url: n => 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + encodeURIComponent(n) },
  ups: { name: 'UPS', url: n => 'https://www.ups.com/track?tracknum=' + encodeURIComponent(n) },
  fedex: { name: 'FedEx', url: n => 'https://www.fedex.com/fedextrack/?trknbr=' + encodeURIComponent(n) },
  dhl: { name: 'DHL', url: n => 'https://www.dhl.com/us-en/home/tracking.html?tracking-id=' + encodeURIComponent(n) }
});
export function carrierName(code) { return CARRIERS[code]?.name || String(code || '').replace(/^other:/, '') || 'the carrier'; }
export function trackingUrl(code, number) { return CARRIERS[code] ? CARRIERS[code].url(number) : null; }

// "It's on the way": one email per shipment, with its items and tracking. A partial shipment lists what's still coming.
//   items / remaining: [{ name, variant, qty }]; tracking: [{ number, url }]
export function shippedEmail({ firstName = '', number, carrier, tracking = [], items = [], remaining = [], shipTo = null }) {
  const hi = firstName ? 'Hi ' + firstName + ',' : 'Hi,';
  const partial = remaining.length > 0;
  const row = i => '<tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-size:15px;color:#050505">' + esc(i.qty + ' × ' + i.name + (i.variant ? ', ' + i.variant : '')) + '</td></tr>';
  const a = shipTo?.address;
  const addr = a ? [shipTo.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + ' ' + (a.postal_code || '')].filter(Boolean).map(esc).join('<br>') : '';
  const many = tracking.length > 1;
  const track = tracking.map((t, k) => t.url ? button(t.url, many ? 'Track box ' + (k + 1) + ' of ' + tracking.length : 'Track your package')
    : '<p style="margin:14px 0 0;font-size:15px;color:#050505">' + (many ? 'Box ' + (k + 1) + ': ' : 'Tracking number: ') + '<strong>' + esc(t.number) + '</strong></p>').join('');
  const body =
    '<h1 style="margin:0 0 6px;font-size:24px;line-height:1.15;color:#050505">' + (partial ? 'Part of your order is on the way.' : 'Your order is on the way.') + '</h1>' +
    '<p style="margin:0 0 18px;color:#555;font-size:15px;line-height:1.6">' + esc(hi) + ' order ' + esc(number) + ' just shipped with ' + esc(carrier) + '.' +
      (partial ? ' The rest ships separately, and we\'ll email you when it does.' : '') + '</p>' +
    '<div style="color:#777;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase">In this shipment</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + items.map(row).join('') + '</table>' +
    track +
    (tracking.length && tracking.every(t => t.url) ? '<p style="margin:10px 0 0;color:#999;font-size:12px">Tracking can take a day to show the first scan.</p>' : '') +
    (partial ? '<div style="margin-top:22px;color:#777;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase">Still to ship</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + remaining.map(row).join('') + '</table>' : '') +
    (addr ? '<div style="margin-top:22px;color:#777;font-size:11px;font-weight:900;letter-spacing:.16em;text-transform:uppercase">Shipping to</div><p style="margin:6px 0 0;color:#050505;font-size:14px;line-height:1.6">' + addr + '</p>' : '') +
    '<p style="margin:22px 0 0;color:#999;font-size:12px;line-height:1.6">Questions or something wrong with your order? Just reply. <a href="' + SITE + '/returns" style="color:#777">Returns, warranty &amp; shipping</a></p>';
  const list = l => l.map(i => '  ' + i.qty + ' × ' + i.name + (i.variant ? ', ' + i.variant : '')).join('\n');
  const text = [hi, '', 'Order ' + number + ' just shipped with ' + carrier + '.' + (partial ? ' The rest ships separately, and we\'ll email you when it does.' : ''), '',
    'In this shipment:', list(items), '', ...tracking.map((t, k) => (many ? 'Box ' + (k + 1) + ': ' : 'Tracking: ') + t.number + (t.url ? ' ' + t.url : '')),
    ...(partial ? ['', 'Still to ship:', list(remaining)] : []), '', 'Questions? Just reply.'].join('\n');
  return { subject: (partial ? 'Part of your 799 order ' : 'Your 799 order ') + number + ' has shipped', html: frame({ preheader: (partial ? 'Part of order ' : 'Order ') + number + ' is on the way.', body }), text };
}
