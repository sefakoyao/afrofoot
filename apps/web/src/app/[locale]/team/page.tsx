import type { Metadata } from 'next';
import { staticPageMeta } from '@/lib/seo';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { ButtonLink, Card, H2, Hero, Section, Tag } from '@/components/Page';
import { Squad, type SquadPlayer } from '@/components/Squad';
import { Standings } from '@/components/Standings';
import { TopScorers, getTopScorers } from '@/components/TopScorers';
import { deriveLeague, getLeagueData } from '@/lib/league';
import { pick } from '@/lib/labels';
import { getPublicClient } from '@/lib/supabase';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return staticPageMeta((await params).locale, '/team', 'n_team', 'seo_team');
}

// Rebuilt at most once a minute, so a player's choice to appear (or not), new results and Palloliitto statistics show without a deploy.
export const revalidate = 60;

type SquadRow = { id: string; display_name: string; position: string | null; shirt_number: number | null; goals: number | null; appearances: number | null; stats_season: number | null };

async function getTeamData(): Promise<{ squad: SquadRow[]; scorers: Awaited<ReturnType<typeof getTopScorers>> }> {
  const db = getPublicClient();
  if (!db) return { squad: [], scorers: [] };
  const [sq, scorers] = await Promise.all([
    // The club's current Palloliitto roster minus anyone who opted out or was hidden (view public_squad, migration 0042).
    db.from('public_squad').select('id,display_name,position,shirt_number,goals,appearances,stats_season').order('shirt_number', { ascending: true, nullsFirst: false }),
    getTopScorers(),
  ]);
  return { squad: (sq.data ?? []) as SquadRow[], scorers };
}

export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('site');
  const [{ squad: rows, scorers }, leagueData] = await Promise.all([getTeamData(), getLeagueData()]);
  const league = deriveLeague(leagueData);
  const intl = LOCALE_LABELS[(locale in LOCALE_LABELS ? locale : 'en') as Locale].intl;
  const day = new Intl.DateTimeFormat(intl, { dateStyle: 'long', timeZone: 'Europe/Helsinki' });
  const short = new Intl.DateTimeFormat(intl, { day: '2-digit', month: '2-digit', timeZone: 'Europe/Helsinki' });
  const squad: SquadPlayer[] = rows.map((p) => ({
    id: p.id, display_name: p.display_name, position: p.position, jersey_number: p.shirt_number, nationality: null,
    stats: p.appearances != null && p.stats_season ? t('sq_stats', { goals: p.goals ?? 0, games: p.appearances, season: p.stats_season }) : null,
  }));
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
      {/* Results & standings, as on the home page, with the all-time top scorers above the latest results */}
      <Standings league={league} t={t} day={day} short={short} resultsGreen top={scorers.length ? <TopScorers scorers={scorers} t={t} /> : undefined} />
      <Section id="squad">
        <H2>{t('sq_h')}</H2>
        {/* The club's players as registered with Palloliitto (public register), minus anyone who opted out (migration 0042). */}
        {squad.length ? (
          <Squad players={squad} labels={pick(t, ['sq_all', 'position_gk', 'position_df', 'position_mf', 'position_fw'])} />
        ) : <p className="mt-3 rounded-card border border-line bg-raised p-5 text-muted" data-squad-empty>{t('sq_empty')}</p>}
        <p className="mt-3 text-xs text-muted" data-squad-source>{t('sq_source')}</p>
      </Section>
    </>
  );
}
