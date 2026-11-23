import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Player announcement posters (Admin → Website → Player announcement): a new signing or a farewell, for one player.
 * The website's rule decides who can be chosen: every player except those who removed themselves from the club website
 * (players.website_hidden, opt-out since migration 0042). A database without 0042 falls back to the older consent
 * (players.show_publicly).
 * Farewell numbers come from Palloliitto when the player is linked to their Palloliitto entry (federation_players.player_id,
 * set on Admin → Palloliitto players): the official league and cup games and goals the nightly sync stored, and the
 * first and last season. Otherwise from the app's own records. Former players who never had an app account can be
 * chosen from the Palloliitto data ("fed:<id>"); players hidden by the club (federation_players.hidden) never. The details
 * come from the club's data: shirt number (latest team), position, nationality, and for a farewell the seasons, games
 * (match squads of played games) and goals (not voided). The message, previous club and contract end are typed by the admin.
 */
export const ANNOUNCE_KINDS = ['welcome', 'farewell'] as const;
export type AnnounceKind = (typeof ANNOUNCE_KINDS)[number];
export const SAMPLE_PLAYER = 'sample';
/** A player known only from Palloliitto's data: "fed:" and the service's player id. */
export const FED_PREFIX = 'fed:';
export const FED_ID = /^fed:[\w-]{1,60}$/;
export type StatsSource = 'palloliitto' | 'app';
export const ANNOUNCE_LIMITS = { message: 160, from: 40, until: 20 } as const;
/** The line used when the admin leaves the message empty. */
export const DEFAULT_MESSAGE: Record<AnnounceKind, string> = {
  welcome: 'Welcome to the club! We can’t wait to see you on the pitch.',
  farewell: 'Thank you for the shared memories.',
};

export type AnnouncePlayer = {
  firstName: string; lastName: string; shirt: number | null; position: string | null; nationality: string | null;
  seasons: { from: number; to: number } | null; games: number; goals: number;
  /** where seasons, games and goals come from (null: the sample) */
  source: StatsSource | null;
};

export function samplePlayer(kind: AnnounceKind): AnnouncePlayer {
  return kind === 'welcome'
    ? { firstName: 'Kwame', lastName: 'Virtanen', shirt: 17, position: 'midfielder', nationality: 'GH', seasons: null, games: 0, goals: 0, source: null }
    : { firstName: 'Yusuf', lastName: 'Ahmed', shirt: 9, position: 'forward', nationality: 'FI', seasons: { from: 2021, to: 2026 }, games: 84, goals: 23, source: null };
}

/** The players who can be announced (not hidden from the website), by surname; former players too, for a farewell. */
export async function announceablePlayers(db: SupabaseClient) {
  const list = (col: 'website_hidden' | 'show_publicly') =>
    db.from('players').select('id, first_name, last_name').eq(col, col === 'show_publicly').order('last_name').order('first_name').limit(1000);
  let { data, error } = await list('website_hidden');
  if (error?.code === '42703') ({ data, error } = await list('show_publicly'));   // before migration 0042
  if (error) console.error('[announce] players refused', { code: error.code, message: error.message });
  return (data ?? []) as { id: string; first_name: string; last_name: string }[];
}

/**
 * Former and current players known only from Palloliitto (not linked to an app player, not hidden by the club, with
 * official games for the club), for a farewell. Empty when the Palloliitto sync is not installed.
 */
export async function palloliittoOnlyPlayers(db: SupabaseClient) {
  const clubTeams = await clubTeamIds(db);
  if (!clubTeams.length) return [];
  const { data, error } = await db.from('federation_players').select('external_id, display_name')
    .is('player_id', null).eq('hidden', false).in('team_external_id', clubTeams).order('display_name').limit(1000);
  if (error || !data?.length) return [];
  // only those with official games for the club
  const { data: stats } = await db.from('federation_player_stats').select('player_external_id').in('player_external_id', data.map((x) => x.external_id)).gt('appearances', 0);
  const played = new Set(((stats ?? []) as { player_external_id: string }[]).map((x) => x.player_external_id));
  return (data as { external_id: string; display_name: string }[]).filter((x) => played.has(x.external_id)).map((x) => ({ id: `${FED_PREFIX}${x.external_id}`, name: x.display_name }));
}

// The Palloliitto tables are filled by the sync and have no foreign keys between them: each step is its own query.
async function clubTeamIds(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from('federation_teams').select('external_id').eq('is_club', true);
  return error ? [] : ((data ?? []) as { external_id: string }[]).map((x) => x.external_id);
}

