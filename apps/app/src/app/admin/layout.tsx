import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell, type NavItem } from '@/components/AppShell';
import { requireArea } from '@/lib/auth';
import { newRequestCount } from '@/lib/requests';
import { getSupabase } from '@/lib/supabase/server';

export default async function Layout({ children }: { children: ReactNode }) {
  const member = await requireArea('admin');
  const [t, tf, tm, tc, supabase] = await Promise.all([getTranslations('admin'), getTranslations('fed'), getTranslations('fin'), getTranslations('content'), getSupabase()]);
  const pending = supabase ? (await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')).count ?? 0 : 0;
  const toCountersign = supabase ? (await supabase.from('player_contracts').select('id', { count: 'exact', head: true }).eq('status', 'player_signed')).count ?? 0 : 0;
  const requests = supabase ? await newRequestCount(supabase) : 0;
  const newSuggestions = supabase ? (await supabase.from('article_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'new')).count ?? 0 : 0;
  const shirtRequests = supabase ? (await supabase.from('jersey_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')).count ?? 0 : 0;
  // grouped sections that open and close (components/AreaNav): only the section holding the current page is open
  const people = t('navGroupPeople'), teamsGroup = t('navGroupTeams'), club = t('navGroupClub'), finance = tm('navGroup');
  const nav: NavItem[] = [
    { href: '/admin', label: t('navOverview'), icon: 'home' },
    { href: '/admin/requests', label: t('navRequests'), badge: requests, group: people, icon: 'inbox', groupIcon: 'users' },
    { href: '/admin/members', label: t('navMembers'), badge: pending, group: people, icon: 'users' },
    { href: '/admin/signin-help', label: t('navSigninHelp'), group: people, icon: 'key' },
    { href: '/admin/contracts', label: t('navContracts'), badge: toCountersign, group: people, icon: 'contract' },
    { href: '/admin/teams', label: t('navTeams'), group: teamsGroup, icon: 'team', groupIcon: 'ball' },
    { href: '/admin/events', label: t('navEvents'), group: teamsGroup, icon: 'calendar' },
    { href: '/admin/palloliitto', label: tf('nav'), group: teamsGroup, icon: 'link' },
    { href: '/admin/shirts', label: t('navShirts'), badge: shirtRequests, group: teamsGroup, icon: 'shirt' },
    { href: '/admin/opponents', label: t('navOpponents'), group: teamsGroup, icon: 'versus' },
    { href: '/admin/tasks', label: t('navTasks'), group: teamsGroup, icon: 'tasks' },
    { href: '/admin/content', label: tc('navSuggestions'), badge: newSuggestions, group: tc('navGroup'), exact: true, icon: 'star', groupIcon: 'star' },
    { href: '/admin/content/news', label: tc('navNews'), group: tc('navGroup'), icon: 'list' },
    { href: '/admin/content/poster', label: tc('navPoster'), group: tc('navGroup'), icon: 'image' },
    { href: '/admin/finance', label: tm('navOverview'), group: finance, exact: true, icon: 'chart', groupIcon: 'euro' },
    { href: '/admin/finance/balances', label: tm('navBalances'), group: finance, icon: 'scale' },
    { href: '/admin/invoices', label: t('navInvoices'), group: finance, icon: 'receipt' },
    { href: '/admin/finance/expenses', label: tm('navExpenses'), group: finance, icon: 'coins' },
    { href: '/admin/finance/past', label: tm('navPast'), group: finance, icon: 'history' },
    { href: '/admin/quiz', label: t('navQuiz'), group: club, icon: 'quiz', groupIcon: 'star' },
    { href: '/admin/audit', label: t('navAudit'), group: club, icon: 'list' },
  ];
  return <AppShell area="admin" member={member} nav={nav}>{children}</AppShell>;
}
