// Adds VIM Tools parts to a product in store/catalog.json, filled in from store/vim-catalog.json
// (VIM's price file: description, list, MAP, UPC). Price follows the house rule: list rounded up to .99.
//
//   node scripts/add-vim.mjs find <words>                         search the VIM catalog
//   node scripts/add-vim.mjs show <SKU>...                        print the catalog lines it would write
//   node scripts/add-vim.mjs add <product-slug> <section> [--row <row>] [--chip <chip>] <SKU>...
//
// Example: node scripts/add-vim.mjs add 799-paddock-kit Sockets --row Shallow SMS616 SMS618
// Names are tidied from VIM's description; check them (and chip, label) before committing.
// The Made in USA flag ("usa": true) is set only when VIM itself says so: its description (MADE IN USA / USA MADE)
// or a claim in store/vim-usa-claims.json (with the catalog page).
// New parts have no stock until it's entered in Pitwall (no stock row = 0, can't be bought).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VIM = JSON.parse(fs.readFileSync(path.join(ROOT, 'store/vim-catalog.json'), 'utf8')).parts;
const CATALOG = path.join(ROOT, 'store/catalog.json');
const USA = JSON.parse(fs.readFileSync(path.join(ROOT, 'store/vim-usa-claims.json'), 'utf8')).claims;

const KEEP = new Set(['MVRK', 'USA', 'UJ', 'XZN', 'SAE', 'OAL', 'BMW', 'VW', 'LED', 'S2', 'EP', 'IP', 'SQ', 'CV', 'ABS', 'O2', 'TPMS', 'PH1', 'PH2', 'PH3']);
const WORDS = { MAGRAIL: 'Magrail', MAGRAILS: 'Magrails', TORX: 'Torx', 'E-TORX': 'E-Torx', 'TORX®': 'Torx', 'E-TORX®': 'E-Torx' };

// "16MM 6PT 3/8'' DR. SOCKET - SATIN FINISH" -> '16mm 6-Point Socket, 3/8" Drive, Satin Finish'
export function tidy(desc) {
  let s = desc.replace(/’’|''|”|“/g, '"').replace(/’/g, "'").replace(/\s+/g, ' ').trim();
  s = s.replace(/\b(\d+(?:\.\d+)?)\s?MM\b/gi, '$1mm').replace(/\b(\d+)\s?-?PT\.?\b/gi, '$1-point')
    .replace(/\bDR\.?(?=\s|,|$)/gi, 'drive').replace(/\bPC\.?(?=\s|$)/gi, 'pc').replace(/\bSQ\.(?=\s|$)/gi, 'SQ');
  s = s.split(' ').map(w => {
    const bare = w.replace(/[(),.]/g, '').toUpperCase();
    if (WORDS[bare]) return w.replace(/[A-Za-z®-]+/, WORDS[bare]);
    if (KEEP.has(bare) || /\d/.test(w) || /^[A-Z]\d+$/.test(bare)) return w.replace(/mm/i, 'mm');
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
  s = s.replace(/(\d") ?L\.(?=\s|$)/g, '$1 long').replace(/ X (?=\d)/g, ' × ').replace(/\b(\d+) Pc\b/g, '$1-pc');
  return s.replace(/\s+-\s+/g, ', ').replace(/\s+,/g, ',').replace(/ (And|Or|With|For|Of|To|In|W\/) /g, (m, w) => ` ${w.toLowerCase()} `);
}
const chipOf = t => (t.match(/\b(\d+(?:\.\d+)?mm|\d+(?:-\d+)?\/\d+"|[ETS]\d{1,2}|IP\d+|PH\d|M\d{1,2})\b/) || [])[1] || t.split(/[ ,]/)[0];
const price = list => Math.round((Math.floor(list) + 0.99) * 100) / 100;

function line(sku, section, row, chip) {
  const p = VIM[sku];
  if (!p) throw new Error(`${sku}: not in the VIM catalog (store/vim-catalog.json)`);
  if (!p.list) throw new Error(`${sku}: VIM lists no price for it`);
  const name = tidy(p.desc), usa = /MADE IN USA|USA MADE/i.test(p.desc) || !!USA[sku];
  const clean = name.replace(/,? (Made in USA|USA Made)\b/i, '');
  const v = { sku, opts: [section], ...(row ? { row } : {}), chip: chip || chipOf(clean), label: clean, title: `VIM ${clean}`,
    ...(usa ? { usa: true } : {}), ...(p.upc ? { upc: p.upc } : {}), ...(p.map ? { map: p.map } : {}), list: p.list, price: price(p.list), brand: 'VIM Tools' };
  return '        ' + JSON.stringify(v).replace(/,"/g, ', "').replace(/":/g, '": ');
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'find') {
  const words = args.join(' ').toUpperCase().split(/\s+/);
  const hits = Object.entries(VIM).filter(([k, p]) => words.every(w => (k + ' ' + p.desc).toUpperCase().includes(w)));
  for (const [k, p] of hits.slice(0, 60)) console.log(`${k.padEnd(14)} ${String(p.list ? price(p.list) : '-').padStart(8)}  ${p.desc}`);
  console.log(`${hits.length} found${hits.length > 60 ? ' (first 60 shown)' : ''}`);
} else if (cmd === 'show') {
  for (const s of args) console.log(line(s, 'Section'));
} else if (cmd === 'add') {
  const [slug, section, ...rest] = args; let row = '', chip = '';
  const skus = [];
  for (let i = 0; i < rest.length; i++) { if (rest[i] === '--row') row = rest[++i]; else if (rest[i] === '--chip') chip = rest[++i]; else skus.push(rest[i]); }
  if (!slug || !section || !skus.length) throw new Error('usage: add <product-slug> <section> [--row <row>] [--chip <chip>] <SKU>...');
  const L = fs.readFileSync(CATALOG, 'utf8').split('\n');
  const at = L.findIndex(l => l.includes(`"slug": "${slug}"`));
  if (at < 0) throw new Error(`no product ${slug}`);
  const open = L.findIndex((l, i) => i > at && l.includes('"variants": ['));
  let close = open + 1; while (!L[close].trim().startsWith(']')) close++;
  const have = new Set(L.slice(open, close).map(l => (l.match(/"sku": "([^"]+)"/) || [])[1]).filter(Boolean));
  const add = skus.filter(s => !have.has(s)).map(s => line(s, section, row, chip));
  if (!add.length) { console.log('Nothing to add: already there.'); process.exit(0); }
  L[close - 1] = L[close - 1].replace(/,?\s*$/, ',');
  L.splice(close, 0, ...add.map((l, i) => i < add.length - 1 ? l + ',' : l));
  fs.writeFileSync(CATALOG, L.join('\n'));
  console.log(`Added ${add.length} to ${slug} / ${section}:\n` + add.join('\n'));
  console.log('Check names and chips, add the section to the kit if it is new, then run node scripts/build-store.mjs.');
} else {
  console.log('usage: find <words> | show <SKU>... | add <product-slug> <section> [--row <row>] [--chip <chip>] <SKU>...');
}
