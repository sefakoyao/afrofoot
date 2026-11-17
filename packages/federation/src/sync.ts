/**
 * One sync run: for each of the club's teams on the results service, read the team (its groups), the league tables of
 * the latest two seasons and the team's games, then write them through the given store. Pure orchestration: the caller
 * passes the API client and the database writes (apps/web /api/federation-sync), so it is tested with fakes (sync.test.ts).
 */
import { groupsToSync, mapGroup, mapGroupPlayerStats, mapMatches, mapTeamPlayers, teamsFromMatches, type CompetitionRow, type MatchRow, type PlayerRow, type PlayerStatRow, type StandingRow, type TeamRow } from './map.ts';

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
}
export interface SyncResult { teams: number; competitions: number; standings: number; matches: number; players: number }

type Json = Record<string, unknown>;

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

    for (const g of [...competitions.values()].filter((c) => c.kind === 'league')) {
      const [competition_id = '', category_id = '', group_id = ''] = g.external_id.split('/');
      const groupAnswer = await ask(api, 'getGroup', { competition_id, category_id, group_id });
      const table = mapGroup(groupAnswer);
      if (!table.standings.length) continue; // groups not drawn yet: keep what we have
      await store.upsertTeams(table.teams);
      await store.replaceStandings(g.external_id, table.standings);
      result.standings += table.standings.length;
      // goals and games of the club's own players only (other teams' players are not stored)
      await store.upsertPlayerStats(mapGroupPlayerStats(groupAnswer, new Set([teamId])));
    }
    await store.upsertMatches(matches);
    const players = mapTeamPlayers(team);
    await store.upsertPlayers(players);
    result.players += players.length;
    await store.markClubTeams([teamId]);
    result.teams += 1; result.competitions += competitions.size; result.matches += matches.length;
  }
  return result;
}
