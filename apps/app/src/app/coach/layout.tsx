import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/AppShell';
import { requireArea } from '@/lib/auth';
import { myTeams } from '@/lib/coach';
import { getSupabase } from '@/lib/supabase/server';

/** Coach area menu: Overview, "My teams" (one entry per team the coach is assigned to this season), Places, Code of Conduct. */
export default async function Layout({ children }: { children: ReactNode }) {
  const member = await requireArea('coach');
  const [t, supabase] = await Promise.all([getTranslations('coach'), getSupabase()]);
  const teams = supabase ? await myTeams(supabase, member.id) : [];
  const [tc, tp] = await Promise.all([getTranslations('conduct'), getTranslations('places')]);
  // Overview, then the coach's teams grouped under "My teams", then Places and the Code of Conduct
  const nav = [
    { href: '/coach', label: t('navHome') },
    ...teams.map((x) => ({ href: `/coach/teams/${x.id}`, label: x.name, group: t('navMyTeams') })),
    { href: '/coach/places', label: tp('nav') },
    { href: '/coach/conduct', label: tc('title') },
  ];
  return <AppShell area="coach" member={member} nav={nav}>{children}</AppShell>;
}
