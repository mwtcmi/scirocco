#!/usr/bin/env node
// Wrap-up check for scirocco799.com.
// Rebuilds sitemap.xml (and robots.txt's Sitemap line), then checks every page for issues.
// Usage: node scripts/wrap-up.mjs            rebuild sitemap + check
//        node scripts/wrap-up.mjs --check    check only, fail if sitemap.xml is out of date
// Exit code 1 when any ERROR is found. Uses only Node built-ins.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://scirocco799.com';
const CHECK_ONLY = process.argv.includes('--check');
const SKIP_DIRS = new Set(['.git', 'node_modules', 'tests', 'scripts', 'leaderboard', '.github', '.claude']);
const BIG_ASSET = 600 * 1024;        // referenced images/media above this get a warning
const BIG_UNUSED = 1024 * 1024;      // unreferenced files above this get a warning

const errors = [], warnings = [], notes = [];
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.well-known') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, out); }
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const htmlFiles = files.filter(f => f.endsWith('.html')).sort();
const cssFiles = files.filter(f => f.endsWith('.css'));

const attr = (html, re) => (html.match(re) || [])[1] || '';
const meta = (html, key, val) => attr(html, new RegExp(`<meta[^>]+${key}=["']${val}["'][^>]*content=["']([^"']*)["']`, 'i'))
  || attr(html, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${key}=["']${val}["']`, 'i'));

function gitDate(file) {
  try { return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

// Turn a local reference into the file it points at, the way GitHub Pages resolves it.
function resolveRef(ref, fromFile) {
  let clean = ref.split('#')[0].split('?')[0];
  if (!clean) return null;
  try { clean = decodeURIComponent(clean); } catch {}
  const base = clean.startsWith('/') ? path.join(ROOT, clean) : path.join(path.dirname(fromFile), clean);
  const candidates = clean.endsWith('/') ? [path.join(base, 'index.html')]
    : [base, base + '.html', path.join(base, 'index.html')];
  return { target: candidates.find(c => fs.existsSync(c) && fs.statSync(c).isFile()) || null, clean };
}

const isLocal = ref => ref && !/^(https?:|\/\/|mailto:|tel:|sms:|data:|blob:|javascript:|#|about:)/i.test(ref)
  && !/[{}'"+`$<>]/.test(ref);

const referenced = new Set();      // files used by any page or stylesheet
const inbound = new Map();         // page -> pages linking to it
const pages = [];

function collectRefs(text, fromFile, isCss) {
  const refs = [];
  if (isCss) {
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) refs.push({ ref: m[1], kind: 'asset' });
    return refs;
  }
  const noScripts = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, m => (m.match(/<script[^>]*>/i) || [''])[0]);
  for (const m of noScripts.matchAll(/<(a|link|img|source|video|audio|script|iframe)\b[^>]*>/gi)) {
    const tag = m[0], name = m[1].toLowerCase();
    for (const a of tag.matchAll(/\s(href|src|poster)=["']([^"']*)["']/gi)) refs.push({ ref: a[2], kind: name === 'a' ? 'link' : 'asset' });
    const ss = tag.match(/\ssrcset=["']([^"']*)["']/i);
    if (ss) for (const part of ss[1].split(',')) { const u = part.trim().split(/\s+/)[0]; if (u) refs.push({ ref: u, kind: 'asset' }); }
  }
  for (const m of noScripts.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) refs.push({ ref: m[1], kind: 'asset' });
  // Gallery data (JSON inside a script tag) lists photo files too.
  for (const m of text.matchAll(/"(?:href|thumb|src)"\s*:\s*"(\/[^"]+)"/g)) refs.push({ ref: m[1], kind: 'asset' });
  return refs;
}

for (const file of cssFiles) {
  for (const { ref } of collectRefs(fs.readFileSync(file, 'utf8'), file, true)) {
    if (!isLocal(ref)) continue;
    const r = resolveRef(ref, file);
    if (r && r.target) referenced.add(r.target);
    else if (r) errors.push(`${rel(file)}: missing file "${ref}"`);
  }
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const page = rel(file);
  const robots = meta(html, 'name', 'robots').toLowerCase();
  const isRedirect = /http-equiv=["']refresh["']|location\.replace\(/i.test(html);
  const noindex = robots.includes('noindex');
  const is404 = page === '404.html';
  const indexable = !noindex && !is404 && !isRedirect;
  const title = attr(html, /<title>([^<]*)<\/title>/i).trim();
  const desc = meta(html, 'name', 'description');
  const canonical = attr(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  const ogImage = meta(html, 'property', 'og:image');
  const h1s = (html.match(/<h1\b/gi) || []).length;

  const derived = SITE + '/' + page.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
  pages.push({ file, page, indexable, noindex, isRedirect, is404, canonical, url: canonical || derived });

  if (!/<html[^>]+lang=/i.test(html)) warnings.push(`${page}: <html> has no lang attribute`);
  if (!/name=["']viewport["']/i.test(html)) errors.push(`${page}: no viewport meta tag (breaks phone layout)`);
  if (!title) errors.push(`${page}: no <title>`);
  if (indexable) {
    if (!desc) errors.push(`${page}: no meta description`);
    if (!canonical) warnings.push(`${page}: no canonical link (sitemap uses ${derived})`);
    else if (!canonical.startsWith(SITE)) errors.push(`${page}: canonical points off-site: ${canonical}`);
    if (!ogImage) warnings.push(`${page}: no og:image (no preview picture when shared)`);
    if (h1s !== 1) warnings.push(`${page}: has ${h1s} <h1> headings (expected 1)`);
  }
  if (!/rel=["']icon["']/i.test(html) && !isRedirect) warnings.push(`${page}: no favicon link`);

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\salt=/i.test(m[0])) warnings.push(`${page}: image without alt text: ${(m[0].match(/src=["']([^"']+)/) || [, '?'])[1]}`);
  }
  for (const m of html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)) {
    if (!/rel=["'][^"']*noopener/i.test(m[0])) warnings.push(`${page}: target=_blank link without rel="noopener": ${(m[0].match(/href=["']([^"']+)/) || [, '?'])[1]}`);
  }

  // Desktop and mobile menus should carry the same links.
  const desk = (html.match(/<div class=["']links["']>([\s\S]*?)<\/div>/i) || [])[1];
  const mob = (html.match(/<div class=["']mobile-nav-panel["']>([\s\S]*?)<\/div>/i) || [])[1];
  if (desk && mob) {
    const hrefs = s => [...s.matchAll(/href=["']([^"']+)["']/g)].map(x => x[1].replace(/^(\.\.\/)+|^\//, '')).join(' | ');
    if (hrefs(desk) !== hrefs(mob)) warnings.push(`${page}: desktop and mobile menus differ\n      desktop: ${hrefs(desk)}\n      mobile:  ${hrefs(mob)}`);
  } else if (desk && !mob && indexable) warnings.push(`${page}: has a desktop menu but no mobile menu`);

  for (const { ref, kind } of collectRefs(html, file, false)) {
    if (!isLocal(ref)) continue;
    const r = resolveRef(ref, file);
    if (!r) continue;
    if (!r.target) { errors.push(`${page}: broken ${kind} "${ref}"`); continue; }
    referenced.add(r.target);
    if (kind === 'link' && r.target.endsWith('.html') && r.target !== file) {
      if (!inbound.has(r.target)) inbound.set(r.target, new Set());
      inbound.get(r.target).add(page);
    }
    if (kind === 'asset' && /\.(jpe?g|png|webp|gif|svg|avif|mp4|webm|mov)$/i.test(r.target)) {
      const size = fs.statSync(r.target).size;
      if (size > BIG_ASSET) warnings.push(`${page}: loads a large file ${rel(r.target)} (${(size / 1048576).toFixed(1)} MB)`);
    }
  }
}

// Pages nobody links to.
for (const p of pages) {
  if (p.page === 'index.html' || p.is404 || p.isRedirect) continue;
  if (!inbound.has(p.file)) (p.indexable ? warnings : notes).push(`${p.page}: not linked from any page${p.indexable ? ' (only findable through the sitemap)' : ''}`);
}

// Big files that nothing uses.
for (const f of files) {
  if (f.endsWith('.html') || /\.(md|cjs|mjs|py|sql|txt|xml|json)$/.test(f)) continue;
  const size = fs.statSync(f).size;
  if (size > BIG_UNUSED && !referenced.has(f)) warnings.push(`unused large file ${rel(f)} (${(size / 1048576).toFixed(1)} MB) — not referenced by any page`);
}

// Duplicate canonical URLs among indexable pages.
const seen = new Map();
for (const p of pages.filter(p => p.indexable)) {
  if (seen.has(p.url)) errors.push(`${p.page} and ${seen.get(p.url)} share the canonical URL ${p.url}`);
  seen.set(p.url, p.page);
}

// ---- Sitemap ----
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const entries = pages.filter(p => p.indexable)
  .sort((a, b) => (a.url === SITE + '/' ? -1 : b.url === SITE + '/' ? 1 : a.url.localeCompare(b.url)))
  .map(p => { const d = gitDate(p.page); return `  <url>\n    <loc>${esc(p.url)}</loc>${d ? `\n    <lastmod>${d}</lastmod>` : ''}\n  </url>`; });
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated by scripts/wrap-up.mjs. Do not edit by hand. -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
const sitemapPath = path.join(ROOT, 'sitemap.xml');
const oldSitemap = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, 'utf8') : '';

const robotsPath = path.join(ROOT, 'robots.txt');
const sitemapLine = `Sitemap: ${SITE}/sitemap.xml`;
const oldRobots = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, 'utf8') : '';
const robots = oldRobots
  ? (oldRobots.includes(sitemapLine) ? oldRobots : oldRobots.replace(/^Sitemap:.*\n?/gim, '').replace(/\n*$/, '\n\n') + sitemapLine + '\n')
  : `User-agent: *\nAllow: /\n\n${sitemapLine}\n`;

let sitemapStatus;
if (CHECK_ONLY) {
  sitemapStatus = oldSitemap === sitemap ? 'up to date' : 'OUT OF DATE';
  if (oldSitemap !== sitemap) errors.push('sitemap.xml is out of date — run: node scripts/wrap-up.mjs');
  if (oldRobots !== robots) errors.push('robots.txt is missing the Sitemap line — run: node scripts/wrap-up.mjs');
} else {
  sitemapStatus = oldSitemap === sitemap ? 'unchanged' : (oldSitemap ? 'UPDATED' : 'CREATED');
  if (oldSitemap !== sitemap) fs.writeFileSync(sitemapPath, sitemap);
  if (oldRobots !== robots) { fs.writeFileSync(robotsPath, robots); notes.push(`robots.txt ${oldRobots ? 'updated' : 'created'} with the sitemap address`); }
}

// ---- Report ----
const indexed = pages.filter(p => p.indexable).sort((a, b) => (a.url === SITE + '/' ? -1 : b.url === SITE + '/' ? 1 : a.url.localeCompare(b.url)));
const hidden = pages.filter(p => !p.indexable);
console.log(`\nScirocco 799 wrap-up — ${htmlFiles.length} pages checked\n`);
console.log(`Sitemap ${sitemapStatus}: ${indexed.length} pages`);
for (const p of indexed) console.log(`  + ${p.url}`);
console.log(`Left out of the sitemap (${hidden.length}): ${hidden.map(p => p.page + (p.is404 ? ' [404]' : p.isRedirect ? ' [redirect]' : ' [noindex]')).join(', ')}`);
const section = (label, all) => { const list = [...new Set(all)]; if (!list.length) return; console.log(`\n${label} (${list.length})`); for (const l of list) console.log(`  - ${l}`); };
section('ERRORS', errors);
section('WARNINGS', warnings);
section('NOTES', notes);
console.log(`\n${errors.length ? 'FAILED' : 'PASSED'}: ${new Set(errors).size} errors, ${new Set(warnings).size} warnings\n`);
process.exit(errors.length ? 1 : 0);
