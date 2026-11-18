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
    if (cmd === 'getMatch') return fakeMatch(p.match_id ?? '');
    throw new Error('unexpected ' + cmd);
  } };
}
/** A getMatch answer shaped like the real one (field names checked against it), with invented people. */
function fakeMatch(id: string) {
  return { call: { status: 'ok' }, match: {
    match_id: id, team_A_id: '35118195', team_B_id: '999', fs_A: '2', fs_B: '1', hts_A: '1', hts_B: '1', attendance: '45',
    referee_1_name: 'Never Stored', venue_name: 'Test Field',
    goals: [
      { team_id: '999', player_id: '7001', first_name: 'Away', last_name: 'Scorer', time_min: '12', score_A: 0, score_B: 1, birthyear: '1990' },
      { team_id: '35118195', player_id: '901', first_name: 'Test', last_name: 'Striker', time_min: '40', score_A: 1, score_B: 1 },
      { team_id: '35118195', player_id: '901', first_name: 'Test', last_name: 'Striker', time_min: '77', score_A: 2, score_B: 1 },
    ],
    bookings: [
      { code: 'varoitus', team_id: '999', player_id: '7002', first_name: 'Away', last_name: 'Defender', time_min: '40' },
      { code: 'ulosajo', team_id: '35118195', player_id: '902', first_name: 'Test', last_name: 'Keeper', time_min: '88' },
      { code: 'other', team_id: '999', player_id: '7003', time_min: '50' },
    ],
    lineups: [{ player_id: '901', birthyear: '1999' }],
  } };
}

function memoryStore() {
  const db = { competitions: new Map<string, unknown>(), teams: new Map<string, { name: string }>(), club: new Set<string>(), standings: new Map<string, unknown[]>(), matches: new Map<string, { status: string }>(),
    players: new Map<string, { display_name: string; shirt_number: number | null }>(), stats: new Map<string, { goals: number; appearances: number }>(),
    details: new Map<string, { events: unknown[] }>() };
  const store: Store = {
    async upsertCompetitions(rows) { for (const r of rows) db.competitions.set(r.external_id, r); },
    async upsertTeams(rows) { for (const r of rows) db.teams.set(r.external_id, r); },
    async markClubTeams(ids) { for (const i of ids) db.club.add(i); },
    async replaceStandings(key, rows) { db.standings.set(key, rows); },
    async upsertMatches(rows) { for (const r of rows) db.matches.set(r.external_id, r); },
    async upsertPlayers(rows) { for (const r of rows) db.players.set(r.external_id, r); },
    async upsertPlayerStats(rows) { for (const r of rows) db.stats.set(`${r.player_external_id}@${r.competition_external_id}`, r); },
    async addPlayers(rows) { for (const r of rows) if (!db.players.has(r.external_id)) db.players.set(r.external_id, r); },
    async matchesNeedingDetails(ids) { return ids.filter((i) => !db.details.has(i)); },
    async replaceMatchDetails(d) { db.details.set(d.external_id, d); },
  };
  return { db, store };
}

