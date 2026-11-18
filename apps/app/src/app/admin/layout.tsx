import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/AppShell';
import { requireArea } from '@/lib/auth';
import { newRequestCount } from '@/lib/requests';
import { getSupabase } from '@/lib/supabase/server';

export default async function Layout({ children }: { children: ReactNode }) {
  const member = await requireArea('admin');
  const [t, tf, tm, supabase] = await Promise.all([getTranslations('admin'), getTranslations('fed'), getTranslations('fin'), getSupabase()]);
  const pending = supabase ? (await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')).count ?? 0 : 0;
  const toCountersign = supabase ? (await supabase.from('player_contracts').select('id', { count: 'exact', head: true }).eq('status', 'player_signed')).count ?? 0 : 0;
  const requests = supabase ? await newRequestCount(supabase) : 0;
  const shirtRequests = supabase ? (await supabase.from('jersey_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')).count ?? 0 : 0;
  // grouped sections that open and close (components/AreaNav): only the section holding the current page is open
  const people = t('navGroupPeople'), teamsGroup = t('navGroupTeams'), club = t('navGroupClub'), finance = tm('navGroup');
  const nav = [
    { href: '/admin', label: t('navOverview') },
    { href: '/admin/requests', label: t('navRequests'), badge: requests, group: people },
    { href: '/admin/members', label: t('navMembers'), badge: pending, group: people },
    { href: '/admin/signin-help', label: t('navSigninHelp'), group: people },
    { href: '/admin/contracts', label: t('navContracts'), badge: toCountersign, group: people },
    { href: '/admin/teams', label: t('navTeams'), group: teamsGroup },
    { href: '/admin/events', label: t('navEvents'), group: teamsGroup },
    { href: '/admin/palloliitto', label: tf('nav'), group: teamsGroup },
    { href: '/admin/shirts', label: t('navShirts'), badge: shirtRequests, group: teamsGroup },
    { href: '/admin/finance', label: tm('navOverview'), group: finance, exact: true },
    { href: '/admin/finance/balances', label: tm('navBalances'), group: finance },
    { href: '/admin/invoices', label: t('navInvoices'), group: finance },
    { href: '/admin/finance/expenses', label: tm('navExpenses'), group: finance },
    { href: '/admin/quiz', label: t('navQuiz'), group: club },
    { href: '/admin/audit', label: t('navAudit'), group: club },
  ];
  return <AppShell area="admin" member={member} nav={nav}>{children}</AppShell>;
}
