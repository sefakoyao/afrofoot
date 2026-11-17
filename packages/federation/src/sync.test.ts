// The sync run with a fake API (serving the trimmed real answers in ../fixtures) and an in-memory store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSync, type Store } from './sync.ts';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
const team = fixture('getTeam'), group = fixture('getGroup'), matches = fixture('getMatches');

function fakeApi(over: Partial<Record<string, unknown>> = {}) {
  const calls: string[] = [];
  return { calls, async call(cmd: string, p: Record<string, string>) {
    calls.push(`${cmd}:${Object.values(p).join('/')}`);
    if (cmd in over) return over[cmd];
    if (cmd === 'getTeam') return team;
    if (cmd === 'getMatches') return matches;
    if (cmd === 'getGroup') return `${p.competition_id}/${p.category_id}/${p.group_id}` === 'etejp26/M4/4' ? group : { group: { teams: [] } };
    throw new Error('unexpected ' + cmd);
  } };
}
function memoryStore() {
  const db = { competitions: new Map<string, unknown>(), teams: new Map<string, { name: string }>(), club: new Set<string>(), standings: new Map<string, unknown[]>(), matches: new Map<string, { status: string }>(),
    players: new Map<string, { display_name: string; shirt_number: number | null }>(), stats: new Map<string, { goals: number; appearances: number }>() };
  const store: Store = {
    async upsertCompetitions(rows) { for (const r of rows) db.competitions.set(r.external_id, r); },
    async upsertTeams(rows) { for (const r of rows) db.teams.set(r.external_id, r); },
    async markClubTeams(ids) { for (const i of ids) db.club.add(i); },
    async replaceStandings(key, rows) { db.standings.set(key, rows); },
    async upsertMatches(rows) { for (const r of rows) db.matches.set(r.external_id, r); },
    async upsertPlayers(rows) { for (const r of rows) db.players.set(r.external_id, r); },
    async upsertPlayerStats(rows) { for (const r of rows) db.stats.set(`${r.player_external_id}@${r.competition_external_id}`, r); },
  };
  return { db, store };
}

test('a run stores the 2026 table, the games and the club flag', async () => {
  const api = fakeApi(); const { db, store } = memoryStore();
  const r = await runSync(api, store, ['35118195']);
  assert.deepEqual(r, { teams: 1, competitions: db.competitions.size, standings: 12, matches: db.matches.size, players: 0 });
  assert.equal((db.standings.get('etejp26/M4/4') ?? []).length, 12);
  assert.ok(db.club.has('35118195'));
  assert.ok(db.competitions.has('etejp26/M4/4') && db.competitions.has('spljp26/MSC/' + matches.matches.find((m: Record<string, string>) => m.competition_id === 'spljp26').group_id));
  assert.ok([...db.matches.values()].filter((m) => m.status === 'played').length >= 20);
  assert.ok(db.teams.get('35118195')?.name === 'Afro Foot Club');
  assert.ok(api.calls.includes('getGroup:etejp26/M4/4'));
  assert.ok(!api.calls.some((c) => c.startsWith('getGroup:spljp') || c.startsWith('getGroup:hkihar')), 'no tables for cups or friendlies');
});

test('a group not drawn yet keeps the existing table', async () => {
  const api = fakeApi({ getGroup: { group: { teams: [] } } }); const { db, store } = memoryStore();
  db.standings.set('etejp26/M4/4', ['kept']);
  await runSync(api, store, ['35118195']);
  assert.deepEqual(db.standings.get('etejp26/M4/4'), ['kept']);
});

test('team ids are cleaned (numbers only, once each)', async () => {
  const api = fakeApi(); const { store } = memoryStore();
  const r = await runSync(api, store, ['35118195', ' 35118195 ', 'x; drop', '']);
  assert.equal(r.teams, 1);
  assert.equal(api.calls.filter((c) => c.startsWith('getTeam')).length, 1);
});

test('an unknown team stops the run with a clear error', async () => {
  const api = fakeApi({ getTeam: { call: { status: 'ok' }, team: {} } }); const { store } = memoryStore();
  await assert.rejects(runSync(api, store, ['1']), /Team 1 not found/);
});

