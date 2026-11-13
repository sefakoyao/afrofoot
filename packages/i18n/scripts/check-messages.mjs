// Fails when a translation is missing, empty, or has different {placeholders} than English.
import { readFileSync } from 'node:fs';
const load = (l) => JSON.parse(readFileSync(new URL(`../src/messages/${l}.json`, import.meta.url), 'utf8'));
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => typeof v === 'object' ? flat(v, p + k + '.') : [[p + k, v]]);
const en = new Map(flat(load('en')));
let bad = 0;
for (const l of ['fi', 'fr', 'ar']) {
  const m = new Map(flat(load(l)));
  for (const [k, v] of en) {
    if (!m.has(k)) { console.error(`${l}: missing ${k}`); bad++; continue; }
    const t = m.get(k);
    if (!String(t).trim()) { console.error(`${l}: empty ${k}`); bad++; }
    const ph = (s) => (String(s).match(/\{\w+\}/g) ?? []).sort().join();
    if (ph(v) !== ph(t)) { console.error(`${l}: placeholder mismatch in ${k}`); bad++; }
  }
  for (const k of m.keys()) if (!en.has(k)) { console.error(`${l}: extra key ${k}`); bad++; }
}
console.log(bad ? `FAIL (${bad} problems)` : `OK — ${en.size} keys in en/fi/fr/ar`);
process.exit(bad ? 1 : 0);
