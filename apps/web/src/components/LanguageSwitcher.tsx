'use client';

import { useLocale } from 'next-intl';
import { LOCALES, LOCALE_LABELS } from '@afrofoot/i18n';
import { Link, usePathname } from '@/i18n/routing';

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <nav aria-label="Language" className="flex gap-1">
      {LOCALES.map((l) => (
        <Link
          key={l}
          href={pathname}
          locale={l}
          hrefLang={l}
          lang={l}
          aria-current={l === locale ? 'true' : undefined}
          className={
            'rounded-full border px-3 py-1 text-xs font-bold ' +
            (l === locale ? 'border-accent bg-accent text-on-accent' : 'border-white/30 text-white hover:border-accent')
          }
        >
          {LOCALE_LABELS[l].short}
        </Link>
      ))}
    </nav>
  );
}
