(() => {
  'use strict';
  const game = window.MountainRun, picker = document.getElementById('eventSelect'), intro = document.getElementById('intro');
  if (!game || !picker || !intro) return;
  const $ = id => document.getElementById(id);
  let last = '';
  const noise = n => { const x = Math.sin(n * 127.1 + 37.7) * 43758.545; return x - Math.floor(x); };
  function scene(c, aspect, index, compact) {
    const w = 1000, h = Math.round(w / aspect), wide = aspect > 1.35, cx = compact ? 740 : 500, horizon = h * .41;
    const dunes = c.habitat === 'dunes', farm = c.habitat === 'farm', city = ['pagoda', 'city', 'village'].includes(c.habitat);
    const poly = (points, fill, extra = '') => '<path d="M' + points.map(p => p.join(',')).join('L') + 'Z" fill="' + fill + '" ' + extra + '/>';
    const tree = (x, y, scale, pine) => {
      const trunk = '<path d="M-4 0h8v-80h-8z" fill="#443e2e"/>';
      const foliage = pine
        ? '<path d="M0-205-46-98h21L-62-54h34L-73-7H72L28-54h34L25-98h21z" fill="#193c31"/><path d="M0-205-46-98h21L-62-54h34L-73-7H0z" fill="#315b42"/><path d="M0-180 30-106H0zm0 73 43 50H0zm0 64 54 29H0z" fill="#254b37"/>'
        : '<path d="M0-113-35-68M0-85l32-23" fill="none" stroke="#443e2e" stroke-width="8"/><ellipse cy="-118" rx="55" ry="59" fill="#294d38"/><ellipse cx="-35" cy="-92" rx="42" ry="49" fill="#3e6746"/><ellipse cx="29" cy="-98" rx="38" ry="44" fill="#365d40"/>';
      return '<g transform="translate(' + x + ' ' + y + ') scale(' + scale + ')">' + trunk + foliage + '</g>';
    };
    let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true" data-habitat="' + c.habitat + '"><defs>'
      + '<linearGradient id="gridSky" x2="0" y2="1"><stop stop-color="' + c.sky[0] + '"/><stop offset="1" stop-color="' + c.sky[1] + '"/></linearGradient>'
      + '<linearGradient id="gridGround" x2="0" y2="1"><stop stop-color="' + c.ground[0] + '"/><stop offset="1" stop-color="' + c.ground[1] + '"/></linearGradient>'
      + '<linearGradient id="gridRoad" x2="0" y2="1"><stop stop-color="#51574e"/><stop offset="1" stop-color="#171e1c"/></linearGradient>'
      + '<linearGradient id="gridVignette" x2="0" y2="1"><stop stop-color="#07130d" stop-opacity=".14"/><stop offset=".6" stop-color="#07130d" stop-opacity="0"/><stop offset="1" stop-color="#020b07" stop-opacity=".55"/></linearGradient>'
      + '<pattern id="gridChecks" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M0 0h32v32H0z" fill="#e5e8d9"/><path d="M0 0h16v16H0zm16 16h16v16H16z" fill="#18241f"/></pattern>'
      + '<pattern id="gridGrain" width="9" height="11" patternUnits="userSpaceOnUse"><path d="M1 3h2m4 5h1M4 0h1" stroke="#d5dec1" stroke-opacity=".12"/></pattern></defs>'
      + '<path d="M0 0h1000v' + h + 'H0z" fill="url(#gridSky)"/><circle cx="' + (wide ? 560 : 740) + '" cy="' + h * .19 + '" r="' + Math.min(45, h * .07) + '" fill="#f4eac1" opacity=".65"/>';
    for (let layer = 0; layer < 3; layer++) {
      const base = h * (.29 + layer * .065), points = [[0, h]];
      for (let x = 0; x <= w; x += 20) points.push([x, +(base + Math.sin(x / (dunes ? 220 : 150) + layer * 2 + index) * (farm ? 20 : dunes ? 29 : 49) + Math.sin(x / 65 + layer) * 10).toFixed(1)]);
      points.push([w, h]); s += poly(points, c.ridges[layer]);
      if (dunes && layer === 0) s += '<path d="M0 ' + h * .35 + 'h1000v' + h * .15 + 'H0z" fill="#387e96"/><path d="M0 ' + h * .375 + 'h1000m-900 11h300m150 9h300m-860 8h400" stroke="#a3c8bf" stroke-opacity=".55" fill="none"/>';
    }
    s += '<path d="M0 ' + horizon + 'h1000v' + h + 'H0z" fill="url(#gridGround)"/>';
    if (city) {
      for (let i = 0; i < 19; i++) {
        const x = i * 32 + 45, height = 15 + noise(i + index) * 35, y = horizon - 9;
        s += '<path d="M' + x + ' ' + y + 'v-' + height + 'h23v' + height + 'z" fill="' + (i % 2 ? '#a9ac9b' : '#778e84') + '"/><path d="M' + (x + 5) + ' ' + (y - height + 7) + 'h3v4h-3zm9 0h3v4h-3z" fill="#c5c5a9"/>';
      }
    }
    if (farm) {
      s += '<g transform="translate(120 ' + horizon + ')"><path d="M0 0v-62h100V0z" fill="#953f31"/><path d="M-12-62 50-105 112-62z" fill="#c4c6ae"/><path d="M40 0v-37h26V0z" fill="#3c3f30"/><path d="M108 0v-85q17-20 34 0V0z" fill="#9eaaa2"/><path d="M0-11h100" stroke="#d1bc90" stroke-width="3"/></g>';
      for (let i = 0; i < 10; i++) s += '<path d="M0 ' + (horizon + 15 + i * 8) + 'Q260 ' + (horizon + i * 24) + ' 440 ' + (horizon + 90 + i * 36) + '" fill="none" stroke="#d0ba6b" stroke-opacity=".38" stroke-width="5"/>';
    }
    const edge = (depth, side, extra = 0) => [+(cx + Math.sin(depth * Math.PI) * 24 + side * (22 + Math.pow(depth, 1.4) * (h * .56 + 110) + extra)).toFixed(1), +(horizon + (h - horizon) * depth).toFixed(1)];
    const edges = extra => [...Array.from({ length: 21 }, (_, i) => edge(i / 20, -1, extra)), ...Array.from({ length: 21 }, (_, i) => edge(1 - i / 20, 1, extra))];
    s += poly(edges(17), dunes ? '#cdbb91' : '#8c9680') + poly(edges(0), 'url(#gridRoad)') + poly(edges(0), 'url(#gridGrain)');
    for (const side of [-1, 1]) s += '<path d="M' + Array.from({ length: 21 }, (_, i) => edge(i / 20, side, -9).join(',')).join('L') + '" fill="none" stroke="#d6d8be" stroke-width="' + Math.max(3, h * .005) + '" opacity=".8"/>';
    for (let d = .07; d < .85; d += .13) {
      const a = edge(d, 0), b = edge(d + .06, 0);
      s += '<path d="M' + a.join(',') + 'L' + b.join(',') + '" stroke="#ddd6af" stroke-width="' + (2 + d * 7) + '"/>';
    }
    s += poly([edge(.86, -1, -12), edge(.86, 1, -12), edge(.9, 1, -12), edge(.9, -1, -12)], 'url(#gridChecks)', 'opacity=".8"');
    // Two posts and a modest checkered start banner above the staged car.
    const bannerY = horizon + (h - horizon) * .035, bx = cx - 105;
    s += '<g><path d="M' + bx + ' ' + (bannerY + 100) + 'v-125m210 125v-125" stroke="#b1b8a2" stroke-width="6"/><path d="M' + bx + ' ' + (bannerY - 26) + 'h210v38h-210z" fill="#0a1d14"/><path d="M' + bx + ' ' + (bannerY - 26) + 'h210v8h-210zm0 30h210v8h-210z" fill="url(#gridChecks)"/><text x="' + cx + '" y="' + (bannerY - 1) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" font-weight="900" letter-spacing="8" fill="#d6e0ca">START</text></g>';
    for (let i = 0; i < 15; i++) {
      const depth = i / 15, y = horizon + depth * (h - horizon) * 1.1, size = .2 + depth * (wide ? 1.1 : 2.1);
      for (const side of [-1, 1]) {
        const x = cx + side * (92 + Math.pow(depth, 1.1) * (h * .8 + 100) + noise(i * 7 + side) * 65);
        if (dunes) {
          s += '<g transform="translate(' + x + ' ' + y + ') scale(' + size + ')"><path d="M0 0-20-65M0 0 5-86M0 0 31-52M0 0-37-35" stroke="#758552" stroke-width="4" fill="none"/><path d="M-12 0-8-45M8 0 24-29" stroke="#c6b780" stroke-width="3"/></g>';
        } else if (!farm || i % 3 === 0) s += tree(x, y, size, ['pine', 'flag', 'shamrock'].includes(c.habitat));
      }
    }
    return s + '<path d="M0 0h1000v' + h + 'H0z" fill="url(#gridVignette)"/></svg>';
  }
  function update() {
    const index = Number(picker.value), c = game.events[index], bounds = intro.getBoundingClientRect();
    if (!c?.sky || bounds.width < 1 || bounds.height < 1) return;
    const compact = matchMedia('(max-width:600px),(pointer:coarse),(max-height:500px) and (orientation:landscape)').matches;
    const key = index + ':' + Math.round(bounds.width) + ':' + Math.round(bounds.height) + ':' + compact;
    if (key === last) return;
    last = key; intro.dataset.event = c.id;
    $('previewScene').innerHTML = scene(c, bounds.width / bounds.height, index, compact);
    $('previewVenue').textContent = c.short; $('previewPlace').textContent = c.place;
    $('previewNumber').textContent = 'EVENT ' + String(index + 1).padStart(2, '0') + ' / 09';
  }
  picker.addEventListener('change', update);
  new MutationObserver(update).observe(picker, { childList: true });
  new ResizeObserver(update).observe(intro);
  update();
})();
