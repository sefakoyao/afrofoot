import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Figtree, Cairo } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { dirOf, isLocale, DEFAULT_LOCALE } from '@afrofoot/i18n';
import './globals.css';

const figtree = Figtree({ subsets: ['latin', 'latin-ext'], variable: '--font-body', display: 'swap' });
const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-arabic', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Afro Foot Club', template: '%s · Afro Foot Club' },
  robots: { index: false, follow: false }, // member app: never indexed
};

/** Namespaces client components use. The rest of the messages stay on the server. */
const CLIENT_NAMESPACES = ['auth', 'common', 'app'] as const;
const CLIENT_SITE_KEYS = ['bl_h', 'bl_how', 'bl_btn', 'bl_help'] as const;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const all = (await getMessages()) as Record<string, Record<string, string>>;
  const messages = {
    ...Object.fromEntries(CLIENT_NAMESPACES.map((ns) => [ns, all[ns] ?? {}])),
    site: Object.fromEntries(CLIENT_SITE_KEYS.map((k) => [k, all.site?.[k] ?? ''])),
  };
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${figtree.variable} ${cairo.variable}`}>
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider locale={locale} messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
