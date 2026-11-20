import 'server-only';
import { requireArea } from '@/lib/auth';
import { myTeams, type CoachTeam } from '@/lib/coach';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Pages shared by the Admin and Coach areas (Teams & events, Website → Matchday poster). An admin sees the whole club;
 * a coach sees the teams they coach this season and only the buttons the database lets coaches use (RLS decides anyway).
 */
export type Scope = { area: 'admin'; teams?: undefined } | { area: 'coach'; teams: CoachTeam[] };

export async function coachScope(): Promise<Scope> {
  const member = await requireArea('coach');
  const supabase = await getSupabase();
  return { area: 'coach', teams: supabase ? await myTeams(supabase, member.id) : [] };
}

/** True when a row of this team season belongs on the page (admins: every team). */
export const inScope = (scope: Scope, teamSeasonId: string | null) => scope.area === 'admin' || (!!teamSeasonId && scope.teams.some((t) => t.id === teamSeasonId));
