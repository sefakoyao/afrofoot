'use client';

import { useLocale, useTranslations } from 'next-intl';

/**
 * Shown when the custom access token hook refuses sign-in because fees are overdue (migration 0022).
 * Payment stays possible: the button opens the public Membership page in the visitor's language.
 */
export function BlockedNotice({ webUrl }: { webUrl: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const href = `${webUrl}${locale === 'en' ? '' : `/${locale}`}/membership`;
  return (
    <div role="alert" className="grid gap-2 rounded-card border border-danger/30 bg-danger/5 p-4">
      <p className="font-display text-lg font-extrabold">{t('site.bl_h')}</p>
      <p>{t('auth.blockedText')}</p>
      <p className="text-sm text-muted">{t('site.bl_how')}</p>
      <a href={href} className="mt-1 inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">
        {t('site.bl_btn')} <span aria-hidden className="ms-1 rtl-flip">→</span>
      </a>
      <p className="text-sm text-muted">{t('site.bl_help')}</p>
    </div>
  );
}
