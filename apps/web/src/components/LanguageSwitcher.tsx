'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { LOCALES, LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { Link, usePathname, useRouter } from '@/i18n/routing';

/**
 * Language choice as one compact drop-down (all four languages, each in its own language). Choosing one opens the same
 * page in that language. Without JavaScript the plain links below are shown instead.
 */
export function LanguageSwitcher({ label = 'Language' }: { label?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <>
      <label className="relative inline-flex items-center">
        <span className="sr-only">{label}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute start-3 size-4 text-white" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z" />
        </svg>
        <select value={locale} disabled={pending} data-language-select
          onChange={(e) => { const next = e.target.value as Locale; start(() => router.replace(pathname, { locale: next })); }}
          className="min-h-9 cursor-pointer appearance-none rounded-full border border-white/40 bg-black py-1 pe-8 ps-9 text-sm font-bold text-white hover:border-accent focus:border-accent disabled:opacity-60">
          {LOCALES.map((l) => <option key={l} value={l} lang={l}>{LOCALE_LABELS[l].native}</option>)}
        </select>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute end-3 size-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
      </label>
      <noscript>
        <nav aria-label={label} className="flex gap-1">
          {LOCALES.map((l) => <Link key={l} href={pathname} locale={l} hrefLang={l} lang={l} className="rounded-full border border-white/30 px-3 py-1 text-xs font-bold text-white">{LOCALE_LABELS[l].short}</Link>)}
        </nav>
      </noscript>
    </>
  );
}
