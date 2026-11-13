// Captures real API responses into ./fixtures (API key redacted) so the mappers can be written against facts.
// Usage:  TORNEOPAL_API_KEY=... node scripts/probe.mjs "Afro Foot"
import { mkdirSync, writeFileSync } from 'node:fs';
const key = process.env.TORNEOPAL_API_KEY; if (!key) { console.error('Set TORNEOPAL_API_KEY'); process.exit(1); }
const base = (process.env.TORNEOPAL_BASE_URL ?? 'https://spl.torneopal.net/taso/rest').replace(/\/$/, '');
const term = process.argv[2] ?? 'Afro Foot';
const calls = [['getDistricts', {}], ['search', { text: term }]];
mkdirSync(new URL('../fixtures/', import.meta.url), { recursive: true });
for (const [cmd, params] of calls) {
  const u = new URL(`${base}/${cmd}`); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v); u.searchParams.set('api_key', key);
  try {
    const r = await fetch(u, { headers: { Accept: 'application/json' } });
    const body = (await r.text()).split(key).join('[REDACTED]');
    writeFileSync(new URL(`../fixtures/${cmd}.json`, import.meta.url), body);
    console.log(cmd, r.status, body.length, 'bytes');
  } catch (e) { console.log(cmd, 'failed:', e.message); }
}
console.log('Next: look for your team/competition IDs in fixtures/search.json, then try getMatches / team / group commands from the help page.');