test('a refused key is reported as such, and nothing is written', async () => {
  const api = fakeApi({ getTeam: { call: { status: 'error', error: 'No API key provided' } } }); const { db, store } = memoryStore();
  await assert.rejects(runSync(api, store, ['35118195']), /refused getTeam: No API key provided/);
  assert.equal(db.competitions.size + db.matches.size + db.standings.size, 0);
});

test('a new season\'s fixtures count before its group is listed', async () => {
  const fixture2027 = { ...matches.matches[0], match_id: '9000001', competition_id: 'etejp27', competition_name: 'Etelä Jalkapallo 2027', competition_season: '2027',
    category_id: 'M5', category_name: 'Miesten Vitonen', group_id: '2', group_name: '2', status: 'Fixture', fs_A: '', fs_B: '', date: '2027-05-10', time: '19:00:00', time_zone_offset: '+0300' };
  const api = fakeApi({ getMatches: { matches: [...matches.matches, fixture2027] } }); const { db, store } = memoryStore();
  await runSync(api, store, ['35118195']);
  assert.ok(db.competitions.has('etejp27/M5/2'));
  assert.equal(db.matches.get('9000001')?.status, 'fixture');
});

// Invented players in the service's format (the trimmed real fixtures contain no people).
const fakePlayers = [
  { player_id: '901', first_name: 'Test', last_name: 'Striker', shirt_number: '9', position_en: 'Forward', birthyear: '1999', nationality: 'XX', licence: 'ok', team_id: '35118195' },
  { player_id: '902', first_name: 'Test', last_name: 'Keeper', shirt_number: '1', position: 'mv', team_id: '35118195' },
  { player_id: '903', first_name: 'Gone', last_name: 'Player', shirt_number: '7', removed: '1', team_id: '35118195' },
];
const fakeStats = [
  { player_id: '901', team_id: '35118195', matches_played: '18', goals: '7', assists: '2', warnings: '1', suspensions: '0', player_name: 'Test Striker' },
  { player_id: '777', team_id: '1001', matches_played: '20', goals: '15', player_name: 'Someone Else' },
];

test('players: only id, name, shirt number and position are kept; removed players are left out', async () => {
  const { mapTeamPlayers } = await import('./map.ts');
  const rows = mapTeamPlayers({ team: { team_id: '35118195', players: fakePlayers } });
  assert.deepEqual(rows, [
    { external_id: '901', team_external_id: '35118195', display_name: 'Test Striker', shirt_number: 9, position: 'Forward' },
    { external_id: '902', team_external_id: '35118195', display_name: 'Test Keeper', shirt_number: 1, position: 'mv' },
  ]);
  assert.ok(rows.every((r) => !('birthyear' in r) && !('nationality' in r) && !('licence' in r)));
});

test('player statistics: the club\'s players only, per league group', async () => {
  const { mapGroupPlayerStats } = await import('./map.ts');
  const rows = mapGroupPlayerStats({ group: { competition_id: 'etejp26', category_id: 'M4', group_id: '4', player_statistics: fakeStats } }, new Set(['35118195']));
  assert.deepEqual(rows, [{ player_external_id: '901', competition_external_id: 'etejp26/M4/4', appearances: 18, goals: 7, assists: 2, yellow_cards: 1, red_cards: 0 }]);
});

test('a run stores the club\'s players and their league statistics, not other teams\' players', async () => {
  const api = fakeApi({ getTeam: { ...team, team: { ...team.team, players: fakePlayers } }, getGroup: { ...group, group: { ...group.group, player_statistics: fakeStats } } });
  const { db, store } = memoryStore();
  const r = await runSync(api, store, ['35118195']);
  assert.equal(r.players, 2);
  assert.equal(db.players.get('901')?.display_name, 'Test Striker');
  assert.equal(db.stats.get('901@etejp26/M4/4')?.goals, 7);
  assert.ok(![...db.stats.keys()].some((k) => k.startsWith('777')), 'another team\'s player is not stored');
});
