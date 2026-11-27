import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Figtree, Cairo } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LOCALES, dirOf, isLocale } from '@afrofoot/i18n';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { OG_IMAGE, SITE_NAME, SITE_URL, jsonLd, pageMeta } from '@/lib/seo';
import '../globals.css';
import { Telemetry } from '@/components/Telemetry';

const figtree = Figtree({ subsets: ['latin', 'latin-ext'], variable: '--font-body', display: 'swap' });
const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-arabic', display: 'swap' });

// Optional: the code Google Search Console gives for the "HTML tag" check (the DNS check needs no code).
const GOOGLE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

/** Defaults for every page; each page sets its own title, description and language links (lib/seo.ts). */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'site' });
  // The home page's description and preview as defaults, but no address: pages without their own (404) get no canonical link.
  const { alternates: _a, openGraph, ...defaults } = pageMeta({ locale, path: '/', description: t('seo_home') });
  const { url: _u, ...og } = (openGraph ?? {}) as Record<string, unknown>;
  return {
    ...defaults,
    openGraph: og,
    metadataBase: new URL(SITE_URL),
    title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
    applicationName: SITE_NAME,
    icons: { icon: '/icon.png', apple: '/icon.png' },
    ...(GOOGLE_VERIFICATION ? { verification: { google: GOOGLE_VERIFICATION } } : {}),
  };
}

/** Structured data for search engines: who the club is (name, logo, contact, city). */
const CLUB_LD = {
  '@context': 'https://schema.org', '@type': 'SportsOrganization', name: SITE_NAME, alternateName: 'Afro Foot Club ry',
  url: SITE_URL, logo: `${SITE_URL}/afc-logo.png`, image: SITE_URL + OG_IMAGE.url, sport: 'Football',
  telephone: '+358504773030', // no email here: structured data is a favourite source of address harvesters
  address: { '@type': 'PostalAddress', addressLocality: 'Helsinki', addressCountry: 'FI' },
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(CLUB_LD) }} />
        {/* Cookie-free visitor statistics and real-user speed (Vercel Web Analytics, Speed Insights); nothing is sent outside a Vercel deployment. */}
        <Telemetry />
      </body>
    </html>
  );
}
