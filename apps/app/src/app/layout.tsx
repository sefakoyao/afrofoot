import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import { Figtree, Cairo } from 'next/font/google';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { dirOf, isLocale, DEFAULT_LOCALE } from '@afrofoot/i18n';
import { AppFooter } from '@/components/AppFooter';
import { NavProgress } from '@/components/NavProgress';
import './globals.css';

const figtree = Figtree({ subsets: ['latin', 'latin-ext'], variable: '--font-body', display: 'swap' });
const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-arabic', display: 'swap' });
// handwriting font for typed-name signatures on contracts (Great Vibes, OFL, Latin subset; see src/fonts)
const signature = localFont({ src: '../fonts/GreatVibes-Latin.woff2', variable: '--font-signature', display: 'swap', preload: false });

export const metadata: Metadata = {
  title: { default: 'Afro Foot Club', template: '%s · Afro Foot Club' },
  robots: { index: false, follow: false }, // member app: never indexed
  icons: { icon: '/icon.png', apple: '/icon.png' },
};

/** Namespaces client components use. The rest of the messages stay on the server. */
const CLIENT_NAMESPACES = ['auth', 'common', 'app', 'account', 'pp', 'me', 'availability', 'match', 'events', 'relation'] as const;
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
    <html lang={locale} dir={dirOf(locale)} className={`${figtree.variable} ${cairo.variable} ${signature.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Suspense fallback={null}><NavProgress /></Suspense>
          <div className="flex-1">{children}</div>
          <AppFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
