import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { TIME_ZONE, type Locale } from '@afrofoot/i18n';
import { resolveLocale } from '@/lib/locale';

// Static imports per locale: webpack cannot resolve a template-string import through the package "exports" wildcard.
const loaders: Record<Locale, () => Promise<{ default: AbstractIntlMessages }>> = {
  en: () => import('@afrofoot/i18n/messages/en.json'),
  fi: () => import('@afrofoot/i18n/messages/fi.json'),
  fr: () => import('@afrofoot/i18n/messages/fr.json'),
  ar: () => import('@afrofoot/i18n/messages/ar.json'),
};

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, timeZone: TIME_ZONE, messages: (await loaders[locale]()).default };
});
