import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { FeeFinder } from '@/components/FeeFinder';
import { InvoiceForm } from '@/components/forms/Forms';
import { ButtonLink, Card, Check, H2, Hero, Section, Tag } from '@/components/Page';
import { FEE_KEYS, FORM_KEYS, pick } from '@/lib/labels';
import { getPlans } from '@/lib/plans';

const PLAN_TEXT = { m: ['per_m', 'pm_u_m', 'pm_sub_m'], q: ['per_q', 'pm_u_q', 'pm_sub_q'], y: ['per_y', 'pm_u_y', 'pm_sub_y'] } as const;

export default async function MembershipPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('site');
  const plans = await getPlans();
  const intl = LOCALE_LABELS[locale as Locale]?.intl ?? 'en-GB';
  const eur = new Intl.NumberFormat(intl, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  return (
    <>
      <Hero title={t('n_mem')} lead={t('pm_lead')} />
      <Section>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => {
            const [name, unit, sub] = PLAN_TEXT[p.code];
            return (
              <Card key={p.code} className={p.code === 'y' ? 'border-accent shadow-glow' : ''}>
                <Tag solid>{t(name)}</Tag>
                <p className="mt-3"><b className="font-display text-4xl font-black">{eur.format(p.amountEur)}</b> <span className="text-muted">{t(unit)}</span></p>
                <p className="mt-1 text-muted">{t(sub)}</p>
                <div className="mt-4"><ButtonLink href="/join#enrolment">{t('n_enrol')} →</ButtonLink></div>
              </Card>
            );
          })}
        </div>
      </Section>
      <Section>
        <div className="grid gap-4 md:grid-cols-2">
          <Card><h3 className="font-display text-xl font-extrabold">{t('pm_incl_h')}</h3><Check items={['pm_i1', 'pm_i2', 'pm_i3', 'pm_i4', 'pm_i5'].map((k) => t(k))} /></Card>
          <Card><h3 className="font-display text-xl font-extrabold">{t('pm_no_h')}</h3><Check no items={['pm_x1', 'pm_x2'].map((k) => t(k))} /></Card>
        </div>
      </Section>
      <Section id="fees">
        <div className="flex flex-wrap items-center justify-between gap-2"><H2>{t('fd_h')}</H2><Tag>{t('fd_note')}</Tag></div>
        <p className="mb-4 mt-2 text-muted">{t('fd_lead')}</p>
        <FeeFinder labels={pick(t, FEE_KEYS)} />
      </Section>
      <Section>
        <H2>{t('pm_pay_h')}</H2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Card><h3 className="font-display text-xl font-extrabold">{t('m_mp')}</h3><p className="mt-1 text-muted">{t('pm_mp_d')}</p></Card>
          <Card>
            <h3 className="font-display text-xl font-extrabold">{t('m_wire')}</h3><p className="mt-1 text-muted">{t('pm_wire_d')}</p>
            <p className="mt-2"><Tag solid>{t('pay_pt')}</Tag></p>
            <a className="mt-2 inline-block font-semibold text-pitch underline" target="_blank" rel="noopener noreferrer" href="https://www.paytrail.com/asiakaspalvelu">{t('pay_help')} ↗</a>
          </Card>
          <Card>
            <h3 className="font-display text-xl font-extrabold">{t('m_inv')}</h3><p className="mt-1 text-muted">{t('pay_inv_d')}</p>
            <div className="mt-4"><ButtonLink href="/membership#invoice" ghost>{t('pay_inv_btn')}</ButtonLink></div>
          </Card>
        </div>
      </Section>
      <Section id="invoice">
        <Card className="max-w-3xl">
          <h3 className="font-display text-xl font-extrabold">{t('inv_h')}</h3><p className="mb-3 mt-1 text-muted">{t('inv_lead')}</p>
          <InvoiceForm labels={pick(t, FORM_KEYS)} locale={locale} intl={intl} plans={plans.map(({ code, amountEur }) => ({ code, amountEur }))} />
        </Card>
        <p className="mt-6 text-muted">{t('pm_note')}</p>
      </Section>
    </>
  );
}
