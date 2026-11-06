// Branded 799 Motorsport emails (Resend), shared by the store Worker and Pitwall.
// Sent from paddock@799motorsport.com; replies go to Mike.
export const SITE = 'https://799motorsport.com';
export const FROM = '799 Motorsport Paddock <paddock@799motorsport.com>';
export const REPLY_TO = 'mike@scirocco799.com';

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = c => '$' + (Number(c || 0) / 100).toFixed(2);

// The frame every email shares: black 799 Motorsport header, white body, black footer.
export function frame({ preheader = '', kicker = 'Paddock Store', body }) {
  return '<!doctype html><html><head><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>' +
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
export function backInStockEmail({ name, variant = '', cents, image = '', url, imageAlt = '' }) {
  const full = name + (variant ? ', ' + variant : '');
  const link = url + (variant ? (url.includes('?') ? '&' : '?') + 'color=' + encodeURIComponent(variant) : '');
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
