// Tests of the mappers against trimmed real answers (fixtures/*.json: Afro Foot Club, team 35118195, seasons 2025–2026).
// Run: pnpm --filter @afrofoot/federation test   (Node strips the TypeScript types itself.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { competitionFrom, groupKey, groupsToSync, kickoffOf, kindOf, mapGroup, mapMatches, seasonOf, statusOf, teamsFromMatches } from './map.ts';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'));
const team = fixture('getTeam'), group = fixture('getGroup'), matches = fixture('getMatches');

test('group keys join competition, category and group', () => {
  assert.equal(groupKey('etejp26', 'M4', '4'), 'etejp26/M4/4');
});

test('season comes from the field, else from the name', () => {
  assert.equal(seasonOf({ competition_season: '2026' }), 2026);
  assert.equal(seasonOf({ competition_season: null, competition_name: 'Etelä Jalkapallo 2027' }), 2027);
  assert.equal(seasonOf({ competition_name: 'No year' }), null);
});

test('kinds: league, cup and friendly', () => {
  assert.equal(kindOf({ group_type: 'group_stage', competition_officiality: 'official', category_name: 'Miesten Nelonen' }), 'league');
  assert.equal(kindOf({ group_type: 'knockout_final', category_name: 'Miesten Suomen Cup' }), 'cup');
  assert.equal(kindOf({ competition_officiality: 'practice', category_name: 'Harjoitukset' }), 'friendly');
});

test('groups to sync: the latest two seasons of the team, each once', () => {
  const rows = groupsToSync(team);
  const keys = rows.map((r) => r.external_id);
  assert.ok(keys.includes('etejp26/M4/4'), 'the 2026 league group');
  assert.ok(rows.every((r) => (r.season ?? 0) >= 2025), 'nothing older than 2025');
  assert.equal(new Set(keys).size, keys.length, 'no duplicates');
  const league = rows.find((r) => r.external_id === 'etejp26/M4/4');
  assert.deepEqual({ ...league }, { external_id: 'etejp26/M4/4', name: 'Etelä Jalkapallo 2026', category: 'Miesten Nelonen', group_name: '4', season: 2026, season_label: '2026', kind: 'league' });
  assert.equal(rows.find((r) => r.external_id.startsWith('spljp26'))?.kind, 'cup');
  assert.equal(rows.find((r) => r.external_id.startsWith('hkihar26'))?.kind, 'friendly');
});

test('league table of 2026, Miesten Nelonen group 4', () => {
  const { key, standings, teams } = mapGroup(group);
  assert.equal(key, 'etejp26/M4/4');
  assert.equal(standings.length, 12);
  assert.deepEqual(standings.map((s) => s.position), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(standings[0].team_name, 'KoiPS');
  const afro = standings.find((s) => s.team_external_id === '35118195');
  assert.deepEqual(afro && { position: afro.position, played: afro.played, won: afro.won, drawn: afro.drawn, lost: afro.lost, gf: afro.goals_for, ga: afro.goals_against, points: afro.points },
    { position: 10, played: 20, won: 4, drawn: 2, lost: 14, gf: 26, ga: 57, points: 14 });
  assert.ok(standings.every((s) => s.won + s.drawn + s.lost === s.played), 'won + drawn + lost = played');
  assert.equal(teams.length, 12);
  assert.ok(teams.every((t) => t.logo_url === null || t.logo_url.startsWith('https://')));
});

test('kick-off in UTC from local date, time and offset', () => {
  assert.equal(kickoffOf({ date: '2026-10-01', time: '18:00:00', time_zone_offset: '+03:00' }), '2026-10-01T15:00:00.000Z');
  assert.equal(kickoffOf({ date: '2026-11-20', time: '19:30', time_zone_offset: '+02:00' }), '2026-11-20T17:30:00.000Z');
  assert.equal(kickoffOf({ date: '2026-10-01', time: '18:00:00', time_zone_offset: '+0300' }), '2026-10-01T15:00:00.000Z', 'getMatches style offset');
  assert.equal(kickoffOf({ date: '', time: '18:00:00' }), null);
  assert.equal(kickoffOf({ date: '2026-10-01', time: 'soon' }), null);
});

test('statuses', () => {
  assert.equal(statusOf({ status: 'Played' }), 'played');
  assert.equal(statusOf({ status: 'Fixture' }), 'fixture');
  assert.equal(statusOf({ status: 'Forfeited' }), 'forfeited');
  assert.equal(statusOf({ status: 'Cancelled' }), 'cancelled');
});

test('games of the synced competitions, with scores only when played', () => {
  const keys = new Set(groupsToSync(team).map((r) => r.external_id));
  const { matches: rows, competitions } = mapMatches(matches, keys);
  const league = rows.filter((m) => m.competition_external_id === 'etejp26/M4/4');
  assert.equal(league.length, 20, '20 league games in 2026');
  assert.ok(league.every((m) => m.status === 'played' && m.home_goals !== null && m.away_goals !== null));
  const last = league.sort((a, b) => (a.kickoff_at ?? '').localeCompare(b.kickoff_at ?? '')).at(-1)!;
  assert.deepEqual({ home: last.home_name, away: last.away_name, score: `${last.home_goals}-${last.away_goals}`, at: last.kickoff_at, venue: last.venue },
    { home: 'ToBK', away: 'Afro Foot Club', score: '2-3', at: '2026-10-01T15:00:00.000Z', venue: 'Pallokenttä TN' });
  // our record from the games agrees with the league table
  const afro = league.reduce((r, m) => { const home = m.home_external_id === '35118195'; const f = home ? m.home_goals! : m.away_goals!; const a = home ? m.away_goals! : m.home_goals!;
    r.gf += f; r.ga += a; r.pts += f > a ? 3 : f === a ? 1 : 0; return r; }, { gf: 0, ga: 0, pts: 0 });
  assert.deepEqual(afro, { gf: 26, ga: 57, pts: 14 });
  const fixtures = rows.filter((m) => m.status === 'fixture');
  assert.ok(fixtures.every((m) => m.home_goals === null && m.away_goals === null), 'no score for games not played');
  assert.ok(competitions.some((c) => c.external_id === 'etejp26/M4/4' && c.kind === 'league'));
  assert.ok(rows.every((m) => keys.has(m.competition_external_id)), 'only synced competitions');
  assert.ok(rows.every((m) => m.kickoff_at !== null), 'every game has a kick-off time');
});

test('without a filter every game is mapped; opponents are known by name', () => {
  assert.equal(mapMatches(matches).matches.length, matches.matches.length);
  const teams = teamsFromMatches(matches);
  assert.ok(teams.some((t) => t.external_id === '35118195' && t.name === 'Afro Foot Club'));
  assert.equal(new Set(teams.map((t) => t.external_id)).size, teams.length);
});

test('competition from a game carries season and kind', () => {
  const m = matches.matches.find((x: Record<string, unknown>) => x.competition_id === 'spljp26');
  assert.equal(competitionFrom(m).kind, 'cup');
  assert.equal(competitionFrom(m).season, 2026);
});
