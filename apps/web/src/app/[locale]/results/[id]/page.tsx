import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { Crest } from '@/components/Crest';
import { Section } from '@/components/Page';
import { Link } from '@/i18n/routing';
import { pageMeta } from '@/lib/seo';
import { getPublicClient } from '@/lib/supabase';

// Rebuilt at most once a minute, like the home page, so a new update from Palloliitto shows without a deploy.
export const revalidate = 60;

type Game = {
  external_id: string; competition: string; category: string | null; season: number | null; kickoff_at: string | null; home_name: string; away_name: string;
  home_goals: number | null; away_goals: number | null; venue: string | null; status: string; home_is_club: boolean; away_is_club: boolean;
  ht_home: number | null; ht_away: number | null; attendance: number | null; home_logo: string | null; away_logo: string | null; has_details: boolean;
};
type Ev = { seq: number; kind: 'goal' | 'yellow' | 'red'; minute: number | null; side: 'home' | 'away'; is_club: boolean; player_name: string | null; score_home: number | null; score_away: number | null };

const ID = /^\d{1,12}$/;

/** One game from the Palloliitto results service (views public_league_fixtures and public_league_match_events, migration 0047). */
async function getGame(id: string): Promise<{ game: Game; events: Ev[] } | null> {
  const db = getPublicClient();
  if (!db || !ID.test(id)) return null;
  const [{ data: g }, { data: ev }] = await Promise.all([
    db.from('public_league_fixtures').select('external_id, competition, category, season, kickoff_at, home_name, away_name, home_goals, away_goals, venue, status, home_is_club, away_is_club, ht_home, ht_away, attendance, home_logo, away_logo, has_details').eq('external_id', id).maybeSingle(),
    db.from('public_league_match_events').select('seq, kind, minute, side, is_club, player_name, score_home, score_away').eq('match_external_id', id).order('seq'),
  ]);
  return g ? { game: g as Game, events: (ev ?? []) as Ev[] } : null;
}

const scoreOf = (g: Game) => (g.home_goals !== null && g.away_goals !== null ? `${g.home_goals} – ${g.away_goals}` : null);

export async function generateMetadata({ params }: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { locale, id } = await params;
  const x = await getGame(id);
  if (!x) return {};
  const t = await getTranslations({ locale, namespace: 'site' });
  const title = `${x.game.home_name} ${scoreOf(x.game) ?? '–'} ${x.game.away_name}`;
  return pageMeta({ locale, path: `/results/${id}`, title, description: t('md_desc', { competition: x.game.category ?? x.game.competition, home: x.game.home_name, away: x.game.away_name }) });
}

/** Football, yellow card, red card: the timeline markers. */
function Mark({ kind, label }: { kind: Ev['kind']; label: string }) {
  if (kind === 'goal') return <span title={label} className="grid size-7 shrink-0 place-items-center text-xl leading-none" aria-hidden="false"><span aria-hidden="true">⚽</span><span className="sr-only">{label}</span></span>;
  return <span title={label} className={`inline-block h-6 w-[18px] shrink-0 rounded-[3px] ${kind === 'yellow' ? 'bg-gold' : 'bg-danger'} shadow-sm`}><span className="sr-only">{label}</span></span>;
}

