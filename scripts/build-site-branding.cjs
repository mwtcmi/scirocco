// Rebuild icons, 1200x630 sharing cards, and their HTML metadata.
// Requires ImageMagick 7, Playwright, and Chromium; originals are never modified.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://scirocco799.com';
const pages = [
  { file: 'index.html', slug: 'home', route: '/', title: 'Scirocco 799 | 1976 Volkswagen Scirocco Competition', description: 'Vintage Volkswagen. Modern competition. Follow Scirocco 799 through the build, the paddock, and the 2027 race program.', heading: ['SCIROCCO', '799.'], kicker: '1976 VOLKSWAGEN SCIROCCO', caption: 'Vintage Volkswagen. Modern competition.', tag: 'THE 799 RACE PROGRAM', photo: '799-hillclimb-2400.webp', position: '60% 52%' },
  { file: 'racing.html', slug: 'racing', route: '/racing', title: 'Racing | Scirocco 799', description: 'Follow Scirocco 799 through hill climbs, time trial events and track sprints, with selected results and the ongoing competition program.', heading: ['BUILT TO', 'COMPETE.'], kicker: 'THE RACE PROGRAM', caption: 'Hill Climb. Time Trial. Track Sprint.', tag: 'RESULTS · DEVELOPMENT · COMPETITION', photo: '799-course-1600.webp', position: '50% 68%' },
  { file: 'schedule-2027.html', slug: 'schedule-2027', route: '/schedule-2027', title: '2027 Schedule | Scirocco 799', description: 'Explore the nine planned competition weekends in the Scirocco 799 program. Final dates will follow the official 2027 calendars.', heading: ['2027', 'SEASON.'], kicker: 'THE PLANNED COMPETITION CALENDAR', caption: 'Nine planned weekends. One 799 program.', tag: 'MIDWEST · PENNSYLVANIA · APPALACHIA', photo: '799-on-course-1600.webp', position: '50% 65%' },
  { file: 'car.html', slug: 'car', route: '/car', title: 'The Car | Scirocco 799', description: 'Explore the build and specification of Scirocco 799, a 1976 Volkswagen Scirocco Type 53 developed through real competition.', heading: ['THE CAR.', '799.'], kicker: '1976 VOLKSWAGEN SCIROCCO TYPE 53', caption: 'Naturally aspirated. Front-wheel drive. Mechanical.', tag: '2.0L 8V ABA · ~1,600 LB', photo: '799-detail-1600.webp', position: '50% 64%' },
  { file: 'michael-white.html', slug: 'driver', route: '/michael-white', title: 'Michael White | Open Source & Grassroots Motorsports', description: 'Open source executive. Community builder. Grassroots racer. Meet Michael White, the driver behind Scirocco 799.', heading: ['MICHAEL', 'WHITE.'], kicker: 'THE DRIVER BEHIND SCIROCCO 799', caption: 'Open source. Open paddock.', tag: 'COMMUNITY · TECHNOLOGY · MOTORSPORT', photo: 'michael-white-1920.webp', position: '50% 30%' },
  { file: 'paddock.html', slug: 'paddock', route: '/paddock', title: 'The Paddock | Scirocco 799', description: 'Tools, equipment and trackside gear actually used by the Scirocco 799 race program.', heading: ['PADDOCK', 'TESTED.'], kicker: 'THE STUFF WE ACTUALLY USE', caption: 'Tools, equipment, and lessons from race weekends.', tag: 'REAL EQUIPMENT · REAL COMPETITION', photo: '799-photo-stack-960.webp', position: '50% 64%' },
  { file: 'partners.html', slug: 'partners', route: '/partners', title: 'Work With 799 | Scirocco 799', description: 'Partner with Scirocco 799 through racing, technical development, paddock products, commerce, content and hospitality.', heading: ['RACE', 'WITH 799.'], kicker: '2027 PARTNERSHIP OPPORTUNITIES', caption: 'Put your brand on the car and in the paddock.', tag: 'WORK WITH 799', photo: '799-on-course-1600.webp', position: '50% 65%' },
  { file: 'mountain-run/index.html', slug: 'mountain-run', route: '/mountain-run', title: 'Mountain Run | Scirocco 799', description: 'Drive the green Scirocco 799 through nine venue-inspired courses. Chase apex boosts and compete for the shared podiums.', heading: ['MOUNTAIN', 'RUN.'], kicker: 'THE SCIROCCO 799 DRIVING GAME', caption: 'Nine events. One 2027 season. Your run.', tag: 'PLAY AT SCIROCCO799.COM/MOUNTAIN-RUN' },
];
const escape = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const imagePath = page => `images/social/799-${page.slug}-v1.jpg`;

function metadata(page, prefix = '', canonical = true) {
  const image = `${origin}/${imagePath(page)}`, url = origin + page.route;
  return `<!-- Site icons and link previews -->
<link rel="icon" href="${prefix}favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="${prefix}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${prefix}apple-touch-icon.png" sizes="180x180">
<meta name="theme-color" content="#050505">
${canonical ? `<link rel="canonical" href="${url}">\n` : ''}<meta property="og:site_name" content="Scirocco 799">
<meta property="og:type" content="website">
<meta property="og:title" content="${escape(page.title)}">
<meta property="og:description" content="${escape(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escape(page.heading.join(' ') + ' — ' + page.caption)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(page.title)}">
<meta name="twitter:description" content="${escape(page.description)}">
<meta name="twitter:image" content="${image}">
<meta name="twitter:image:alt" content="${escape(page.heading.join(' ') + ' — ' + page.caption)}">
<!-- /Site icons and link previews -->`;
}