type FedTotals = { seasons: { from: number; to: number } | null; games: number; goals: number; shirt: number | null; name: string; position: string | null };
/** Official league and cup totals of one Palloliitto player of the club (null without games, hidden, or no sync). */
async function palloliittoTotals(db: SupabaseClient, by: { player: string } | { external: string }): Promise<FedTotals | null> {
  const clubTeams = await clubTeamIds(db);
  if (!clubTeams.length) return null;
  let q = db.from('federation_players').select('external_id, display_name, shirt_number, position, hidden').in('team_external_id', clubTeams);
  q = 'player' in by ? q.eq('player_id', by.player) : q.eq('external_id', by.external);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error || !data) return null;
  const fp = data as { external_id: string; display_name: string; shirt_number: number | null; position: string | null; hidden: boolean };
  if (fp.hidden) return null;
  const { data: st } = await db.from('federation_player_stats').select('competition_external_id, appearances, goals').eq('player_external_id', fp.external_id);
  const stats = (st ?? []) as { competition_external_id: string; appearances: number; goals: number }[];
  if (!stats.length) return null;
  const { data: comps } = await db.from('federation_competitions').select('external_id, season, kind').in('external_id', stats.map((x) => x.competition_external_id));
  const comp = new Map(((comps ?? []) as { external_id: string; season: number | null; kind: string }[]).map((c) => [c.external_id, c]));
  const rows = stats.filter((x) => ['league', 'cup'].includes(comp.get(x.competition_external_id)?.kind ?? ''));
  const games = rows.reduce((a, x) => a + (x.appearances ?? 0), 0);
  if (!games) return null;
  const years = rows.filter((x) => x.appearances > 0).map((x) => comp.get(x.competition_external_id)?.season).filter((y): y is number => !!y);
  return {
    seasons: years.length ? { from: Math.min(...years), to: Math.max(...years) } : null, games, goals: rows.reduce((a, x) => a + (x.goals ?? 0), 0),
    shirt: fp.shirt_number, name: fp.display_name, position: fp.position,
  };
}

/** A player known only from Palloliitto (farewell): name, shirt, position and totals; the surname is the last word. */
export async function loadPalloliittoPlayer(db: SupabaseClient, id: string): Promise<AnnouncePlayer | null> {
  if (!FED_ID.test(id)) return null;
  const t = await palloliittoTotals(db, { external: id.slice(FED_PREFIX.length) });
  if (!t) return null;
  const parts = t.name.trim().split(/\s+/);
  return { firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : '', lastName: parts.at(-1) ?? t.name, shirt: t.shirt, position: t.position, nationality: null,
    seasons: t.seasons, games: t.games, goals: t.goals, source: 'palloliitto' };
}

export async function loadAnnouncePlayer(db: SupabaseClient, id: string): Promise<AnnouncePlayer | null> {
  const cols = 'first_name, last_name, position, nationality';
  let r = await db.from('players').select(`${cols}, website_hidden`).eq('id', id).maybeSingle();
  let allowed = (x: Record<string, unknown>) => x.website_hidden !== true;
  if (r.error?.code === '42703') { r = await db.from('players').select(`${cols}, show_publicly`).eq('id', id).maybeSingle(); allowed = (x) => x.show_publicly === true; }
  const p = r.data as { first_name: string; last_name: string; position: string | null; nationality: string[] | null } | null;
  if (!p || !allowed(p as unknown as Record<string, unknown>)) return null;
  const [{ data: teams }, { data: squads }, { count: goals }] = await Promise.all([
    db.from('team_players').select('jersey_number, team_seasons!inner(seasons!inner(starts_on, ends_on))').eq('player_id', id),
    db.from('match_squad').select('match_id, matches!inner(status)').eq('player_id', id).in('status', ['starter', 'substitute']).eq('matches.status', 'played'),
    db.from('match_events').select('id', { count: 'exact', head: true }).eq('player_id', id).eq('side', 'us').eq('voided', false).in('type', ['goal', 'penalty_scored']),
  ]);
  const rows = ((teams ?? []) as unknown as { jersey_number: number | null; team_seasons: { seasons: { starts_on: string; ends_on: string } } }[])
    .sort((a, b) => b.team_seasons.seasons.starts_on.localeCompare(a.team_seasons.seasons.starts_on));
  const years = rows.flatMap((r) => [Number(r.team_seasons.seasons.starts_on.slice(0, 4)), Number(r.team_seasons.seasons.ends_on.slice(0, 4))]);
  const shirt = rows.find((r) => r.jersey_number != null)?.jersey_number ?? null;
  const base = { firstName: p.first_name, lastName: p.last_name, position: p.position, nationality: (p.nationality as string[] | null)?.[0] ?? null };
  // linked to Palloliitto: the official league and cup totals
  const fed = await palloliittoTotals(db, { player: id });
  if (fed) return { ...base, shirt: shirt ?? fed.shirt, seasons: fed.seasons, games: fed.games, goals: fed.goals, source: 'palloliitto' };
  return {
    ...base, shirt, seasons: years.length ? { from: Math.min(...years), to: Math.max(...years) } : null,
    games: new Set(((squads ?? []) as { match_id: string }[]).map((s) => s.match_id)).size, goals: goals ?? 0, source: 'app',
  };
}
