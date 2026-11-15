'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Spinner } from './AreaNav';
import { usePendingHref } from './usePendingHref';

/**
 * Player area tabs (Calendar, Membership, My season) and, until the player has agreed to the current Code of Conduct,
 * a reminder on every tab except the Code of Conduct page itself; likewise for a contract waiting for the player's signature.
 */
export function PlayerTabs({ conductMissing, contractToSign }: { conductMissing: boolean; contractToSign?: string | null }) {
  const t = useTranslations('me');
  const path = usePathname();
  const { pending, onNavigate } = usePendingHref();
  const tabs = [
    { href: '/me', label: t('tabCalendar'), active: path === '/me' },
    { href: '/me/membership', label: t('tabMembership'), active: path.startsWith('/me/membership') || path.startsWith('/me/conduct') || path.startsWith('/me/contract') },
    { href: '/me/season', label: t('tabSeason'), active: path.startsWith('/me/season') || path.startsWith('/me/profile') },
  ];
  return (
    <div className="grid gap-3">
      {conductMissing && !path.startsWith('/me/conduct') ? (
        <div data-conduct-banner className="flex flex-wrap items-center justify-between gap-3 rounded-card border-2 border-danger/40 bg-danger/5 p-4">
          <p className="font-semibold">{t('conductBanner')}</p>
          <Link href="/me/conduct" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">{t('conductBannerCta')}</Link>
        </div>
      ) : null}
      {contractToSign && !path.startsWith('/me/contract') ? (
        <div data-contract-banner className="flex flex-wrap items-center justify-between gap-3 rounded-card border-2 border-accent bg-accent/10 p-4">
          <p className="font-semibold">{t('contractBanner')}</p>
          <Link href={`/me/contract/${contractToSign}#sign`} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">{t('contractBannerCta')}</Link>
        </div>
      ) : null}
      <nav aria-label={t('tabsLabel')} className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2 border-b border-line">
          {tabs.map((x) => (
            <li key={x.href}>
              <Link href={x.href} onClick={onNavigate(x.href)} aria-current={x.active ? 'page' : undefined} aria-busy={pending === x.href || undefined} data-pending={pending === x.href || undefined}
                className={`-mb-px inline-flex min-h-12 items-center gap-2 whitespace-nowrap rounded-t-lg border-b-4 px-4 font-display text-base font-extrabold transition duration-100 active:scale-[.97] active:bg-accent/10 ${(pending ? pending === x.href : x.active) ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}>
                {x.label}
                {pending === x.href ? <Spinner /> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
