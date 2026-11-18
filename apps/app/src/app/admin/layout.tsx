import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/AppShell';
import { requireArea } from '@/lib/auth';
import { newRequestCount } from '@/lib/requests';
import { getSupabase } from '@/lib/supabase/server';

export default async function Layout({ children }: { children: ReactNode }) {
  const member = await requireArea('admin');
  const [t, tf, supabase] = await Promise.all([getTranslations('admin'), getTranslations('fed'), getSupabase()]);
  const pending = supabase ? (await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')).count ?? 0 : 0;
  const toCountersign = supabase ? (await supabase.from('player_contracts').select('id', { count: 'exact', head: true }).eq('status', 'player_signed')).count ?? 0 : 0;
  const requests = supabase ? await newRequestCount(supabase) : 0;
  const nav = [
    { href: '/admin', label: t('navOverview') },
    { href: '/admin/requests', label: t('navRequests'), badge: requests },
    { href: '/admin/members', label: t('navMembers'), badge: pending },
    { href: '/admin/signin-help', label: t('navSigninHelp') },
    { href: '/admin/teams', label: t('navTeams') },
    { href: '/admin/events', label: t('navEvents') },
    { href: '/admin/palloliitto', label: tf('nav') },
    { href: '/admin/invoices', label: t('navInvoices') },
    { href: '/admin/contracts', label: t('navContracts'), badge: toCountersign },
    { href: '/admin/quiz', label: t('navQuiz') },
    { href: '/admin/audit', label: t('navAudit') },
  ];
  return <AppShell area="admin" member={member} nav={nav}>{children}</AppShell>;
}
