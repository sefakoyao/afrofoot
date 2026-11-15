'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * Thin green bar at the top of the screen from the moment a link inside the app is tapped until the new page is shown,
 * so a tap never feels ignored while the server prepares the page. The page being left dims slightly meanwhile.
 */
export function NavProgress() {
  const t = useTranslations('common');
  const path = usePathname(), search = useSearchParams().toString();
  const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [path, search]);
  useEffect(() => {
    // While busy the current page dims a little (globals.css), after a short delay so quick changes don't flicker.
    if (busy) document.documentElement.dataset.navigating = ''; else delete document.documentElement.dataset.navigating;
    if (!busy) return;
    const stop = setTimeout(() => setBusy(false), 15000); // never spin for ever (failed request, cancelled navigation)
    return () => clearTimeout(stop);
  }, [busy]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page or only an anchor (#…)
      setBusy(true);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  if (!busy) return null;
  return (
    <div role="progressbar" aria-label={t('loading')} data-nav-progress className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-accent/20 print:hidden">
      <div className="nav-progress h-full w-1/3 rounded-full bg-accent" />
    </div>
  );
}
