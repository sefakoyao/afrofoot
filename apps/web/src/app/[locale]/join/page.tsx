import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { Faq } from '@/components/Faq';
import { EnrolmentForm, TryoutForm } from '@/components/forms/Forms';
import { OpenOnHash } from '@/components/OpenOnHash';
import { ButtonLink, Card, H2, Hero, Section } from '@/components/Page';
import { countryOptions } from '@/lib/countries';
import { FORM_KEYS, pick } from '@/lib/labels';
import { getPlans } from '@/lib/plans';

const STEPS = [['jn1_t', 'jn1_p'], ['jn2_t', 'jn2_p'], ['jn3_t', 'jn3_p']] as const;

/** Each form sits in a collapsible card, closed until the visitor opens it or follows a #tryout / #enrolment link. */
function Accordion({ id, title, lead, open, close, children }: { id: string; title: string; lead: string; open: string; close: string; children: React.ReactNode }) {
  return (
    <Section id={id}>
      <details className="group rounded-card border border-line bg-raised p-5">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span><h2 className="font-display text-3xl font-extrabold text-pitch">{title}</h2><p className="mt-1 text-muted">{lead}</p></span>
          <span className="rounded-full border-2 border-fg px-4 py-1.5 text-sm font-bold">
            <span className="group-open:hidden">{open}</span><span className="hidden group-open:inline">{close}</span>
          </span>
        </summary>
        <div className="mt-5">{children}</div>
      </details>
    </Section>
  );
}

export default async function JoinPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('site');
  const plans = (await getPlans()).map(({ code, amountEur }) => ({ code, amountEur }));
  const intl = LOCALE_LABELS[locale as Locale]?.intl ?? 'en-GB';
  const labels = pick(t, FORM_KEYS);
  return (
    <>
      <OpenOnHash ids={['tryout', 'enrolment']} />
      <Hero title={t('join')} lead={t('jn_lead')} />
      <Section>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <Card key={title}>
              <span className="grid size-9 place-items-center rounded-full bg-accent font-black text-on-accent">{i + 1}</span>
              <p className="mt-2 text-xs text-muted">{t('jn_step')} {i + 1}</p>
              <h3 className="font-display text-lg font-extrabold">{t(title)}</h3><p className="text-muted">{t(text)}</p>
              <div className="mt-4">
                {i === 0 ? <ButtonLink href="/join#tryout" ghost>{t('btn_tr')}</ButtonLink> : null}
                {i === 1 ? <ButtonLink href="/join#enrolment">{t('n_enrol')} →</ButtonLink> : null}
                {i === 2 ? <ButtonLink href="/membership" ghost>{t('jn_see')}</ButtonLink> : null}
              </div>
            </Card>
          ))}
        </div>
      </Section>
      <Accordion id="tryout" title={t('tr_h')} lead={t('tr_lead')} open={t('acc_open')} close={t('acc_close')}>
        <TryoutForm labels={labels} locale={locale} intl={intl} />
      </Accordion>
      <Accordion id="enrolment" title={t('en_h')} lead={t('en_lead')} open={t('acc_open')} close={t('acc_close')}>
        <EnrolmentForm labels={labels} locale={locale} intl={intl} plans={plans} countries={countryOptions(intl)} />
      </Accordion>
      <Section>
        <H2>{t('faq_h')}</H2>
        <div className="mt-4"><Faq items={[1, 2, 3].map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }))} /></div>
      </Section>
    </>
  );
}
