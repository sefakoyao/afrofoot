import { getRequestConfig } from 'next-intl/server';
import { isLocale } from '@afrofoot/i18n';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`@afrofoot/i18n/messages/${locale}.json`)).default,
  };
});
