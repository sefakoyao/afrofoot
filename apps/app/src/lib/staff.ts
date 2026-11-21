import 'server-only';
import { requireArea } from '@/lib/auth';
import { myTeams, type CoachTeam } from '@/lib/coach';
import { permissionsOf, type Permission } from '@/lib/permissions';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Pages shared by the Admin and Coach areas (Teams & events, Website → Matchday poster). An admin sees the whole club;
 * a coach sees the teams they coach this season and only the buttons the database lets coaches use (RLS decides anyway).
 */
export type Scope = { area: 'admin'; teams?: undefined; perms?: undefined } | { area: 'coach'; teams: CoachTeam[]; /** rights granted by an admin (0070) */ perms: Set<Permission> };

export async function coachScope(): Promise<Extract<Scope, { area: 'coach' }>> {
  const member = await requireArea('coach');
  const supabase = await getSupabase();
  const [teams, perms] = supabase ? await Promise.all([myTeams(supabase, member.id), permissionsOf(supabase, member.id)]) : [[], new Set<Permission>()];
  return { area: 'coach', teams, perms };
}

/** True when a row of this team season belongs on the page (admins: every team). */
export const inScope = (scope: Scope, teamSeasonId: string | null) => scope.area === 'admin' || (!!teamSeasonId && scope.teams.some((t) => t.id === teamSeasonId));

/** Admins always; a coach only with the right (0070). */
export const may = (scope: Scope, p: Permission) => scope.area === 'admin' || scope.perms.has(p);