async function updateMetadata(file, page, prefix = '', canonical = true) {
  let html = await fs.readFile(path.join(root, file), 'utf8');
  html = html.replace(/<!-- Site icons and link previews -->[\s\S]*?<!-- \/Site icons and link previews -->\s*/g, '');
  html = html.replace(/[ \t]*<meta\b(?=[^>]*(?:property=["']og:|name=["']twitter:|name=["']theme-color["']))[^>]*>/gi, '');
  html = html.replace(/[ \t]*<link\b(?=[^>]*rel=["'](?:canonical|icon|apple-touch-icon)["'])[^>]*>/gi, '');
  html = html.replace('</head>', metadata(page, prefix, canonical) + '\n</head>');
  await fs.writeFile(path.join(root, file), html);
}

function card(page, source) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#050505;color:#fff;font-family:Arial,Helvetica,sans-serif}
.photo{position:absolute;right:0;top:0;width:820px;height:630px;object-fit:cover;object-position:${page.position || '50% 50%'}}
.veil{position:absolute;inset:0;background:linear-gradient(90deg,#050505 0%,#050505fa 30%,#050505c9 47%,#05050524 76%,#0505050a),linear-gradient(0deg,#050505 0%,transparent 33%)}
header{position:absolute;top:48px;left:64px;font-size:25px;font-weight:900;letter-spacing:3px}header span{color:#20c933}
main{position:absolute;left:64px;top:160px;width:680px}.kicker{margin:0 0 20px;color:#20c933;font-size:13px;font-weight:900;letter-spacing:2.5px}
h1{margin:0;font-size:104px;line-height:.88;font-weight:900;letter-spacing:-6px}h1 span{color:#20c933}
.caption{max-width:500px;margin:26px 0 0;color:#e0e0dc;font-size:24px;line-height:1.35}
footer{position:absolute;left:64px;right:64px;bottom:38px;padding-top:18px;border-top:1px solid #ffffff4d;display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:900;letter-spacing:1.5px}footer span:last-child{color:#20c933;font-size:10px;letter-spacing:1px}
</style></head><body><img class="photo" src="${source}"><div class="veil"></div><header>799 <span>MOTORSPORT</span></header><main><p class="kicker">${escape(page.kicker)}</p><h1>${escape(page.heading[0])}<br><span>${escape(page.heading[1])}</span></h1><p class="caption">${escape(page.caption)}</p></main><footer><span>SCIROCCO799.COM</span><span>${escape(page.tag)}</span></footer></body></html>`;
}

async function build() {
  const social = path.join(root, 'images/social');
  await fs.mkdir(social, { recursive: true });
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.jpg': 'image/jpeg' };
  const server = http.createServer(async (req, res) => {
    try {
      let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (name.endsWith('/')) name += 'index.html';
      const file = path.resolve(root, '.' + name);
      if (!file.startsWith(root + path.sep) || name.split('/').some(segment => segment.startsWith('.'))) throw new Error('Not public');
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });res.end(body);
    } catch { res.writeHead(404);res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu'] });
    const icon = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
    const svg = await fs.readFile(path.join(root, 'favicon.svg'));
    await icon.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:180px;height:180px}</style><img src="data:image/svg+xml;base64,${svg.toString('base64')}">`);
    await icon.locator('img').evaluate(image => image.decode());
    await icon.screenshot({ path: path.join(root, 'apple-touch-icon.png'), omitBackground: true });
    await icon.close();
    execFileSync('magick', [path.join(root, 'apple-touch-icon.png'), '-define', 'icon:auto-resize=48,32,16', path.join(root, 'favicon.ico')]);
    const base = `http://127.0.0.1:${server.address().port}`;
    const game = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await game.addInitScript(() => { requestAnimationFrame = () => 1; });
    await game.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await game.route(base + '/mountain-run/', async route => {
      const response = await route.fetch();
      const hook = `window.shareScene=()=>{state='menu';selectEvent(7);dist=14400;lane=0;speed=0;t=0;state='play';$('game').classList.remove('menu');$('modal').classList.add('off');render()};`;
      await route.fulfill({ response, body: (await response.text()).replace('window.MountainRun={', hook + 'window.MountainRun={') });
    });
    await game.goto(base + '/mountain-run/', { waitUntil: 'networkidle' });
    await game.waitForFunction(() => !document.documentElement.hasAttribute('data-loading'));
    await game.evaluate(() => shareScene());
    const gamePhoto = await game.locator('#scene').screenshot({ type: 'png' });
    await game.close();
    for (const item of pages) {
      const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
      const photo = item.photo ? await fs.readFile(path.join(root, 'images/optimized', item.photo)) : gamePhoto;
      const source = `data:image/${item.photo ? 'webp' : 'png'};base64,${photo.toString('base64')}`;
      await page.setContent(card(item, source));
      await page.locator('.photo').evaluate(image => image.decode());
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: path.join(root, imagePath(item)), type: 'jpeg', quality: 88 });
      await page.close();
      await updateMetadata(item.file, item, item.file.includes('/') ? '../' : '');
      console.log(imagePath(item));
    }
    const mountain = pages.find(page => page.slug === 'mountain-run');
    for (const alias of ['mountain-run.html', 'the-run.html']) await updateMetadata(alias, mountain);
    await updateMetadata('404.html', pages[0], '/', false);
  } finally {
    await browser?.close();server.closeAllConnections();await new Promise(resolve => server.close(resolve));
  }
}

if (require.main === module) build().catch(error => { console.error(error);process.exitCode = 1; });
module.exports = { pages, metadata };
