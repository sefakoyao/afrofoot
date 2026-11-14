import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALES, LOCALE_LABELS } from '@afrofoot/i18n';
import { setLocale } from '@/app/actions/auth';

/** A plain form, so it works without JavaScript. The server action stores the choice (cookie, and the profile when signed in). */
export async function LanguageSwitcher({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const [locale, t] = [await getLocale(), await getTranslations('nav')];
  const idle = tone === 'dark' ? 'border-white/30 text-white hover:border-accent' : 'border-line text-fg hover:border-accent';
  return (
    <form action={setLocale} aria-label={t('language')} className="flex gap-1">
      {LOCALES.map((l) => (
        <button key={l} type="submit" name="locale" value={l} lang={l} aria-pressed={l === locale} title={LOCALE_LABELS[l].native}
          className={`min-h-9 rounded-full border px-3 text-xs font-bold ${l === locale ? 'border-accent bg-accent text-on-accent' : idle}`}>
          {LOCALE_LABELS[l].short}
        </button>
      ))}
    </form>
  );
}
