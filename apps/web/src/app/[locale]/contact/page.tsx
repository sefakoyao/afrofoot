import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { ContactForm } from '@/components/forms/Forms';
import { Card, Hero, Section } from '@/components/Page';
import { FORM_KEYS, pick } from '@/lib/labels';

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
            <p className="mt-3 font-bold">info@afrofoot.club<br />+358 50 477 3030</p>
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
