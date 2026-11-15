'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * Shown when the custom access token hook refuses sign-in because fees are overdue (migration 0022).
 * Payment stays possible: the button opens the app's public payment page (/pay), which needs no sign-in.
 */
export function BlockedNotice() {
  const t = useTranslations();
  return (
    <div role="alert" className="grid gap-2 rounded-card border border-danger/30 bg-danger/5 p-4" data-blocked>
      <p className="font-display text-lg font-extrabold">{t('site.bl_h')}</p>
      <p>{t('auth.blockedText')}</p>
      <p className="text-sm text-muted">{t('auth.blockedHow')}</p>
      <Link href="/pay" className="mt-1 inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">
        {t('site.bl_btn')} <span aria-hidden className="ms-1 rtl-flip">→</span>
      </Link>
      <p className="text-sm text-muted">{t('site.bl_help')}</p>
    </div>
  );
}
