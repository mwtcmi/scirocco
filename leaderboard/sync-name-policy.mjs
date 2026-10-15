import fs from 'node:fs';

const browser = new URL('../mountain-run/name-policy.js', import.meta.url);
const worker = new URL('./worker.mjs', import.meta.url);
const source = fs.readFileSync(browser, 'utf8').trim();
const begin = '// BEGIN SHARED NAME POLICY', end = '// END SHARED NAME POLICY';
const script = fs.readFileSync(worker, 'utf8');
const start = script.indexOf(begin), finish = script.indexOf(end);
if (start < 0 || finish < start) throw new Error('Missing Worker name-policy markers');
fs.writeFileSync(worker, script.slice(0, start) + begin + '\n' + source + '\n' + end + script.slice(finish + end.length));
