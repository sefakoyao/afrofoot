import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/AppShell';
import { PlayerTabs } from '@/components/PlayerTabs';
import { requireArea } from '@/lib/auth';
import { loadConductStatus } from '@/lib/conduct';
import { myContracts } from '@/lib/contracts';
import { isolate } from '@/lib/format';
import { loadPlayerSport } from '@/lib/player';
import { getSupabase } from '@/lib/supabase/server';

/** Player area: who you are (team, position, shirt), then the tabs; the Code of Conduct reminder shows until you agree. */
export default async function Layout({ children }: { children: ReactNode }) {
  const member = await requireArea('me');
  const [t, ta, tpos, tn, supabase] = await Promise.all([getTranslations('me'), getTranslations('app'), getTranslations('position'), getTranslations('nav'), getSupabase()]);
  const [summary, sport, conduct, contracts] = supabase
    ? await Promise.all([supabase.rpc('my_payment_summary'), loadPlayerSport(supabase, member.id), loadConductStatus(supabase, member.id), myContracts(supabase)])
    : [null, null, null, []];
  const team = ((summary?.data as { team_name: string | null }[] | null) ?? [])[0]?.team_name ?? null;
  return (
    <AppShell area="me" member={member} tabs={[
      { href: '/me', label: tn('barHome'), icon: 'home', exact: true },
      { href: '/me/membership', label: tn('barFees'), icon: 'card', badge: contracts.some((c) => c.status === 'sent') || (!!conduct?.version && !conduct.agreedAt) ? 1 : 0 },
      { href: '/me/season', label: tn('barSeason'), icon: 'trophy' },
      { href: '/me/quiz', label: tn('barQuiz'), icon: 'quiz' },
      { href: '/me/profile', label: tn('barMe'), icon: 'user' },
    ]}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <header>
          <h1 className="font-display text-xl font-extrabold md:text-2xl">{ta('welcome', { name: isolate(member.firstName || member.email || member.phone || '') })}</h1>
          <p className="mt-0.5 text-sm text-muted md:mt-1 md:text-base" data-player-header>{t('team')}: <span className="font-semibold text-fg">{team ?? t('noTeam')}</span>
            {sport?.position ? <> · {tpos(sport.position)}</> : null}{sport?.shirt ? <> · <bdi dir="ltr">#{sport.shirt}</bdi></> : null}</p>
        </header>
        <PlayerTabs conductMissing={!!conduct?.version && !conduct.agreedAt} contractToSign={contracts.find((c) => c.status === 'sent')?.id ?? null} />
        <div>{children}</div>
      </div>
    </AppShell>
  );
}
