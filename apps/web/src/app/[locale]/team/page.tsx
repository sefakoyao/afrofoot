import type { Metadata } from 'next';
import { staticPageMeta } from '@/lib/seo';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { ButtonLink, Card, H2, Hero, Section, Tag } from '@/components/Page';
import { Squad, type SquadPlayer } from '@/components/Squad';
import { Standings } from '@/components/Standings';
import { deriveLeague, getLeagueData } from '@/lib/league';
import { pick } from '@/lib/labels';
import { getPublicClient } from '@/lib/supabase';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return staticPageMeta((await params).locale, '/team', 'n_team', 'seo_team');
}

// Rebuilt at most once a minute, so a player's choice to appear (or not), new results and Palloliitto statistics show without a deploy.
export const revalidate = 60;

type SquadRow = { id: string; display_name: string; position: string | null; shirt_number: number | null; goals: number | null; appearances: number | null; stats_season: number | null };
type Scorer = { rank: number; display_name: string; goals: number; appearances: number; current_player: boolean; first_season: number | null; last_season: number | null; since_season: number | null };

async function getTeamData(): Promise<{ squad: SquadRow[]; scorers: Scorer[] }> {
  const db = getPublicClient();
  if (!db) return { squad: [], scorers: [] };
  const [sq, ts] = await Promise.all([
    // The club's current Palloliitto roster minus anyone who opted out or was hidden (view public_squad, migration 0042).
    db.from('public_squad').select('id,display_name,position,shirt_number,goals,appearances,stats_season').order('shirt_number', { ascending: true, nullsFirst: false }),
    // Top three of all league and cup goals with the club, former players included (view public_top_scorers, migration 0043).
    db.from('public_top_scorers').select('rank,display_name,goals,appearances,current_player,first_season,last_season,since_season').order('rank'),
  ]);
  return { squad: (sq.data ?? []) as SquadRow[], scorers: (ts.data ?? []) as Scorer[] };
}

/** The club's three all-time top scorers (black card with the logo band, medal colours from the logo), above the latest results. */
function TopScorers({ scorers, t }: { scorers: Scorer[]; t: Awaited<ReturnType<typeof getTranslations<'site'>>> }) {
  const since = scorers[0]?.since_season;
  const medal = ['bg-gold text-fg', 'bg-white text-fg', 'bg-accent text-on-accent'];
  return (
    <aside className="relative overflow-hidden rounded-card bg-fg text-white shadow-sm" aria-labelledby="ts-h" data-top-scorers>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-logo-band rtl:-scale-x-100" />
      <div className="px-5 pb-2 pt-6">
        <h3 id="ts-h" className="font-display text-xl font-extrabold leading-tight">{t('ts_h')}</h3>
        {since ? <p className="mt-0.5 text-sm text-white/70">{t('ts_sub', { year: since })}</p> : null}
      </div>
      <ol className="px-3 pb-4">
        {scorers.map((s, i) => (
          <li key={s.rank} className="flex items-center gap-3 rounded-2xl px-2 py-2.5" data-scorer={s.rank}>
            <span className={`grid size-10 shrink-0 place-items-center rounded-full font-display text-lg font-black ${medal[i] ?? medal[2]}`}>{s.rank}</span>
            <span className="grid min-w-0 flex-1">
              <span className="truncate font-display font-extrabold">{s.display_name}</span>
              <span className="text-xs text-white/70">
                {t('ts_games', { n: s.appearances })}
                {s.first_season && s.last_season ? ` · ${s.first_season === s.last_season ? s.first_season : t('ts_years', { from: s.first_season, to: s.last_season })}` : ''}
                {s.current_player ? '' : ` · ${t('ts_former')}`}
              </span>
            </span>
            <span className="shrink-0 text-end">
              <span className="block font-display text-2xl font-black leading-none tabular-nums">{s.goals}</span>
              <span className="block text-[11px] text-white/70">{t('ts_goals', { n: s.goals })}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
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
      <Standings league={league} t={t} day={day} short={short} top={scorers.length ? <TopScorers scorers={scorers} t={t} /> : undefined} />
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
