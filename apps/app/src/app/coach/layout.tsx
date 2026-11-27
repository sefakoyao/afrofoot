import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell, type NavItem } from '@/components/AppShell';
import { requireArea } from '@/lib/auth';
import { BirthPrompt } from '@/components/birth/BirthDate';
import { SignReminder } from '@/components/SignReminder';
import { birthLabels, maxBirthDate } from '@/lib/birth';
import { loadConductStatus } from '@/lib/conduct';
import { myContracts } from '@/lib/contracts';
import { isPlayerRole } from '@afrofoot/db';
import { myTeams } from '@/lib/coach';
import { permissionsOf } from '@/lib/permissions';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Coach area menu: Overview; "My teams" (one entry per team the coach is assigned to this season); "Teams & events"
 * (events, saved places, line-ups, tasks, shirt numbers, opponents, Palloliitto players, for the coach's teams: components/staff);
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
  // rights an admin granted (0070): their pages join the menu
  const perms = supabase ? await permissionsOf(supabase, member.id) : new Set<string>();
  const tperm = await getTranslations('perm');
  const tplc = await getTranslations('places');
  // Overview, then the coach's teams grouped under "My teams", then the Code of Conduct
  const nav: NavItem[] = [
    { href: '/coach', label: t('navHome'), icon: 'home' },
    ...teams.map((x): NavItem => ({ href: `/coach/teams/${x.id}`, label: x.name, group: t('navMyTeams'), icon: 'team', groupIcon: 'users' })),
    { href: '/coach/events', label: ta('navEvents'), group: tev, icon: 'calendar', groupIcon: 'ball' },
    { href: '/coach/places', label: tplc('nav'), group: tev, icon: 'pin' },
    { href: '/coach/lineups', label: tl('nav'), group: tev, icon: 'lineup' },
    { href: '/coach/requests', label: tcr('nav'), badge: newRequests, group: tev, icon: 'inbox' },
    { href: '/coach/tasks', label: ta('navTasks'), group: tev, icon: 'tasks' },
    ...(perms.has('contracts') ? [{ href: '/coach/contracts', label: tperm('contractsTitle'), group: tev, icon: 'contract' } as NavItem] : []),
    ...(perms.has('fees') ? [{ href: '/coach/fees', label: tperm('feesTitle'), group: tev, icon: 'euro' } as NavItem] : []),
    { href: '/coach/shirts', label: ta('navShirts'), badge: shirtRequests, group: tev, icon: 'shirt' },
    { href: '/coach/opponents', label: ta('navOpponents'), group: tev, icon: 'versus' },
    { href: '/coach/palloliitto', label: tf('nav'), group: tev, icon: 'link' },
    { href: '/coach/poster', label: tn('navPoster'), group: web, icon: 'image', groupIcon: 'star' },
    { href: '/coach/conduct', label: tc('title'), icon: 'handshake' },
  ];
  const tbar = await getTranslations('nav');
  // a player-coach also signs a player contract and the Code of Conduct: the same pop-up once per sign-in
  const [conduct, contracts, tr] = await Promise.all([
    supabase ? loadConductStatus(supabase, member.id) : null, supabase && isPlayerRole(member.role) ? myContracts(supabase) : [], getTranslations('signReminder'),
  ]);
  const toSign = contracts.find((c) => c.status === 'sent')?.id ?? null;
  // 0073: a player-coach without a saved birth date is asked for it first
  const myPlayer = supabase && isPlayerRole(member.role) ? (await supabase.from('players').select('date_of_birth').eq('profile_id', member.id).maybeSingle()).data : null;
  const needsBirth = !!myPlayer && !myPlayer.date_of_birth;
  const reminder = needsBirth ? <BirthPrompt userId={member.id} max={maxBirthDate()} labels={await birthLabels()} /> : <SignReminder userId={member.id} contractHref={toSign ? `/me/contract/${toSign}#sign` : null} conductHref={conduct?.version && !conduct.agreedAt ? '/coach/conduct#coaches' : null}
    labels={{ title: tr('title'), lead: tr('lead'), contract: tr('contract'), contractCta: tr('contractCta'), conduct: tr('conduct'), conductCta: tr('conductCta'), later: tr('later') }} />;
  return (
    <AppShell area="coach" member={member} nav={nav} tabs={[
      { href: '/coach', label: tbar('barHome'), icon: 'home', exact: true },
      { href: '/coach/events', label: tbar('barEvents'), icon: 'calendar' },
      { href: '/coach/lineups', label: tbar('barLineups'), icon: 'lineup' },
      { href: '/coach/tasks', label: tbar('barTasks'), icon: 'tasks' },
    ]}>{reminder}{children}</AppShell>
  );
}
