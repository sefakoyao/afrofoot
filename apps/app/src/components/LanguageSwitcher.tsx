import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALES, LOCALE_LABELS } from '@afrofoot/i18n';
import { setLocale } from '@/app/actions/auth';
import { LanguageSelect } from './LanguageSelect';

/**
 * Language choice as one compact drop-down (all four languages, each in its own language). Choosing one saves it at
 * once (cookie, and the profile when signed in). Without JavaScript the "Change" button submits the form.
 */
export async function LanguageSwitcher({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const [locale, t] = [await getLocale(), await getTranslations('nav')];
  return (
    <form action={setLocale} className="flex items-center gap-1">
      <LanguageSelect current={locale} label={t('language')} tone={tone}
        options={LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l].native, short: LOCALE_LABELS[l].short }))} />
      <noscript><button type="submit" className="min-h-9 rounded-full border border-white/30 px-3 text-xs font-bold">{t('changeLanguage')}</button></noscript>
    </form>
  );
}
