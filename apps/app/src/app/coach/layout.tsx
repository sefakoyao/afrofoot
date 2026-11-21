import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell, type NavItem } from '@/components/AppShell';
import { requireArea } from '@/lib/auth';
import { myTeams } from '@/lib/coach';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Coach area menu: Overview; "My teams" (one entry per team the coach is assigned to this season); "Teams & events"
 * (events, line-ups, tasks, shirt numbers, opponents, Palloliitto players, for the coach's teams: components/staff);
 * tryout requests and enrolments, read only); "Website" (Matchday poster); Code of Conduct. Grouped sections open and close (components/AreaNav).
 */
export default async function Layout({ children }: { children: ReactNode }) {
  const member = await requireArea('coach');
  const [t, supabase] = await Promise.all([getTranslations('coach'), getSupabase()]);
  const teams = supabase ? await myTeams(supabase, member.id) : [];
  const [tc, ta, tf, tn, tl] = await Promise.all([getTranslations('conduct'), getTranslations('admin'), getTranslations('fed'), getTranslations('content'), getTranslations('lineups')]);
  // open shirt-number requests of the coach's teams (RLS staff_read: coaches see their own teams' requests)
  const shirtRequests = supabase && teams.length
    ? (await supabase.from('jersey_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').in('team_season_id', teams.map((x) => x.id))).count ?? 0 : 0;
  // new tryout requests and team enrolments (migration 0066: coaches read them through coach_requests)
  const newRequests = supabase ? ((await supabase.rpc('coach_requests')).data as { status: string }[] | null ?? []).filter((r) => r.status === 'new').length : 0;
  const tcr = await getTranslations('creq');
  const tev = ta('navGroupTeams'), web = tn('navGroup');
  // Overview, then the coach's teams grouped under "My teams", then the Code of Conduct
  const nav: NavItem[] = [
    { href: '/coach', label: t('navHome'), icon: 'home' },
    ...teams.map((x): NavItem => ({ href: `/coach/teams/${x.id}`, label: x.name, group: t('navMyTeams'), icon: 'team', groupIcon: 'users' })),
    { href: '/coach/events', label: ta('navEvents'), group: tev, icon: 'calendar', groupIcon: 'ball' },
    { href: '/coach/lineups', label: tl('nav'), group: tev, icon: 'lineup' },
    { href: '/coach/requests', label: tcr('nav'), badge: newRequests, group: tev, icon: 'inbox' },
    { href: '/coach/tasks', label: ta('navTasks'), group: tev, icon: 'tasks' },
    { href: '/coach/shirts', label: ta('navShirts'), badge: shirtRequests, group: tev, icon: 'shirt' },
    { href: '/coach/opponents', label: ta('navOpponents'), group: tev, icon: 'versus' },
    { href: '/coach/palloliitto', label: tf('nav'), group: tev, icon: 'link' },
    { href: '/coach/poster', label: tn('navPoster'), group: web, icon: 'image', groupIcon: 'star' },
    { href: '/coach/conduct', label: tc('title'), icon: 'handshake' },
  ];
  const tbar = await getTranslations('nav');
  return (
    <AppShell area="coach" member={member} nav={nav} tabs={[
      { href: '/coach', label: tbar('barHome'), icon: 'home', exact: true },
      { href: '/coach/events', label: tbar('barEvents'), icon: 'calendar' },
      { href: '/coach/lineups', label: tbar('barLineups'), icon: 'lineup' },
      { href: '/coach/tasks', label: tbar('barTasks'), icon: 'tasks' },
    ]}>{children}</AppShell>
  );
}
