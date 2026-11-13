#!/usr/bin/env python3
"""Rebuild store/vim-catalog.json from VIM's yearly WMI price file (.xlsm).

    python3 scripts/import-vim-price-file.py path/to/2026_VIMTOOLS_WMI_PRICE_FILE.xlsm

Keeps only what is safe in a public repo: part number, description, list ("User"),
MAP, UPC, country of origin, weight and case qty. Jobber and WHS cost are dealer
prices and are never written here (costs live in Pitwall's database only).
"""
import json, re, sys, datetime
import openpyxl

def upc(v):
    s = re.sub(r'\D', '', str(v or ''))
    if len(s) == 11: s = '0' + s
    if len(s) != 12: return ''
    d = [int(c) for c in s]
    ok = (10 - (sum(d[0:11:2]) * 3 + sum(d[1:11:2])) % 10) % 10 == d[11]
    return s if ok else ''

def num(v):
    try: return round(float(v), 2)
    except (TypeError, ValueError): return None

src = sys.argv[1]
ws = openpyxl.load_workbook(src, read_only=True, data_only=True).worksheets[0]
rows = ws.iter_rows(values_only=True)
for r in rows:  # the header row is the one with a Description column
    head = [str(c or '').strip().lower() for c in r]
    if any(h.startswith('desc') for h in head): break
col = lambda name: next(i for i, h in enumerate(head) if h.startswith(name))
I = dict(sku=col('part'), desc=col('desc'), list=col('user'), map=col('map'), upc=col('bar'), origin=col('country'), lb=col('weight'), case=col('case'))
parts = {}
for r in rows:
    sku = str(r[I['sku']] or '').strip()
    if not sku: continue
    parts[sku] = {k: v for k, v in dict(
        desc=re.sub(r'\s+', ' ', str(r[I['desc']] or '')).strip(),
        list=num(r[I['list']]), map=num(r[I['map']]), upc=upc(r[I['upc']]),
        origin={'USA': 'USA'}.get(str(r[I['origin']] or '').strip().upper(), str(r[I['origin']] or '').strip().title()), lb=num(r[I['lb']]),
        case=int(r[I['case']]) if num(r[I['case']]) else None).items() if v not in (None, '')}
out = {'source': src.rsplit('/', 1)[-1].split('-', 1)[-1], 'imported': datetime.date.today().isoformat(),
       'note': 'VIM Tools active parts: list (User), MAP, UPC, origin. No dealer cost. Rebuild with scripts/import-vim-price-file.py.',
       'parts': dict(sorted(parts.items()))}
with open('store/vim-catalog.json', 'w') as f:
    f.write('{\n' + ',\n'.join(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in out.items() if k != 'parts'))
    f.write(',\n  "parts": {\n' + ',\n'.join(f'    {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in out['parts'].items()) + '\n  }\n}\n')
print(len(parts), 'parts written to store/vim-catalog.json')
