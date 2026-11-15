import 'server-only';
import { getLocale } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';

/** Date formatters in the viewer's language, Helsinki time (docs/04-i18n.md). */
export async function dateFormats() {
  const l = await getLocale();
  const tag = isLocale(l) ? LOCALE_LABELS[l].intl : 'en-GB';
  return {
    date: new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeZone: TIME_ZONE }),
    dateTime: new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE }),
  };
}

/** Unicode first-strong isolate: a Latin name or email inside Arabic text keeps its own direction (like <bdi>). */
export const isolate = (s: string) => `⁨${s}⁩`;
