import type { Metadata } from 'next';
import { staticPageMeta } from '@/lib/seo';
import { CLUB_EMAIL, encodeEmail } from '@afrofoot/ui/email';
import { ProtectedEmail } from '@afrofoot/ui/protected-email';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { ContactForm } from '@/components/forms/Forms';
import { Card, Hero, Section } from '@/components/Page';
import { FORM_KEYS, pick } from '@/lib/labels';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return staticPageMeta((await params).locale, '/contact', 'n_contact', 'seo_contact');
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('site');
  return (
    <>
      <Hero title={t('n_contact')} lead={t('ct_lead')} />
      <Section>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <h3 className="font-display text-xl font-extrabold">{t('ct_find')}</h3>
            <p className="mt-3 font-bold"><ProtectedEmail code={encodeEmail(CLUB_EMAIL)} fallback={t('mail_js')} className="text-pitch underline underline-offset-2" /><br /><a href="tel:+358504773030" dir="ltr">+358 50 477 3030</a></p>
            <p className="mt-2 text-muted">Afro Foot Club ry · Finland</p>
          </Card>
          <Card>
            <h3 className="mb-3 font-display text-xl font-extrabold">{t('ct_write')}</h3>
            <ContactForm labels={pick(t, FORM_KEYS)} locale={locale} intl={LOCALE_LABELS[locale as Locale]?.intl ?? 'en-GB'} />
          </Card>
        </div>
      </Section>
    </>
  );
}
