import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ButtonLink, Card, H2, Hero, Section, Tag } from '@/components/Page';
import { Squad, type SquadPlayer } from '@/components/Squad';
import { pick } from '@/lib/labels';
import { getPublicClient } from '@/lib/supabase';

async function getSquad(): Promise<SquadPlayer[]> {
  const db = getPublicClient();
  if (!db) return [];
  const { data } = await db.from('public_players').select('id,display_name,position,jersey_number,nationality').order('jersey_number', { ascending: true, nullsFirst: false });
  return (data ?? []) as SquadPlayer[];
}

export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('site');
  const squad = await getSquad();
  return (
    <>
      <Hero title={t('n_team')} lead={t('tm_lead')} />
      <Section>
        <div className="grid gap-4 md:grid-cols-3">
          <Card><Tag solid>{t('tm_active')}</Tag><h3 className="mt-2 font-display text-2xl font-extrabold">{t('tm_men')}</h3><p className="mt-1 text-muted">{t('tm_div')}</p>
            <div className="mt-4"><ButtonLink href="/team#squad">{t('tm_squad')}</ButtonLink></div></Card>
          <Card><Tag solid>{t('upc')}</Tag><h3 className="mt-2 font-display text-2xl font-extrabold">{t('tm_women')}</h3><p className="mt-1 text-muted">{t('tp_age_w')}</p>
            <div className="mt-4"><ButtonLink href="/women" ghost>{t('tm_view')}</ButtonLink></div></Card>
          <Card><Tag solid>{t('upc')}</Tag><h3 className="mt-2 font-display text-2xl font-extrabold">{t('tm_jun')}</h3><p className="mt-1 text-muted">{t('tp_age_j')}</p>
            <div className="mt-4"><ButtonLink href="/juniors" ghost>{t('tm_view')}</ButtonLink></div></Card>
        </div>
      </Section>
      <Section id="squad">
        <H2>{t('sq_h')}</H2>
        <p className="mt-1 text-sm text-muted">{t('sq_hint')}</p>
        {/* Players listed here have consented to a public listing (database view public_players). */}
        <Squad players={squad} labels={pick(t, ['sq_all', 'position_gk', 'position_df', 'position_mf', 'position_fw'])} />
      </Section>
    </>
  );
}
