import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { HOME_BY_ROLE, canEnter, isAdminRole } from '@afrofoot/db';
import { AppShell, type NavItem } from '@/components/AppShell';
import { requireMember } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/**
 * The communications people's pages (content assistant, migration 0064): Suggestions and News. Admins use the same pages
 * under Admin → Website. Anyone else goes back to their own area; the database checks every action (app.can_publish).
 */
export default async function Layout({ children }: { children: ReactNode }) {
  const member = await requireMember('/content');
  if (isAdminRole(member.role)) redirect('/admin/content');
  const supabase = await getSupabase();
  const { data: ok } = supabase ? await supabase.rpc('can_publish') : { data: false };
  if (!ok) redirect(HOME_BY_ROLE[member.role]);
  const t = await getTranslations('content');
  const nav: NavItem[] = [
    { href: '/content', label: t('navSuggestions'), icon: 'star', exact: true },
    { href: '/content/news', label: t('navNews'), icon: 'list' },
  ];
  return <AppShell area={canEnter(member.role, 'coach') ? 'coach' : 'me'} member={member} nav={nav}>{children}</AppShell>;
}
