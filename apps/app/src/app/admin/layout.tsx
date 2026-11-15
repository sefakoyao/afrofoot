import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/AppShell';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

export default async function Layout({ children }: { children: ReactNode }) {
  const member = await requireArea('admin');
  const [t, supabase] = await Promise.all([getTranslations('admin'), getSupabase()]);
  const pending = supabase ? (await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')).count ?? 0 : 0;
  const toCountersign = supabase ? (await supabase.from('player_contracts').select('id', { count: 'exact', head: true }).eq('status', 'player_signed')).count ?? 0 : 0;
  const nav = [
    { href: '/admin', label: t('navOverview') },
    { href: '/admin/members', label: t('navMembers'), badge: pending },
    { href: '/admin/teams', label: t('navTeams') },
    { href: '/admin/events', label: t('navEvents') },
    { href: '/admin/invoices', label: t('navInvoices') },
    { href: '/admin/contracts', label: t('navContracts'), badge: toCountersign },
    { href: '/admin/audit', label: t('navAudit') },
  ];
  return <AppShell area="admin" member={member} nav={nav}>{children}</AppShell>;
}