export default async function GamePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const x = await getGame(id);
  if (!x) notFound();
  const { game: g, events } = x;
  const t = await getTranslations('site');
  const intl = LOCALE_LABELS[(locale in LOCALE_LABELS ? locale : 'en') as Locale].intl;
  const when = g.kickoff_at ? new Intl.DateTimeFormat(intl, { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Helsinki' }).format(new Date(g.kickoff_at)) : null;
  const score = scoreOf(g);
  const name = (e: Ev) => e.player_name ?? (e.is_club ? t('md_clubPlayer') : '–');
  const markLabel = (k: Ev['kind']) => t(k === 'goal' ? 'md_goal' : k === 'yellow' ? 'md_yellow' : 'md_red');
  const maps = g.venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(g.venue)}` : null;

  return (
    <>
      <Section>
        <Link href="/#standings" className="text-sm font-semibold text-pitch underline underline-offset-2">← {t('md_back')}</Link>

        {/* scoreboard: black, with the logo band; always home on the left, like the score */}
        <div className="relative mt-4 overflow-hidden rounded-card bg-fg text-white shadow-sm" data-game={g.external_id}>
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-logo-band rtl:-scale-x-100" />
          <div className="px-5 pb-6 pt-7 sm:px-8">
            <p className="text-center text-sm text-white/70">{[g.category ?? g.competition, g.season].filter(Boolean).join(' · ')}</p>
            {when ? <p className="mt-0.5 text-center text-sm font-semibold">{when}</p> : null}
            <div dir="ltr" className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
              <div className="grid justify-items-center gap-2 text-center">
                <Crest src={g.home_logo} name={g.home_name} />
                <bdi className={`font-display text-base font-extrabold sm:text-xl ${g.home_is_club ? 'text-accent' : ''}`}>{g.home_name}</bdi>
              </div>
              <div className="text-center">
                <p className="font-display text-5xl font-black tabular-nums sm:text-6xl" data-game-score>{score ?? '–'}</p>
                {g.ht_home !== null && g.ht_away !== null ? <p className="mt-1 text-sm text-white/70" data-game-ht>{t.rich('md_ht', { score: `${g.ht_home}–${g.ht_away}`, s: (c) => <bdi dir="ltr">{c}</bdi> })}</p> : null}
              </div>
              <div className="grid justify-items-center gap-2 text-center">
                <Crest src={g.away_logo} name={g.away_name} />
                <bdi className={`font-display text-base font-extrabold sm:text-xl ${g.away_is_club ? 'text-accent' : ''}`}>{g.away_name}</bdi>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="rounded-card border border-line bg-raised p-5" aria-labelledby="tl-h" data-timeline>
            <h2 id="tl-h" className="font-display text-xl font-extrabold">{t('md_timeline')}</h2>
            {events.length ? (
              <ol dir="ltr" className="mt-3 grid gap-2">
                {events.map((e) => (
                  <li key={e.seq} data-event={e.kind} data-side={e.side}
                    className={`flex items-center gap-3 rounded-control px-3 py-2 ${e.is_club ? 'bg-accent/10' : 'bg-surface'} ${e.side === 'away' ? 'flex-row-reverse text-right' : ''}`}>
                    <span className="w-10 shrink-0 text-center font-display font-black tabular-nums text-muted">{e.minute !== null ? `${e.minute}'` : ''}</span>
                    <Mark kind={e.kind} label={markLabel(e.kind)} />
                    <bdi className="min-w-0 flex-1 truncate font-semibold">{name(e)}</bdi>
                    {e.kind === 'goal' && e.score_home !== null && e.score_away !== null
                      ? <span className="shrink-0 rounded-full bg-fg px-2.5 py-0.5 font-display text-sm font-black tabular-nums text-white">{e.score_home}–{e.score_away}</span> : null}
                  </li>
                ))}
              </ol>
            ) : <p className="mt-2 text-muted" data-no-details>{g.has_details ? t('md_noEvents') : t('md_noDetails')}</p>}
          </section>

          <section className="rounded-card border border-line bg-raised p-5" aria-labelledby="facts-h">
            <h2 id="facts-h" className="font-display text-xl font-extrabold">{t('md_facts')}</h2>
            <dl className="mt-3 grid gap-3">
              {when ? <div><dt className="text-sm text-muted">{t('md_kickoff')}</dt><dd className="font-semibold">{when}</dd></div> : null}
              {g.venue ? <div><dt className="text-sm text-muted">{t('md_venue')}</dt><dd className="font-semibold"><bdi>{g.venue}</bdi>
                {maps ? <> · <a href={maps} target="_blank" rel="noopener noreferrer" className="text-pitch underline underline-offset-2">{t('md_map')}</a></> : null}</dd></div> : null}
              {g.attendance ? <div><dt className="text-sm text-muted">{t('md_attendance')}</dt><dd className="font-semibold" data-game-attendance>{t('md_spectators', { n: g.attendance })}</dd></div> : null}
              <div><dt className="text-sm text-muted">{t('md_competition')}</dt><dd className="font-semibold">{g.competition}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-muted">{t('md_source')}</p>
          </section>
        </div>
      </Section>
    </>
  );
}
