import type { Metadata } from 'next';
import { staticPageMeta } from '@/lib/seo';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ButtonLink, Card, H2, Hero, Section, Tag } from '@/components/Page';
import { Squad, type SquadPlayer } from '@/components/Squad';
import { pick } from '@/lib/labels';
import { getPublicClient } from '@/lib/supabase';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return staticPageMeta((await params).locale, '/team', 'n_team', 'seo_team');
}

// Rebuilt at most once a minute, so a player's choice to appear (or not) and new Palloliitto statistics show without a deploy.
export const revalidate = 60;

async function getSquad(): Promise<SquadPlayer[]> {
  const db = getPublicClient();
  if (!db) return [];
  // The club's current Palloliitto roster minus anyone who opted out or was hidden (view public_squad, migration 0042).
  const { data } = await db.from('public_squad').select('id,display_name,position,shirt_number,goals,appearances,stats_season').order('shirt_number', { ascending: true, nullsFirst: false });
  return ((data ?? []) as { id: string; display_name: string; position: string | null; shirt_number: number | null; goals: number | null; appearances: number | null; stats_season: number | null }[])
    .map((p) => ({ id: p.id, display_name: p.display_name, position: p.position, jersey_number: p.shirt_number, nationality: null, goals: p.goals, appearances: p.appearances, stats_season: p.stats_season }));
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
        {/* The club's players as registered with Palloliitto (public register), minus anyone who opted out (migration 0042). */}
        {squad.length ? (
          <Squad players={squad} labels={{ ...pick(t, ['sq_all', 'position_gk', 'position_df', 'position_mf', 'position_fw']), sq_stats: t.raw('sq_stats') as string }} />
        ) : <p className="mt-3 rounded-card border border-line bg-raised p-5 text-muted" data-squad-empty>{t('sq_empty')}</p>}
        <p className="mt-3 text-xs text-muted" data-squad-source>{t('sq_source')}</p>
      </Section>
    </>
  );
}
