import 'server-only';
import { getPublicClient } from './supabase';

/**
 * The club's games, results and league table for the website (home page and Team page): Palloliitto's official data when
 * synced (migration 0040 views, filled by /api/federation-sync), else the games and scores entered in the member app.
 */
export interface Fixture { id: string; team_name: string; opponent: string; home_away: string | null; kickoff_at: string; status: string; goals_for: number | null; goals_against: number | null; venue: string | null; city: string | null }
export interface Record_ { team_season_id: string; team_name: string; competition: string; played: number; won: number; drawn: number; lost: number; points: number }
/** Palloliitto league table row and game (migration 0040 views, filled by /api/federation-sync). */
export interface FedStanding { competition_external_id: string; competition: string; category: string | null; group_name: string | null; season: number | null; position: number; team_name: string; is_club: boolean;
  played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number; points: number; synced_at: string }
export interface FedGame { external_id: string; competition_external_id: string; competition: string; category: string | null; kind: string; kickoff_at: string | null; home_name: string; away_name: string;
  home_goals: number | null; away_goals: number | null; venue: string | null; status: string; synced_at: string; home_is_club: boolean; away_is_club: boolean }
/** A game as the website shows it: home team first, the score in the same order; outcome is the club's (win, draw, loss). */
export type Outcome = 'w' | 'd' | 'l';
export interface Game { id: string; label: string; tag: string; kickoff_at: string; place: string | null; score: string | null; home: string; away: string; clubHome: boolean; outcome: Outcome | null; href?: string }
export const outcomeOf = (ours: number | null, theirs: number | null): Outcome | null => (ours === null || theirs === null ? null : ours > theirs ? 'w' : ours < theirs ? 'l' : 'd');


export interface LeagueData { fixtures: Fixture[]; records: Record_[]; fedTable: FedStanding[]; fedGames: FedGame[] }

export async function getLeagueData(): Promise<LeagueData> {
  const db = getPublicClient();
  if (!db) return { fixtures: [], records: [], fedTable: [], fedGames: [] };
  const [f, r, st, fg] = await Promise.all([
    db.from('public_fixtures').select('id,team_name,opponent,home_away,kickoff_at,status,goals_for,goals_against,venue,city').order('kickoff_at', { ascending: false }).limit(40),
    db.from('public_team_records').select('team_season_id,team_name,competition,played,won,drawn,lost,points').order('points', { ascending: false }).limit(12),
    db.from('public_standings').select('competition_external_id,competition,category,group_name,season,position,team_name,is_club,played,won,drawn,lost,goals_for,goals_against,points,synced_at')
      .order('season', { ascending: false }).order('position').limit(200),
    db.from('public_league_fixtures').select('external_id,competition_external_id,competition,category,kind,kickoff_at,home_name,away_name,home_goals,away_goals,venue,status,synced_at,home_is_club,away_is_club')
      .or('home_is_club.eq.true,away_is_club.eq.true').order('kickoff_at', { ascending: false }).limit(60),
  ]);
  return { fixtures: (f.data ?? []) as Fixture[], records: (r.data ?? []) as Record_[], fedTable: (st.data ?? []) as FedStanding[], fedGames: (fg.data ?? []) as FedGame[] };
}

const vs = (m: Fixture) => (m.home_away === 'away' ? `${m.opponent}  vs  ${m.team_name}` : `${m.team_name}  vs  ${m.opponent}`);
export const ownGame = (m: Fixture): Game => ({
  id: m.id, label: vs(m), tag: m.team_name, kickoff_at: m.kickoff_at, place: m.venue ? `${m.venue}${m.city ? `, ${m.city}` : ''}` : null,
  score: m.goals_for === null || m.goals_against === null ? null : m.home_away === 'away' ? `${m.goals_against} – ${m.goals_for}` : `${m.goals_for} – ${m.goals_against}`,
  home: m.home_away === 'away' ? m.opponent : m.team_name, away: m.home_away === 'away' ? m.team_name : m.opponent, clubHome: m.home_away !== 'away',
  outcome: outcomeOf(m.goals_for, m.goals_against),
});
export const fedGame = (m: FedGame): Game => ({
  id: m.external_id, label: `${m.home_name}  vs  ${m.away_name}`, tag: m.category || m.competition, kickoff_at: m.kickoff_at ?? '', place: m.venue,
  score: m.home_goals === null || m.away_goals === null ? null : `${m.home_goals} – ${m.away_goals}`,
  home: m.home_name, away: m.away_name, clubHome: m.home_is_club,
  outcome: m.home_is_club ? outcomeOf(m.home_goals, m.away_goals) : m.away_is_club ? outcomeOf(m.away_goals, m.home_goals) : null,
  href: `/results/${m.external_id}`,
});

/** The league table to show: the newest season whose table has games played (last season's final table until then). */
export function pickTable(rows: FedStanding[]): FedStanding[] {
  const groups = new Map<string, FedStanding[]>();
  for (const r of rows) groups.set(r.competition_external_id, [...(groups.get(r.competition_external_id) ?? []), r]);
  const tables = [...groups.values()].filter((g) => g.some((r) => r.played > 0)).sort((a, b) => (b[0]?.season ?? 0) - (a[0]?.season ?? 0));
  return (tables[0] ?? []).sort((a, b) => a.position - b.position);
}


/** What the pages show: the next game, the latest results, the league table to show and whether it is final. */
export function deriveLeague({ fixtures, records, fedTable, fedGames }: LeagueData) {
  const now = Date.now();
  // Games entered in the member app come first for the next match; Palloliitto fills in when there are none.
  const ownNext = fixtures.filter((m) => m.status === 'scheduled' && new Date(m.kickoff_at).getTime() >= now).sort((a, b) => +new Date(a.kickoff_at) - +new Date(b.kickoff_at))[0];
  const fedNext = fedGames.filter((m) => m.status === 'fixture' && m.kickoff_at && Date.parse(m.kickoff_at) >= now).sort((a, b) => (a.kickoff_at ?? '').localeCompare(b.kickoff_at ?? ''))[0];
  const next: Game | undefined = ownNext ? ownGame(ownNext) : fedNext ? fedGame(fedNext) : undefined;
  // Results: the official ones from Palloliitto when synced, else the scores entered in the app.
  const fedPlayed = fedGames.filter((m) => m.status === 'played' && m.home_goals !== null && m.kickoff_at);
  const results: Game[] = (fedPlayed.length ? fedPlayed.map(fedGame) : fixtures.filter((m) => m.status === 'played').map(ownGame)).slice(0, 5);
  const table = pickTable(fedTable);
  const tableInfo = table[0];
  const clubRow = table.find((r) => r.is_club);
  const thisYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Helsinki' }).format(new Date()));
  // Final once the season is over, or the club has no games left to play in that league.
  const tableFinal = !!tableInfo && ((tableInfo.season ?? thisYear) < thisYear
    || !fedGames.some((m) => m.competition_external_id === tableInfo.competition_external_id && m.status === 'fixture'));
  const syncedAt = [...table.map((r) => r.synced_at), ...fedGames.map((m) => m.synced_at)].sort().at(-1);
  return { next, results, table, tableInfo, clubRow, tableFinal, syncedAt, records };
}
export type League = ReturnType<typeof deriveLeague>;
