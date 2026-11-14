import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { SponsorForm } from '@/components/forms/Forms';
import { Card, Check, H2, Hero, Section, Tag } from '@/components/Page';
import { FORM_KEYS, pick } from '@/lib/labels';
import Image from 'next/image';
import { SPONSORS } from '@/lib/sponsors';

const PACKAGES = [
  ['pk1', 'pk1s', ['pk1a', 'pk1b', 'pk1c', 'pk1d']], ['pk2', 'pk2s', ['pk2a', 'pk2b', 'pk2c']], ['pk3', 'pk3s', ['pk3a', 'pk3b']], ['pk4', 'pk4s', ['pk4a']],
] as const;

export default async function SponsorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('site');
  return (
    <>
      <Hero title={t('n_sp')} lead={t('sp_lead')} />
      <Section>
        <div className="flex flex-wrap items-center justify-between gap-2"><H2>{t('sp_cur')}</H2><Tag>{t('sp_sample')}</Tag></div>
        <figure className="mt-4 overflow-hidden rounded-card border border-line">
          <Image src="/images/montel-deal.jpg" alt={t('montel_deal_alt')} width={1179} height={872} className="max-h-[28rem] w-full object-cover object-top" />
          <figcaption className="bg-raised p-3 font-semibold">{t('n1')}</figcaption>
        </figure>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {SPONSORS.map(({ name, kind, desc, logo }) => (
            <Card key={name}><Tag solid>{t(kind)}</Tag>
              {logo ? <div className="mt-3 rounded-control bg-white p-3"><Image src={logo.src} alt={name} width={logo.width} height={logo.height} className="h-10 w-auto" /></div> : <h3 className="mt-2 font-display text-xl font-extrabold">{name}</h3>}
              {desc ? <p className="mt-2 text-muted">{t(desc)}</p> : null}</Card>
          ))}
        </div>
      </Section>
      <Section id="howto">
        <H2>{t('sp_how')}</H2>
        <p className="mt-2 text-muted">{t('sp_how_lead')}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PACKAGES.map(([name, sub, items], i) => (
            <Card key={name} className={i === 0 ? 'border-accent' : ''}>
              <h3 className="font-display text-xl font-extrabold">{t(name)}</h3><p className="text-muted">{t(sub)}</p>
              <Check items={items.map((k) => t(k))} /><div className="mt-3"><Tag>{t('pk_price')}</Tag></div>
            </Card>
          ))}
        </div>
      </Section>
      <Section>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <Card key={n}><span className="grid size-9 place-items-center rounded-full bg-accent font-black text-on-accent">{n}</span>
              <h3 className="mt-2 font-display text-lg font-extrabold">{t(`sp_s${n}`)}</h3><p className="text-muted">{t(`sp_s${n}p`)}</p></Card>
          ))}
        </div>
      </Section>
      <Section id="enquiry">
        <Card className="max-w-3xl">
          <h3 className="mb-3 font-display text-xl font-extrabold">{t('sp_form')}</h3>
          <SponsorForm labels={pick(t, FORM_KEYS)} locale={locale} intl={LOCALE_LABELS[locale as Locale]?.intl ?? 'en-GB'} packages={PACKAGES.map(([n]) => t(n))} />
        </Card>
      </Section>
    </>
  );
}
