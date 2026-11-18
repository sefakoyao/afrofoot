/**
 * One sync run: for each of the club's teams on the results service, read the team (its groups), the league tables of
 * the latest two seasons and the team's games, plus the club's goals from every official group it has played (all-time
 * scorers), then write them through the given store. Pure orchestration: the caller
 * passes the API client and the database writes (apps/web /api/federation-sync), so it is tested with fakes (sync.test.ts).
 */
import { competitionFrom, groupsToSync, mapGroup, mapGroupPlayerStats, mapMatchDetails, mapMatches, mapTeamPlayers, playersFromStats, teamsFromMatches, type MatchDetails, type CompetitionRow, type MatchRow, type PlayerRow, type PlayerStatRow, type StandingRow, type TeamRow } from './map.ts';

export interface Api { call(command: string, params: Record<string, string>): Promise<unknown> }
export interface Store {
  upsertCompetitions(rows: CompetitionRow[]): Promise<void>;
  upsertTeams(rows: TeamRow[]): Promise<void>;
  markClubTeams(externalIds: string[]): Promise<void>;
  replaceStandings(competitionExternalId: string, rows: StandingRow[]): Promise<void>;
  upsertMatches(rows: MatchRow[]): Promise<void>;
  /** The club's registered players (never links them to app players: an admin does that). */
  upsertPlayers(rows: PlayerRow[]): Promise<void>;
  upsertPlayerStats(rows: PlayerStatRow[]): Promise<void>;
  /** Players known only from statistics (former players): added off the roster, existing rows are left as they are. */
  addPlayers(rows: PlayerRow[]): Promise<void>;
  /** Of these played games, the ones whose details are missing or may still change (played in the last 7 days). */
  matchesNeedingDetails(externalIds: string[]): Promise<string[]>;
  /** A game's half-time score, attendance, goals and cards (replaces what was stored for it). */
  replaceMatchDetails(details: MatchDetails): Promise<void>;
}
export interface SyncResult { teams: number; competitions: number; standings: number; matches: number; players: number; details?: number }

/** At most this many getMatch calls per run; the rest follow on the next runs. */
export const DETAILS_PER_RUN = 40;

type Json = Record<string, unknown>;
const groupKeyOf = (groupAnswer: Json) => { const g = (groupAnswer.group ?? {}) as Json; return `${g.competition_id}/${g.category_id}/${g.group_id}`; };

/** The service answers errors with HTTP 200 and {"call": {"status": "error", "error": "No API key provided"}}. */
function refusal(answer: unknown): string | null {
  const call = ((answer ?? {}) as Json).call as Json | undefined;
  if (call?.status !== 'error') return null;
  return String(call.error ?? call.error_message ?? 'unknown error').slice(0, 120);
}
async function ask(api: Api, command: string, params: Record<string, string>): Promise<Json> {
  const answer = await api.call(command, params);
  const why = refusal(answer);
  if (why) throw new Error(`The results service refused ${command}: ${why}`);
  return (answer ?? {}) as Json;
}

export async function runSync(api: Api, store: Store, teamIds: string[]): Promise<SyncResult> {
  const result: SyncResult = { teams: 0, competitions: 0, standings: 0, matches: 0, players: 0 };
  const ids = [...new Set(teamIds.map((t) => String(t).trim()).filter((t) => /^\d+$/.test(t)))];
  for (const teamId of ids) {
    const team = await ask(api, 'getTeam', { team_id: teamId });
    if (!(team?.team as Json | undefined)?.team_id) throw new Error(`Team ${teamId} not found on the results service`);
    const groups = groupsToSync(team);
    if (!groups.length) continue;
    const minSeason = Math.min(...groups.map((g) => g.season as number));

    // games first: they also name competitions the team's group list does not show yet (a new season's first fixtures)
    const answer = await ask(api, 'getMatches', { team_id: teamId });
    const mapped = mapMatches(answer);
    const competitions = new Map(groups.map((g) => [g.external_id, g]));
    for (const c of mapped.competitions) if ((c.season ?? 0) >= minSeason && !competitions.has(c.external_id)) competitions.set(c.external_id, c);
    const matches = mapped.matches.filter((m) => competitions.has(m.competition_external_id));
    const inGames = new Set(matches.flatMap((m) => [m.home_external_id, m.away_external_id]));

    await store.upsertCompetitions([...competitions.values()]);
    await store.upsertTeams(teamsFromMatches(answer).filter((t) => inGames.has(t.external_id)));

    const club = new Set([teamId]);
    const statAnswers: Json[] = [];
    for (const g of [...competitions.values()].filter((c) => c.kind === 'league')) {
      const [competition_id = '', category_id = '', group_id = ''] = g.external_id.split('/');
      const groupAnswer = await ask(api, 'getGroup', { competition_id, category_id, group_id });
      const table = mapGroup(groupAnswer);
      if (!table.standings.length) continue; // groups not drawn yet: keep what we have
      await store.upsertTeams(table.teams);
      await store.replaceStandings(g.external_id, table.standings);
      result.standings += table.standings.length;
      statAnswers.push(groupAnswer);
    }
    await store.upsertMatches(matches);

    // Game details (goals, cards, half-time score) for played games: missing ones first, recent ones again.
    const played = matches.filter((m) => m.status === 'played' || m.status === 'forfeited').map((m) => m.external_id);
    const want = played.length ? (await store.matchesNeedingDetails(played)).slice(0, DETAILS_PER_RUN) : [];
    for (const matchId of want) {
      try {
        const details = mapMatchDetails(await ask(api, 'getMatch', { match_id: matchId }));
        if (details) { await store.replaceMatchDetails(details); result.details = (result.details ?? 0) + 1; }
      } catch { /* one game the service cannot answer does not stop the run */ }
    }
    const players = mapTeamPlayers(team);
    await store.upsertPlayers(players);
    result.players += players.length;

    // Goals for the all-time scorers: every official group the team ever played (earlier seasons and cups), statistics
    // only (no tables or games). A group the service cannot answer is skipped, so history never blocks the sync.
    const allGroups = (((team.team as Json).groups ?? []) as Json[]).map(competitionFrom);
    const history = [...new Map(allGroups.filter((c) => c.kind !== 'friendly' && !statAnswers.some((a) => groupKeyOf(a) === c.external_id)).map((c) => [c.external_id, c])).values()];
    const known = new Set(competitions.keys());
    await store.upsertCompetitions(history.filter((c) => !known.has(c.external_id)));
    for (const c of history) {
      const [competition_id = '', category_id = '', group_id = ''] = c.external_id.split('/');
      try { statAnswers.push(await ask(api, 'getGroup', { competition_id, category_id, group_id })); } catch { /* skipped */ }
    }
    // goals and games of the club's own players only (other teams' players are not stored)
    for (const a of statAnswers) {
      await store.addPlayers(playersFromStats(a, club));
      await store.upsertPlayerStats(mapGroupPlayerStats(a, club));
    }
    await store.markClubTeams([teamId]);
    result.teams += 1; result.competitions += competitions.size; result.matches += matches.length;
  }
  return result;
}
