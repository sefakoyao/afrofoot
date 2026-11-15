import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Teams the signed-in coach is assigned to in the current season (team_staff → staff_members.profile_id). */
export interface CoachTeam { id: string; name: string; division: string | null; season: string }

export async function myTeams(db: SupabaseClient, profileId: string): Promise<CoachTeam[]> {
  const { data } = await db.from('team_staff')
    .select('team_seasons!inner(id, division, teams!inner(name), seasons!inner(name, is_current)), staff_members!inner(profile_id)')
    .eq('staff_members.profile_id', profileId).eq('team_seasons.seasons.is_current', true);
  type Row = { team_seasons: { id: string; division: string | null; teams: { name: string }; seasons: { name: string } } };
  return ((data as unknown as Row[] | null) ?? []).map((r) => ({ id: r.team_seasons.id, name: r.team_seasons.teams.name, division: r.team_seasons.division, season: r.team_seasons.seasons.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** True when the coach is assigned to this team season. The database checks the same (app.coaches_ts) on every read and write. */
export async function coachesTeam(db: SupabaseClient, profileId: string, teamSeasonId: string): Promise<boolean> {
  return (await myTeams(db, profileId)).some((t) => t.id === teamSeasonId);
}

export const ATTENDANCE = ['present', 'late', 'absent', 'excused'] as const;
export type Attendance = (typeof ATTENDANCE)[number];
