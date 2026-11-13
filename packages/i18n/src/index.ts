export const LOCALES = ['en', 'fi', 'fr', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_LABELS: Record<Locale, { native: string; short: string; intl: string }> = {
  en: { native: 'English', short: 'EN', intl: 'en-GB' },
  fi: { native: 'Suomi', short: 'FI', intl: 'fi-FI' },
  fr: { native: 'Français', short: 'FR', intl: 'fr-FR' },
  ar: { native: 'العربية', short: 'AR', intl: 'ar-u-nu-latn' }, // Western digits, as the club's documents use
};
export const RTL_LOCALES: readonly Locale[] = ['ar'];
/** Text direction for <html dir>. Layout uses logical CSS properties so one stylesheet serves both. */
export const dirOf = (l: Locale): 'rtl' | 'ltr' => (RTL_LOCALES.includes(l) ? 'rtl' : 'ltr');
export const TIME_ZONE = 'Europe/Helsinki';
export const CURRENCY = 'EUR';

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

/** Pick the best supported locale from an Accept-Language header (first-visit default for www.afrofoot.club). */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const wanted = header.split(',').map((p) => { const [tag = '', q] = p.trim().split(';q='); return { lang: tag.slice(0, 2).toLowerCase(), q: q ? Number(q) : 1 }; }).sort((a, b) => b.q - a.q);
  return wanted.map((w) => w.lang).find(isLocale) ?? DEFAULT_LOCALE;
}

/** Content translated in the database: English in base columns, fi/fr/ar in `translations` jsonb. Mirrors SQL app.localized(). */
export type Translations = Partial<Record<Exclude<Locale, 'en'>, Record<string, string>>>;
export function localized(base: string, translations: Translations | null | undefined, locale: Locale, field: string): string {
  if (locale === 'en') return base;
  const v = translations?.[locale]?.[field];
  return v && v.trim() ? v : base;
}

export const formatDate = (d: Date | string, locale: Locale, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) =>
  new Intl.DateTimeFormat(LOCALE_LABELS[locale].intl, { timeZone: TIME_ZONE, ...opts }).format(new Date(d));
export const formatDateTime = (d: Date | string, locale: Locale) => formatDate(d, locale, { dateStyle: 'medium', timeStyle: 'short' });
export const formatMoney = (cents: number, locale: Locale) =>
  new Intl.NumberFormat(LOCALE_LABELS[locale].intl, { style: 'currency', currency: CURRENCY }).format(cents / 100);
