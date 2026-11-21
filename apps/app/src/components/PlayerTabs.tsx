'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Spinner } from './AreaNav';
import { NavIcon, type NavIconName } from './NavIcon';
import { usePendingHref } from './usePendingHref';

/**
 * Player area tabs on wide screens (on phones the bottom bar of AppShell replaces them: Calendar, Membership, My season) and, until the player has agreed to the current Code of Conduct,
 * a reminder on every tab except the Code of Conduct page itself; likewise for a contract waiting for the player's signature.
 */
export function PlayerTabs({ conductMissing, contractToSign }: { conductMissing: boolean; contractToSign?: string | null }) {
  const t = useTranslations('me');
  const path = usePathname();
  const { pending, onNavigate } = usePendingHref();
  // on narrow screens the row scrolls sideways: keep the selected tab in view
  const navRef = useRef<HTMLElement>(null);
  // (only the tab row scrolls sideways; the page itself never moves, so links like /me/conduct#players keep their place)
  useEffect(() => {
    const nav = navRef.current, tab = nav?.querySelector<HTMLElement>('[aria-current=page]');
    if (!nav || !tab) return;
    const left = tab.getBoundingClientRect().left - nav.getBoundingClientRect().left, right = left + tab.offsetWidth;
    if (left < 0) nav.scrollLeft += left - 16; else if (right > nav.clientWidth) nav.scrollLeft += right - nav.clientWidth + 16;
  }, [path]);
  const tabs = [
    { href: '/me', label: t('tabCalendar'), icon: 'calendar' as NavIconName, active: path === '/me' },
    { href: '/me/membership', label: t('tabMembership'), icon: 'card' as NavIconName, active: path.startsWith('/me/membership') || path.startsWith('/me/conduct') || path.startsWith('/me/contract') },
    { href: '/me/season', label: t('tabSeason'), icon: 'trophy' as NavIconName, active: path.startsWith('/me/season') },
    { href: '/me/profile', label: t('tabProfile'), icon: 'user' as NavIconName, active: path.startsWith('/me/profile') },
    { href: '/me/quiz', label: t('tabQuiz'), icon: 'quiz' as NavIconName, active: path.startsWith('/me/quiz') },
  ];
  return (
    <div className="grid gap-3">
      {conductMissing && !path.startsWith('/me/conduct') ? (
        <div data-conduct-banner className="flex flex-wrap items-center justify-between gap-3 rounded-card border-2 border-danger/40 bg-danger/5 p-4">
          <p className="font-semibold">{t('conductBanner')}</p>
          <Link href="/me/conduct#players" data-conduct-jump className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">{t('conductBannerCta')}</Link>
        </div>
      ) : null}
      {contractToSign && !path.startsWith('/me/contract') ? (
        <div data-contract-banner className="flex flex-wrap items-center justify-between gap-3 rounded-card border-2 border-accent bg-accent/10 p-4">
          <p className="font-semibold">{t('contractBanner')}</p>
          <Link href={`/me/contract/${contractToSign}#sign`} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">{t('contractBannerCta')}</Link>
        </div>
      ) : null}
      <nav ref={navRef} aria-label={t('tabsLabel')} className="-mx-4 hidden overflow-x-auto px-4 md:block">
        <ul className="flex gap-1 border-b border-line sm:gap-2">
          {tabs.map((x) => (
            <li key={x.href}>
              <Link href={x.href} onClick={onNavigate(x.href)} aria-current={x.active ? 'page' : undefined} aria-busy={pending === x.href || undefined} data-pending={pending === x.href || undefined}
                className={`-mb-px inline-flex min-h-12 items-center gap-2 whitespace-nowrap rounded-t-lg border-b-4 px-2.5 font-display text-sm font-extrabold sm:px-4 sm:text-base transition duration-100 active:scale-[.97] active:bg-accent/10 ${(pending ? pending === x.href : x.active) ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}>
                <NavIcon name={x.icon} className="size-[18px] sm:size-5" />{x.label}
                {pending === x.href ? <Spinner /> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
