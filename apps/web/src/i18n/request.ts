import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { isLocale, type Locale } from '@afrofoot/i18n';
import { routing } from './routing';

// Static imports per locale: webpack cannot resolve a template-string import through the package "exports" wildcard.
const loaders: Record<Locale, () => Promise<{ default: AbstractIntlMessages }>> = {
  en: () => import('@afrofoot/i18n/messages/en.json'),
  fi: () => import('@afrofoot/i18n/messages/fi.json'),
  fr: () => import('@afrofoot/i18n/messages/fr.json'),
  ar: () => import('@afrofoot/i18n/messages/ar.json'),
};

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await loaders[locale]()).default,
  };
});
