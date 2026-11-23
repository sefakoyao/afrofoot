import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Player announcement posters (Admin → Website → Player announcement): a new signing or a farewell, for one player.
 * The website's rule decides who can be chosen: every player except those who removed themselves from the club website
 * (players.website_hidden, opt-out since migration 0042). A database without 0042 falls back to the older consent
 * (players.show_publicly). The details
 * come from the club's data: shirt number (latest team), position, nationality, and for a farewell the seasons, games
 * (match squads of played games) and goals (not voided). The message, previous club and contract end are typed by the admin.
 */
export const ANNOUNCE_KINDS = ['welcome', 'farewell'] as const;
export type AnnounceKind = (typeof ANNOUNCE_KINDS)[number];
export const SAMPLE_PLAYER = 'sample';
export const ANNOUNCE_LIMITS = { message: 160, from: 40, until: 20 } as const;
/** The line used when the admin leaves the message empty. */
export const DEFAULT_MESSAGE: Record<AnnounceKind, string> = {
  welcome: 'Welcome to the club! We can’t wait to see you on the pitch.',
  farewell: 'Thank you for the shared memories.',
};

export type AnnouncePlayer = {
  firstName: string; lastName: string; shirt: number | null; position: string | null; nationality: string | null;
  seasons: { from: number; to: number } | null; games: number; goals: number;
};

export function samplePlayer(kind: AnnounceKind): AnnouncePlayer {
  return kind === 'welcome'
    ? { firstName: 'Kwame', lastName: 'Virtanen', shirt: 17, position: 'midfielder', nationality: 'GH', seasons: null, games: 0, goals: 0 }
    : { firstName: 'Yusuf', lastName: 'Ahmed', shirt: 9, position: 'forward', nationality: 'FI', seasons: { from: 2021, to: 2026 }, games: 84, goals: 23 };
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
  return {
    firstName: p.first_name, lastName: p.last_name, position: p.position, nationality: (p.nationality as string[] | null)?.[0] ?? null,
    shirt: rows.find((r) => r.jersey_number != null)?.jersey_number ?? null,
    seasons: years.length ? { from: Math.min(...years), to: Math.max(...years) } : null,
    games: new Set(((squads ?? []) as { match_id: string }[]).map((s) => s.match_id)).size, goals: goals ?? 0,
  };
}
