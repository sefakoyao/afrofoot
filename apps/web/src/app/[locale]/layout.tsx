import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Figtree, Cairo } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LOCALES, dirOf, isLocale } from '@afrofoot/i18n';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import '../globals.css';

const figtree = Figtree({ subsets: ['latin', 'latin-ext'], variable: '--font-body', display: 'swap' });
const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-arabic', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Afro Foot Club', template: '%s · Afro Foot Club' },
  description: 'Afro Foot Club, Helsinki. One team, no borders, pure football.',
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={dirOf(locale)} className={`${figtree.variable} ${cairo.variable}`}>
      <body data-surface="public" className="min-h-screen font-sans">
        {/* Only client components (the language switcher) need the provider, and they need no translated text. */}
        <NextIntlClientProvider messages={{}}>
          <Header />
          <main>{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
