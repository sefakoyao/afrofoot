import { getTranslations } from 'next-intl/server';
import { ButtonLink, Card, H2, Hero, Section, Tag } from './Page';

/** Women's and juniors' pages share one layout. Details are sample text until the club supplies the final information. */
export async function TeamInfo({ variant }: { variant: 'w' | 'j' }) {
  const t = await getTranslations('site');
  const rows: [string, string][] = [
    ['tp_age', t(`tp_age_${variant}`)], ['tp_tr', t(`tp_tr_${variant}`)], ['tp_ven', t('tp_ven_v')],
    ['tp_coach', t('tp_coach_v')], ['tp_start', t('tp_start_v')], ['tp_contact', 'info@afrofoot.club'],
  ];
  return (
    <>
      <Hero title={t(variant === 'w' ? 'w_h' : 'j_h')} lead={t(`tp_lead_${variant}`)} upcoming={t('upc')} />
      <Section>
        <div className="flex flex-wrap items-center justify-between gap-2"><H2>{t('tp_det')}</H2><Tag>{t('tp_sample')}</Tag></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([k, v]) => <Card key={k}><span className="block text-sm text-muted">{t(k)}</span><b>{v}</b></Card>)}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/join#enrolment">{t('tp_cta')} →</ButtonLink>
          <ButtonLink href="/" ghost>{t('tp_back')}</ButtonLink>
        </div>
      </Section>
    </>
  );
}
