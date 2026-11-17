/**
 * Maps answers of the Torneopal "taso" REST API (Palloliitto results service) to the federation_* tables
 * (migrations 0011, 0040). Pure functions, no I/O: tested against trimmed real answers in ../fixtures (map.test.ts).
 * Field names verified against real getTeam / getGroup / getMatches answers for Afro Foot Club (team 35118195), 2026.
 */

type Json = Record<string, unknown>;
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const int = (v: unknown): number => { const n = Number.parseInt(str(v), 10); return Number.isFinite(n) ? n : 0; };
const intOrNull = (v: unknown): number | null => { const s = str(v); if (!/^\d+$/.test(s)) return null; return Number.parseInt(s, 10); };
const https = (v: unknown): string | null => (/^https:\/\/\S+$/.test(str(v)) ? str(v) : null);

export type CompetitionKind = 'league' | 'cup' | 'friendly';

/** One group of one category of one competition, e.g. "etejp26/M4/4" (Etelä 2026, Miesten Nelonen, group 4). */
export const groupKey = (competitionId: unknown, categoryId: unknown, groupId: unknown): string => `${str(competitionId)}/${str(categoryId)}/${str(groupId)}`;

/** Season year: the competition's own field, else the 4-digit year in its name ("Etelä Jalkapallo 2026"). */
export function seasonOf(o: Json): number | null {
  const s = str(o.competition_season);
  if (/^\d{4}$/.test(s)) return Number(s);
  const m = str(o.competition_name).match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

/** League (official group stage), cup (knockout) or friendly (practice games). */
export function kindOf(o: Json): CompetitionKind {
  if (str(o.competition_officiality) === 'practice' || /harjoitus/i.test(str(o.category_name))) return 'friendly';
  if (/knockout|cup/i.test(str(o.group_type)) || /cup/i.test(str(o.category_name))) return 'cup';
  return 'league';
}

export interface CompetitionRow {
  external_id: string; name: string; category: string; season_label: string; season: number | null; kind: CompetitionKind; group_name: string;
}
/** A competition row from a group of getTeam, or from a game of getMatches (both carry the same fields). */
export function competitionFrom(o: Json): CompetitionRow {
  const season = seasonOf(o);
  return {
    external_id: groupKey(o.competition_id, o.category_id, o.group_id),
    name: str(o.competition_name), category: str(o.category_name), group_name: str(o.group_name),
    season, season_label: season ? String(season) : '', kind: kindOf(o),
  };
}

/** Groups of the team worth syncing: the latest two seasons (so last season's final table stays while the new one starts). */
export function groupsToSync(teamAnswer: Json, seasonsBack = 1): CompetitionRow[] {
  const groups = ((teamAnswer.team as Json | undefined)?.groups ?? []) as Json[];
  const rows = groups.map(competitionFrom).filter((r) => r.season !== null);
  const latest = Math.max(...rows.map((r) => r.season as number));
  const seen = new Set<string>();
  return rows.filter((r) => (r.season as number) >= latest - seasonsBack && !seen.has(r.external_id) && seen.add(r.external_id));
}

export interface StandingRow {
  competition_external_id: string; team_external_id: string; team_name: string; position: number;
  played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number; points: number;
}
export interface TeamRow { external_id: string; name: string; club_name: string; logo_url: string | null }

/** League table of a getGroup answer. Position = the service's current standing (table order when missing). */
export function mapGroup(groupAnswer: Json): { key: string; standings: StandingRow[]; teams: TeamRow[] } {
  const g = (groupAnswer.group ?? {}) as Json;
  const key = groupKey(g.competition_id, g.category_id, g.group_id);
  const rows = ((g.teams ?? []) as Json[]).filter((t) => str(t.team_id) && str(t.team_name));
  const standings = rows.map((t, i) => ({
    competition_external_id: key, team_external_id: str(t.team_id), team_name: str(t.team_name), position: int(t.current_standing) || i + 1,
    played: int(t.matches_played), won: int(t.matches_won), drawn: int(t.matches_tied), lost: int(t.matches_lost),
    goals_for: int(t.goals_for), goals_against: int(t.goals_against), points: int(t.points),
  })).sort((a, b) => a.position - b.position);
  const teams = rows.map((t) => ({ external_id: str(t.team_id), name: str(t.team_name), club_name: str(t.club_name), logo_url: https(t.crest) }));
  return { key, standings, teams };
}

export interface MatchRow {
  external_id: string; competition_external_id: string; home_external_id: string; away_external_id: string; home_name: string; away_name: string;
  kickoff_at: string | null; venue: string | null; status: string; home_goals: number | null; away_goals: number | null;
}

/**
 * Kick-off as an ISO timestamp from the local date, time and UTC offset ("2026-10-01", "18:00:00", "+0300").
 * getMatches writes the offset as "+0300", getMatch as "+03:00": both are accepted.
 */
export function kickoffOf(m: Json): string | null {
  const d = str(m.date), t = str(m.time) || '00:00:00';
  const raw = str(m.time_zone_offset) || '+02:00';
  const off = /^[+-]\d{4}$/.test(raw) ? `${raw.slice(0, 3)}:${raw.slice(3)}` : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}(:\d{2})?$/.test(t) || !/^[+-]\d{2}:\d{2}$/.test(off)) return null;
  const iso = new Date(`${d}T${t.length === 5 ? `${t}:00` : t}${off}`);
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}

/** Status in our words: played, fixture (to be played), cancelled or forfeited. Scores only for games that have one. */
export function statusOf(m: Json): string {
  const s = str(m.status).toLowerCase();
  if (s === 'played') return 'played';
  if (s === 'forfeited' || s === 'walkover') return 'forfeited';
  if (s === 'cancelled' || s === 'canceled' || s === 'postponed') return 'cancelled';
  return 'fixture';
}

