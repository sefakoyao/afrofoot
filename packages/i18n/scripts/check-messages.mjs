// Fails when a translation is missing, empty, has different {placeholders} than English, or is not a valid ICU message
// (next-intl then shows the key instead of the text, e.g. unescaped {{…}}: write '{{…}}' in quotes).
import { readFileSync } from 'node:fs';
import { parse } from '@formatjs/icu-messageformat-parser';
const load = (l) => JSON.parse(readFileSync(new URL(`../src/messages/${l}.json`, import.meta.url), 'utf8'));
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => typeof v === 'object' ? flat(v, p + k + '.') : [[p + k, v]]);
const en = new Map(flat(load('en')));
// Argument names of a message, read from the parsed ICU tree (so plural branches such as {goal} are not mistaken for
// placeholders); falls back to the plain {name} pattern when the message does not parse (reported separately).
const argsOf = (s) => {
  const out = new Set();
  const walk = (nodes) => { for (const n of nodes) { if (n.value !== undefined && n.type !== 0 && n.type !== 7) out.add(n.value); if (n.options) for (const o of Object.values(n.options)) walk(o.value); } };
  try { walk(parse(String(s))); } catch { for (const m of String(s).match(/\{\w+\}/g) ?? []) out.add(m.slice(1, -1)); }
  return [...out].sort().join();
};
let bad = 0;
for (const l of ['en', 'fi', 'fr', 'ar']) {
  for (const [k, v] of flat(load(l))) {
    try { parse(String(v)); } catch (e) { console.error(`${l}: ${k} is not a valid message (${e.message})`); bad++; }
  }
}
for (const l of ['fi', 'fr', 'ar']) {
  const m = new Map(flat(load(l)));
  for (const [k, v] of en) {
    if (!m.has(k)) { console.error(`${l}: missing ${k}`); bad++; continue; }
    const t = m.get(k);
    if (!String(t).trim()) { console.error(`${l}: empty ${k}`); bad++; }
    if (argsOf(v) !== argsOf(t)) { console.error(`${l}: placeholder mismatch in ${k}`); bad++; }
  }
  for (const k of m.keys()) if (!en.has(k)) { console.error(`${l}: extra key ${k}`); bad++; }
}
console.log(bad ? `FAIL (${bad} problems)` : `OK — ${en.size} keys in en/fi/fr/ar`);
process.exit(bad ? 1 : 0);