test('a run stores the 2026 table, the games and the club flag', async () => {
  const api = fakeApi(); const { db, store } = memoryStore();
  const r = await runSync(api, store, ['35118195']);
  assert.deepEqual(r, { teams: 1, competitions: 7, standings: 12, matches: db.matches.size, players: 0, details: Math.min(40, [...db.matches.values()].filter((m) => m.status === 'played' || m.status === 'forfeited').length) });
  assert.equal(db.competitions.size, 12, 'the 7 of the last two seasons, plus 5 earlier league and cup groups (for the scorers)');
  assert.equal((db.standings.get('etejp26/M4/4') ?? []).length, 12);
  assert.ok(db.club.has('35118195'));
  assert.ok(db.competitions.has('etejp26/M4/4') && db.competitions.has('spljp26/MSC/' + matches.matches.find((m: Record<string, string>) => m.competition_id === 'spljp26').group_id));
  assert.ok([...db.matches.values()].filter((m) => m.status === 'played').length >= 20);
  assert.ok(db.teams.get('35118195')?.name === 'Afro Foot Club');
  assert.ok(api.calls.includes('getGroup:etejp26/M4/4'));
  assert.ok(!api.calls.some((c) => c.startsWith('getGroup:hkihar') || c.startsWith('getGroup:lahtiharj')), 'friendlies are never read');
  assert.ok(api.calls.includes('getGroup:etejp22/M6/6') && api.calls.includes('getGroup:spljp23/MSC/4'), 'earlier seasons and cups are read for the scorers');
  assert.deepEqual([...db.standings.keys()], ['etejp26/M4/4'], 'but no tables are stored for them');
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
  { player_id: '901', first_name: 'Test', last_name: 'Striker', shirt_number: '9', position_en: 'forward', birthyear: '1999', nationality: 'XX', licence: 'ok', removed: '0000-00-00 00:00:00', inactive: '0', team_id: '35118195' },
  { player_id: '902', first_name: 'Test', last_name: 'Keeper', shirt_number: '1', position: 'maalivahti', removed: '0000-00-00 00:00:00', inactive: '0', team_id: '35118195' },
  { player_id: '903', first_name: 'Gone', last_name: 'Player', shirt_number: '7', position_en: 'midfield', removed: '2026-04-14 14:21:14', inactive: '0', team_id: '35118195' },
  { player_id: '904', first_name: 'Resting', last_name: 'Player', shirt_number: '5', position_en: 'defender', removed: '0000-00-00 00:00:00', inactive: '1', team_id: '35118195' },
];
const fakeStats = [
  // as the real answer: games in "matches", "matches_played" left empty
  { player_id: '901', team_id: '35118195', matches: '18', matches_played: '', goals: '7', assists: '2', warnings: '1', suspensions: '0', first_name: 'Test', last_name: 'Striker', player_name: 'Striker Test' },
  { player_id: '777', team_id: '1001', matches: '20', matches_played: '', goals: '15', first_name: 'Someone', last_name: 'Else' },
];

test('players: only id, name, shirt number, position and roster status are kept', async () => {
  const { mapTeamPlayers } = await import('./map.ts');
  const rows = mapTeamPlayers({ team: { team_id: '35118195', players: fakePlayers } });
  assert.deepEqual(rows, [
    { external_id: '901', team_external_id: '35118195', display_name: 'Test Striker', shirt_number: 9, position: 'forward', on_roster: true },
    { external_id: '902', team_external_id: '35118195', display_name: 'Test Keeper', shirt_number: 1, position: 'goalkeeper', on_roster: true },
    { external_id: '903', team_external_id: '35118195', display_name: 'Gone Player', shirt_number: 7, position: 'midfielder', on_roster: false },
    { external_id: '904', team_external_id: '35118195', display_name: 'Resting Player', shirt_number: 5, position: 'defender', on_roster: false },
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
  assert.equal(r.players, 4);
  assert.equal(db.players.get('901')?.display_name, 'Test Striker');
  assert.equal(db.stats.get('901@etejp26/M4/4')?.goals, 7);
  assert.ok(![...db.stats.keys()].some((k) => k.startsWith('777')), 'another team\'s player is not stored');
});

test('games come from "matches" (the real answer), with "matches_played" as a fallback', async () => {
  const { mapGroupPlayerStats } = await import('./map.ts');
  const g = (stats: unknown[]) => ({ group: { competition_id: 'x', category_id: 'y', group_id: '1', player_statistics: stats } });
  assert.equal(mapGroupPlayerStats(g([{ player_id: '1', team_id: '9', matches: '14', matches_played: '' }]), new Set(['9']))[0]?.appearances, 14);
  assert.equal(mapGroupPlayerStats(g([{ player_id: '1', team_id: '9', matches_played: '6' }]), new Set(['9']))[0]?.appearances, 6);
});

test('all-time: goals from earlier seasons keep former players\' names, without touching current players', async () => {
  const season2024 = { group: { competition_id: 'etejp24', category_id: 'M5', group_id: '6', teams: [], player_statistics: [
    { player_id: '901', team_id: '35118195', matches: '20', goals: '12', first_name: 'Old', last_name: 'Name' },
    { player_id: '950', team_id: '35118195', matches: '19', goals: '21', first_name: 'Former', last_name: 'Scorer', birthyear: '1990' },
    { player_id: '778', team_id: '1001', matches: '20', goals: '30', first_name: 'Rival', last_name: 'Striker' },
  ] } };
  const api = { calls: [] as string[], async call(cmd: string, p: Record<string, string>) {
    const k = `${p.competition_id}/${p.category_id}/${p.group_id}`;
    if (cmd === 'getTeam') return { ...team, team: { ...team.team, players: fakePlayers } };
    if (cmd === 'getMatches') return matches;
    if (k === 'etejp26/M4/4') return { ...group, group: { ...group.group, player_statistics: fakeStats } };
    if (k === 'etejp24/M5/6') return season2024;
    if (k === 'etejp23/M5/5') return { call: { status: 'error', error: 'temporarily unavailable' } };
    return { group: { teams: [] } };
  } };
  const { db, store } = memoryStore();
  await runSync(api, store, ['35118195']);
  assert.equal(db.stats.get('950@etejp24/M5/6')?.goals, 21);
  assert.equal(db.stats.get('901@etejp24/M5/6')?.goals, 12);
  assert.deepEqual(db.players.get('950'), { external_id: '950', team_external_id: '35118195', display_name: 'Former Scorer', shirt_number: null, position: null, on_roster: false });
  assert.equal(db.players.get('901')?.display_name, 'Test Striker', 'a current player is not renamed or taken off the roster');
  assert.ok(!db.players.has('778') && ![...db.stats.keys()].some((k) => k.startsWith('778')), 'other teams\' players are not stored');
  assert.ok(db.competitions.has('etejp24/M5/6') && db.competitions.has('etejp22/M6/6'), 'earlier competitions are known (season, kind) for the view');
});

test('positions in English and Finnish map to the club\'s four', async () => {
  const { positionOf } = await import('./map.ts');
  assert.equal(positionOf({ position_en: 'midfield', position: 'keskikentta' }), 'midfielder');
  assert.equal(positionOf({ position: 'hyokkaaja' }), 'forward');
  assert.equal(positionOf({ position_fi: 'puolustaja' }), 'defender');
  assert.equal(positionOf({ position: 'mv' }), 'goalkeeper');
  assert.equal(positionOf({ position: '' }), null);
});

test('game details: half-time score, attendance, goals and cards in time order; no referees or birth years', async () => {
  const { mapMatchDetails } = await import('./map.ts');
  const d = mapMatchDetails(fakeMatch('5001'))!;
  assert.equal(d.ht_home, 1); assert.equal(d.ht_away, 1); assert.equal(d.attendance, 45);
  assert.deepEqual(d.events.map((e) => `${e.seq}:${e.minute}:${e.kind}:${e.player_name}:${e.score_home ?? ''}-${e.score_away ?? ''}`),
    ['1:12:goal:Away Scorer:0-1', '2:40:goal:Test Striker:1-1', '3:40:yellow:Away Defender:-', '4:77:goal:Test Striker:2-1', '5:88:red:Test Keeper:-']);
  const text = JSON.stringify(d);
  assert.ok(!text.includes('Never Stored') && !text.includes('birthyear') && !text.includes('1990'), 'referees and birth years are not kept');
  assert.equal(mapMatchDetails({ match: {} }), null);
});

test('a run fetches details of played games only, skips one the service refuses, and does not fetch them twice', async () => {
  const played = matches.matches.filter((m: Record<string, string>) => ['played', 'forfeited', 'walkover'].includes(String(m.status).toLowerCase())).map((m: Record<string, string>) => m.match_id);
  let refused = '';
  const api = fakeApi(); const base = api.call.bind(api);
  // the first game the run asks for is refused by the service
  api.call = async (cmd: string, p: Record<string, string>) => {
    if (cmd === 'getMatch' && (!refused || p.match_id === refused)) { refused = p.match_id ?? ''; api.calls.push(`getMatch:${refused}`); return { call: { status: 'error', error: 'not found' } }; }
    return base(cmd, p);
  };
  const { db, store } = memoryStore();
  const r = await runSync(api, store, ['35118195']);
  const asked = api.calls.filter((c) => c.startsWith('getMatch:'));
  assert.ok(asked.length > 0 && asked.length <= 40, 'at most 40 games per run');
  assert.ok(asked.every((c) => played.includes(c.slice('getMatch:'.length))), 'only played games');
  assert.ok(!db.details.has(refused) && r.details === asked.length - 1, 'the refused game is skipped, the run goes on');
  const again = fakeApi(); await runSync(again, store, ['35118195']);
  assert.ok(again.calls.filter((c) => c.startsWith('getMatch:')).every((c) => c === `getMatch:${refused}`), 'stored games are not fetched again');
});