export function mapMatches(matchesAnswer: Json, onlyKeys?: Set<string>): { matches: MatchRow[]; competitions: CompetitionRow[] } {
  const all = (matchesAnswer.matches ?? []) as Json[];
  const competitions = new Map<string, CompetitionRow>();
  const matches: MatchRow[] = [];
  for (const m of all) {
    const comp = competitionFrom(m);
    if (onlyKeys && !onlyKeys.has(comp.external_id)) continue;
    if (!str(m.match_id) || !str(m.team_A_name) || !str(m.team_B_name)) continue;
    competitions.set(comp.external_id, comp);
    const status = statusOf(m);
    const scored = status === 'played' || status === 'forfeited';
    matches.push({
      external_id: str(m.match_id), competition_external_id: comp.external_id,
      home_external_id: str(m.team_A_id), away_external_id: str(m.team_B_id), home_name: str(m.team_A_name), away_name: str(m.team_B_name),
      kickoff_at: kickoffOf(m), venue: str(m.venue_name) || null, status,
      home_goals: scored ? intOrNull(m.fs_A) : null, away_goals: scored ? intOrNull(m.fs_B) : null,
    });
  }
  return { matches, competitions: [...competitions.values()] };
}

/** Teams that appear in games (opponents too), so names and crests are known even outside league tables. */
export function teamsFromMatches(matchesAnswer: Json): TeamRow[] {
  const out = new Map<string, TeamRow>();
  for (const m of (matchesAnswer.matches ?? []) as Json[]) {
    for (const side of ['A', 'B'] as const) {
      const id = str(m[`team_${side}_id`]); const name = str(m[`team_${side}_name`]);
      if (id && name && !out.has(id)) out.set(id, { external_id: id, name, club_name: '', logo_url: https(m[`club_${side}_crest`]) });
    }
  }
  return [...out.values()];
}

export type Position = 'goalkeeper' | 'defender' | 'midfielder' | 'forward';
export interface PlayerRow {
  external_id: string; team_external_id: string; display_name: string; shirt_number: number | null; position: Position | null; on_roster: boolean;
}
export interface PlayerStatRow {
  player_external_id: string; competition_external_id: string; appearances: number; goals: number; assists: number; yellow_cards: number; red_cards: number;
}

/** The service writes positions in English ("midfield") or Finnish ("keskikentta", "mv"): map them to the club's four. */
export function positionOf(p: Json): Position | null {
  const v = `${str(p.position_en)} ${str(p.position)} ${str(p.position_fi)}`.toLowerCase();
  if (/goal|maalivahti|\bmv\b/.test(v)) return 'goalkeeper';
  if (/defen|puolustaja/.test(v)) return 'defender';
  if (/midfield|keskikent/.test(v)) return 'midfielder';
  if (/forward|attack|striker|hy[oö]kk/.test(v)) return 'forward';
  return null;
}

/** A player is off the roster once removed (a removal date instead of "0000-00-00 …") or marked inactive. */
const onRoster = (p: Json) => { const removed = str(p.removed); return (!removed || removed.startsWith('0000') || removed === '0') && str(p.inactive) !== '1'; };

/**
 * The team's players (getTeam → team.players): id, name, shirt number, position and whether they are on the current
 * roster. Nothing else is kept (no birth year, nationality, licence or physical data).
 */
export function mapTeamPlayers(teamAnswer: Json): PlayerRow[] {
  const team = (teamAnswer.team ?? {}) as Json;
  const teamId = str(team.team_id);
  return ((team.players ?? []) as Json[])
    .filter((p) => str(p.player_id) && (str(p.first_name) || str(p.last_name)))
    .map((p) => ({
      external_id: str(p.player_id), team_external_id: teamId,
      display_name: [str(p.first_name), str(p.last_name)].filter(Boolean).join(' '),
      shirt_number: intOrNull(p.shirt_number), position: positionOf(p), on_roster: onRoster(p),
    }));
}

const clubStats = (groupAnswer: Json, teamIds: Set<string>): Json[] =>
  (((groupAnswer.group ?? {}) as Json).player_statistics as Json[] | undefined ?? []).filter((s) => teamIds.has(str(s.team_id)) && str(s.player_id));

/**
 * Per-player statistics of one group (getGroup → player_statistics), only for the given (club) teams.
 * Games played are in "matches": the real answer leaves "matches_played" empty.
 */
export function mapGroupPlayerStats(groupAnswer: Json, teamIds: Set<string>): PlayerStatRow[] {
  const g = (groupAnswer.group ?? {}) as Json;
  const key = groupKey(g.competition_id, g.category_id, g.group_id);
  return clubStats(groupAnswer, teamIds).map((s) => ({
    player_external_id: str(s.player_id), competition_external_id: key,
    appearances: int(s.matches) || int(s.matches_played), goals: int(s.goals), assists: int(s.assists),
    yellow_cards: int(s.warnings), red_cards: int(s.suspensions),
  }));
}

/**
 * Players named in a group's statistics (e.g. an earlier season), as off-roster rows: so former players' goals keep a
 * name for the all-time scorers. Only id and name; the sync adds them without touching players it already has.
 */
export function playersFromStats(groupAnswer: Json, teamIds: Set<string>): PlayerRow[] {
  return clubStats(groupAnswer, teamIds).map((s) => ({
    external_id: str(s.player_id), team_external_id: str(s.team_id),
    display_name: [str(s.first_name), str(s.last_name)].filter(Boolean).join(' ') || str(s.player_name),
    shirt_number: null, position: null, on_roster: false,
  })).filter((p) => p.display_name);
}
