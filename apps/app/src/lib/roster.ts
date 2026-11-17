import 'server-only';
import { isPlayerRole } from '@afrofoot/db';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Putting members into teams, shared by Admin → Members (approve with a group, bulk actions) and the team page (add several
 * players at once). Runs as the signed-in admin: RLS (admin_all on players and team_players) still decides.
 */

/** Team categories shown as groups when approving: Men (senior), Women, Junior; the rest under Other. */
export const GROUPS = ['men', 'women', 'junior', 'other'] as const;
export type Group = (typeof GROUPS)[number];
const groupOf = (category: string): Group => (category === 'senior' ? 'men' : category === 'women' ? 'women' : category === 'junior' ? 'junior' : 'other');
export type TeamChoice = { id: string; name: string; group: Group };

/** The current season's teams, sorted Men → Women → Junior → Other, then by name. */
export async function currentTeams(db: SupabaseClient): Promise<TeamChoice[]> {
  const { data } = await db.from('team_seasons').select('id, teams!inner(name, category), seasons!inner(is_current)').eq('seasons.is_current', true);
  const rows = ((data ?? []) as unknown as { id: string; teams: { name: string; category: string } }[]).map((r) => ({ id: r.id, name: r.teams.name, group: groupOf(r.teams.category) }));
  return rows.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.name.localeCompare(b.name));
}

/**
 * The player record of a member with the player role, made from their profile name when there is none yet (approving
 * an account does not create one). Null when the profile is not a player or has no first and last name.
 */
export async function ensurePlayerRecord(db: SupabaseClient, profileId: string): Promise<{ id: string } | { error: 'notPlayer' | 'noName' | 'failed' }> {
  const { data: existing } = await db.from('players').select('id').eq('profile_id', profileId).maybeSingle();
  if (existing) return { id: existing.id };
  const { data: prof } = await db.from('profiles').select('first_name, last_name, role').eq('id', profileId).maybeSingle();
  if (!prof || !isPlayerRole(prof.role)) return { error: 'notPlayer' };
  if (!prof.first_name?.trim() || !prof.last_name?.trim()) return { error: 'noName' };
  const { data, error } = await db.from('players').insert({ profile_id: profileId, first_name: prof.first_name, last_name: prof.last_name, status: 'active', joined_on: today() }).select('id').single();
  if (error || !data) { console.error('[roster] player record refused', { code: error?.code, message: error?.message }); return { error: 'failed' }; }
  return { id: data.id };
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Adds players to a team season: new rows, or reopens the row of someone who had left. Players already in the team are
 * counted as such. Shirt numbers are set afterwards in the roster table.
 */
export async function addToTeam(db: SupabaseClient, teamSeasonId: string, playerIds: string[]): Promise<{ added: number; already: number; failed: number }> {
  const ids = [...new Set(playerIds)];
  if (!ids.length) return { added: 0, already: 0, failed: 0 };
  const { data: rows } = await db.from('team_players').select('id, player_id, left_on').eq('team_season_id', teamSeasonId).in('player_id', ids);
  const byPlayer = new Map((rows ?? []).map((r) => [r.player_id, r]));
  let added = 0, already = 0, failed = 0;
  const fresh = ids.filter((id) => !byPlayer.has(id));
  if (fresh.length) {
    const { error } = await db.from('team_players').insert(fresh.map((player_id) => ({ team_season_id: teamSeasonId, player_id, joined_on: today() })));
    if (error) { console.error('[roster] add refused', { code: error.code, message: error.message }); failed += fresh.length; } else added += fresh.length;
  }
  const back = [...byPlayer.values()].filter((r) => r.left_on);
  already += byPlayer.size - back.length;
  if (back.length) {
    const { error } = await db.from('team_players').update({ left_on: null, jersey_number: null, joined_on: today() }).in('id', back.map((r) => r.id));
    if (error) failed += back.length; else added += back.length;
  }
  return { added, already, failed };
}
