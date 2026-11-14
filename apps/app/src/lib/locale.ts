import 'server-only';
import { cookies, headers } from 'next/headers';
import { isLocale, negotiateLocale, type Locale } from '@afrofoot/i18n';

/** The app has no locale in the URL: the language is the profile's (copied to this cookie at sign-in) or, signed out, the visitor's choice or browser language. */
export const LOCALE_COOKIE = 'NEXT_LOCALE';
export const LOCALE_COOKIE_OPTIONS = { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production' };

export async function resolveLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return negotiateLocale((await headers()).get('accept-language'));
}
