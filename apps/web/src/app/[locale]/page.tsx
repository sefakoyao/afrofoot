import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { Faq } from '@/components/Faq';
import { IconMembership, IconPartner, IconTraining } from '@/components/Icons';
import { NewsCard } from '@/components/NewsCard';
import { getPosts, type Post } from '@/lib/news';
import Image from 'next/image';
import { HeroSlider } from '@/components/HeroSlider';
import { ButtonLink, Card, H2, Section, Tag } from '@/components/Page';
import { Link } from '@/i18n/routing';
import { getPublicClient } from '@/lib/supabase';
import { STRIP } from '@/lib/sponsors';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'site' });
  return { ...pageMeta({ locale, path: '/', title: t('seo_home_title'), description: t('seo_home') }), title: { absolute: t('seo_home_title') } };
}

// Rebuilt at most once a minute so the next match and results follow the member app without a deploy.
export const revalidate = 60;

interface Fixture { id: string; team_name: string; opponent: string; home_away: string | null; kickoff_at: string; status: string; goals_for: number | null; goals_against: number | null; venue: string | null; city: string | null }
interface Record_ { team_season_id: string; team_name: string; competition: string; played: number; won: number; drawn: number; lost: number; points: number }
/** Palloliitto league table row and game (migration 0040 views, filled by /api/federation-sync). */
interface FedStanding { competition_external_id: string; competition: string; category: string | null; group_name: string | null; season: number | null; position: number; team_name: string; is_club: boolean;
  played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number; points: number; synced_at: string }
interface FedGame { external_id: string; competition_external_id: string; competition: string; category: string | null; kind: string; kickoff_at: string | null; home_name: string; away_name: string;
  home_goals: number | null; away_goals: number | null; venue: string | null; status: string; synced_at: string; home_is_club: boolean; away_is_club: boolean }
/** A game as the home page shows it: home team first, the score in the same order; outcome is the club's (win, draw, loss). */
type Outcome = 'w' | 'd' | 'l';
interface Game { id: string; label: string; tag: string; kickoff_at: string; place: string | null; score: string | null; home: string; away: string; clubHome: boolean; outcome: Outcome | null }
const outcomeOf = (ours: number | null, theirs: number | null): Outcome | null => (ours === null || theirs === null ? null : ours > theirs ? 'w' : ours < theirs ? 'l' : 'd');

/** Card header of the standings: black, with the green-to-yellow band of the logo's top edge. */
function Banner({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="relative bg-fg px-5 pb-4 pt-6 text-white">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-logo-band rtl:-scale-x-100" />
      <h3 className="font-display text-xl font-extrabold leading-tight">{title}</h3>
      {sub ? <p className="mt-0.5 text-sm text-white/70">{sub}</p> : null}
    </div>
  );
}

async function getHomeData() {
  const db = getPublicClient();
  if (!db) return { fixtures: [] as Fixture[], records: [] as Record_[], posts: [] as Post[], fedTable: [] as FedStanding[], fedGames: [] as FedGame[] };
  const [f, r, n, st, fg] = await Promise.all([
    db.from('public_fixtures').select('id,team_name,opponent,home_away,kickoff_at,status,goals_for,goals_against,venue,city').order('kickoff_at', { ascending: false }).limit(40),
    db.from('public_team_records').select('team_season_id,team_name,competition,played,won,drawn,lost,points').order('points', { ascending: false }).limit(12),
    getPosts(3),
    db.from('public_standings').select('competition_external_id,competition,category,group_name,season,position,team_name,is_club,played,won,drawn,lost,goals_for,goals_against,points,synced_at')
      .order('season', { ascending: false }).order('position').limit(200),
    db.from('public_league_fixtures').select('external_id,competition_external_id,competition,category,kind,kickoff_at,home_name,away_name,home_goals,away_goals,venue,status,synced_at,home_is_club,away_is_club')
      .or('home_is_club.eq.true,away_is_club.eq.true').order('kickoff_at', { ascending: false }).limit(60),
  ]);
  return { fixtures: (f.data ?? []) as Fixture[], records: (r.data ?? []) as Record_[], posts: n, fedTable: (st.data ?? []) as FedStanding[], fedGames: (fg.data ?? []) as FedGame[] };
}

const vs = (m: Fixture) => (m.home_away === 'away' ? `${m.opponent}  vs  ${m.team_name}` : `${m.team_name}  vs  ${m.opponent}`);
const ownGame = (m: Fixture): Game => ({
  id: m.id, label: vs(m), tag: m.team_name, kickoff_at: m.kickoff_at, place: m.venue ? `${m.venue}${m.city ? `, ${m.city}` : ''}` : null,
  score: m.goals_for === null || m.goals_against === null ? null : m.home_away === 'away' ? `${m.goals_against} – ${m.goals_for}` : `${m.goals_for} – ${m.goals_against}`,
  home: m.home_away === 'away' ? m.opponent : m.team_name, away: m.home_away === 'away' ? m.team_name : m.opponent, clubHome: m.home_away !== 'away',
  outcome: outcomeOf(m.goals_for, m.goals_against),
});
const fedGame = (m: FedGame): Game => ({
  id: m.external_id, label: `${m.home_name}  vs  ${m.away_name}`, tag: m.category || m.competition, kickoff_at: m.kickoff_at ?? '', place: m.venue,
  score: m.home_goals === null || m.away_goals === null ? null : `${m.home_goals} – ${m.away_goals}`,
  home: m.home_name, away: m.away_name, clubHome: m.home_is_club,
  outcome: m.home_is_club ? outcomeOf(m.home_goals, m.away_goals) : m.away_is_club ? outcomeOf(m.away_goals, m.home_goals) : null,
});

/** The league table to show: the newest season whose table has games played (last season's final table until then). */
function pickTable(rows: FedStanding[]): FedStanding[] {
  const groups = new Map<string, FedStanding[]>();
  for (const r of rows) groups.set(r.competition_external_id, [...(groups.get(r.competition_external_id) ?? []), r]);
  const tables = [...groups.values()].filter((g) => g.some((r) => r.played > 0)).sort((a, b) => (b[0]?.season ?? 0) - (a[0]?.season ?? 0));
  return (tables[0] ?? []).sort((a, b) => a.position - b.position);
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('site');
  const l = (locale in LOCALE_LABELS ? locale : 'en') as Locale;
  const intl = LOCALE_LABELS[l].intl;
  const when = new Intl.DateTimeFormat(intl, { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Helsinki' });
  const day = new Intl.DateTimeFormat(intl, { dateStyle: 'long', timeZone: 'Europe/Helsinki' });
  const short = new Intl.DateTimeFormat(intl, { day: '2-digit', month: '2-digit', timeZone: 'Europe/Helsinki' });
  const { fixtures, records, posts, fedTable, fedGames } = await getHomeData();
  const now = Date.now();
  // Games entered in the member app come first for the next match; Palloliitto fills in when there are none.
  const ownNext = fixtures.filter((m) => m.status === 'scheduled' && new Date(m.kickoff_at).getTime() >= now).sort((a, b) => +new Date(a.kickoff_at) - +new Date(b.kickoff_at))[0];
  const fedNext = fedGames.filter((m) => m.status === 'fixture' && m.kickoff_at && Date.parse(m.kickoff_at) >= now).sort((a, b) => (a.kickoff_at ?? '').localeCompare(b.kickoff_at ?? ''))[0];
  const next: Game | undefined = ownNext ? ownGame(ownNext) : fedNext ? fedGame(fedNext) : undefined;
  // Results: the official ones from Palloliitto when synced, else the scores entered in the app.
  const fedPlayed = fedGames.filter((m) => m.status === 'played' && m.home_goals !== null && m.kickoff_at);
  const results: Game[] = (fedPlayed.length ? fedPlayed.map(fedGame) : fixtures.filter((m) => m.status === 'played').map(ownGame)).slice(0, 5);
  const table = pickTable(fedTable);
  const tableInfo = table[0];
  const clubRow = table.find((r) => r.is_club);
  const thisYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Helsinki' }).format(new Date()));
  // Final once the season is over, or the club has no games left to play in that league.
  const tableFinal = !!tableInfo && ((tableInfo.season ?? thisYear) < thisYear
    || !fedGames.some((m) => m.competition_external_id === tableInfo.competition_external_id && m.status === 'fixture'));
  const syncedAt = [...table.map((r) => r.synced_at), ...fedGames.map((m) => m.synced_at)].sort().at(-1);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL; // member app not live yet: the training tile is hidden without it

  return (
    <>
      <HeroSlider
        labels={{ prev: t('hs_prev'), next: t('hs_next'), pause: t('hs_pause'), play: '▶' }}
        slides={[
          <div key="intro" className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
            <div className="grid gap-6">
              <span className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">{t('since')}</span>
              <h1 className="font-display text-5xl font-black leading-[1.02] md:text-7xl">
                {t('h1a')} <span className="text-accent">{t('h1b')}</span> {t('h1c')}
              </h1>
              <p className="max-w-xl text-lg text-white/80">{t('lead')}</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/join" className="rounded-full bg-accent px-7 py-3 font-display font-bold text-on-accent hover:brightness-110">{t('join')}</Link>
                <Link href="/sponsors#enquiry" className="rounded-full border-2 border-white px-7 py-3 font-display font-bold hover:bg-white hover:text-black">{t('partner')}</Link>
                <Link href="/join#tryout" className="rounded-full border-2 border-white px-7 py-3 font-display font-bold hover:bg-white hover:text-black">{t('btn_tr')}</Link>
              </div>
              <dl className="flex flex-wrap gap-x-10 gap-y-3">
                {([['100+', 'players'], ['40+', 'nations'], ['2020', 'founded']] as const).map(([n, k]) => (
                  <div key={k}><dt className="font-display text-4xl font-black text-accent">{n}</dt><dd className="text-white/70">{t(k)}</dd></div>
                ))}
              </dl>
            </div>
            <div className="relative hidden aspect-[4/3] overflow-hidden rounded-card md:block">
              <Image src="/images/hero-team.jpg" alt={t('hero_photo_alt')} fill sizes="(min-width: 768px) 40vw, 0px" className="object-cover" priority />
            </div>
          </div>,
          ...(next ? [
            <div key="next" className="grid gap-4">
              <span className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">{t('hs_k2')} · {next.tag}</span>
              <h2 className="font-display text-5xl font-black md:text-6xl" dir="ltr">{next.label}</h2>
              <p className="text-lg text-white/80">{when.format(new Date(next.kickoff_at))}{next.place ? ` · ${next.place}` : ''}</p>
              <div><Link href="/calendar" className="inline-block rounded-full bg-accent px-7 py-3 font-display font-bold text-on-accent">{t('cal')}</Link></div>
            </div>,
          ] : [
            <div key="next" className="grid gap-4" data-next-placeholder="hero">
              <span className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">{t('hs_k2')}</span>
              <h2 className="font-display text-5xl font-black md:text-6xl">{t('nm_soon_h')}</h2>
              <p className="max-w-xl text-lg text-white/80">{t('nm_soon_p')}</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/calendar" className="rounded-full bg-accent px-7 py-3 font-display font-bold text-on-accent">{t('cal')}</Link>
                <Link href="/join#tryout" className="rounded-full border-2 border-white px-7 py-3 font-display font-bold">{t('btn_tr')}</Link>
              </div>
            </div>,
          ]),
          ...(results[0] ? [
            <div key="result" className="grid gap-4">
              <span className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">{t('hs_k3')} · {results[0].tag}</span>
              <h2 className="font-display text-5xl font-black md:text-6xl" dir="ltr" data-latest-result>{results[0].label} <span className="text-accent">{results[0].score}</span></h2>
              <p className="text-lg text-white/80">{day.format(new Date(results[0].kickoff_at))}</p>
              <div className="flex flex-wrap gap-3">
                <Link href="/#standings" className="rounded-full bg-accent px-7 py-3 font-display font-bold text-on-accent">{t('stand')}</Link>
                <Link href="/news" className="rounded-full border-2 border-white px-7 py-3 font-display font-bold">{t('allnews')}</Link>
              </div>
            </div>,
          ] : []),
          <div key="tryout" className="grid gap-4">
            <span className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">{t('hs_k4')}</span>
            <h2 className="font-display text-5xl font-black md:text-6xl">{t('n3')}</h2>
            <p className="max-w-xl text-lg text-white/80">{t('n3b')}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/join#tryout" className="rounded-full bg-accent px-7 py-3 font-display font-bold text-on-accent">{t('btn_tr')}</Link>
              <Link href="/join" className="rounded-full border-2 border-white px-7 py-3 font-display font-bold">{t('join')}</Link>
            </div>
          </div>,
        ]}
      />

      <section className="bg-accent text-on-accent">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6">
          <div><h2 className="font-display text-2xl font-extrabold">{t('promo_h')}</h2><p>{t('promo_p')}</p></div>
          <Link href="/join" className="rounded-full bg-black px-6 py-2.5 font-display font-bold text-white hover:bg-ink-950">{t('join')} →</Link>
        </div>
      </section>

      {next ? (
        <Section>
          <H2>{t('next')} {t('match')}</H2>
          <Card className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <Tag solid>{next.tag}</Tag>
              <p className="mt-2 font-display text-2xl font-extrabold" dir="ltr" data-next-game>{next.label}</p>
              <p className="text-muted">{when.format(new Date(next.kickoff_at))}{next.place ? ` · ${next.place}` : ''}</p>
            </div>
            <ButtonLink href="/calendar">{t('cal')}</ButtonLink>
          </Card>
        </Section>
      ) : (
        // No game scheduled yet (off-season, or fixtures not published): say so instead of hiding the section.
        <Section>
          <H2>{t('next')} {t('match')}</H2>
          <Card className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl" data-next-placeholder="section">
              <p className="font-display text-2xl font-extrabold">{t('nm_soon_h')}</p>
              <p className="mt-1 text-muted">{t('nm_soon_p')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/calendar">{t('cal')}</ButtonLink>
              <ButtonLink href="/join#tryout" ghost>{t('btn_tr')}</ButtonLink>
            </div>
          </Card>
        </Section>
      )}

      <Section id="news">
        <div className="flex items-center justify-between gap-3"><H2>{t('afro')} {t('newsw')}</H2><Link href="/news" className="font-semibold text-pitch underline">{t('allnews')} →</Link></div>
        {posts.length ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {posts.map((p, i) => <NewsCard key={p.id} post={p} index={i} locale={l} date={day.format(new Date(p.published_at))} readMore={t('readmore')} />)}
          </div>
        ) : <p className="mt-4 text-muted">{t('news_empty')}</p>}
      </Section>

      <Section>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ...(appUrl ? [{ href: appUrl, k: 'tile1', external: true, icon: <IconTraining /> }] : []),
            { href: '/membership', k: 'tile2', external: false, icon: <IconMembership /> },
            { href: '/sponsors', k: 'tile3', external: false, icon: <IconPartner /> },
          ].map(({ href, k, external, icon }) => {
            const body = (
              <>
                <span className="grid size-14 place-items-center rounded-2xl bg-accent/15 text-pitch transition duration-300 group-hover:rotate-3 group-hover:bg-accent group-hover:text-on-accent motion-reduce:transition-none">{icon}</span>
                <h3 className="mt-4 font-display text-xl font-extrabold">{t(k)}</h3>
                <p className="mt-1 flex-1 text-muted">{t(`${k}p`)}</p>
                <span aria-hidden className="mt-4 grid size-10 place-items-center rounded-full bg-ink-950 text-white transition duration-300 group-hover:translate-x-1 group-hover:bg-accent group-hover:text-on-accent motion-reduce:transition-none rtl:rotate-180 rtl:group-hover:-translate-x-1">→</span>
              </>
            );
            const cls = 'group flex flex-col rounded-card border border-line bg-raised p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-accent hover:shadow-xl motion-reduce:transition-none';
            return external
              ? <a key={k} href={href} className={cls}>{body}</a>
              : <Link key={k} href={href} className={cls}>{body}</Link>;
          })}
        </div>
      </Section>

      {table.length || records.length || results.length ? (
        <Section id="standings">
          <H2>{t('stand')}</H2>
          {table.length ? (
            <p className="mb-4 mt-1 text-sm text-muted" data-standings-source>{syncedAt ? t('sync_fed', { date: day.format(new Date(syncedAt)) }) : t('sync_fed_plain')}</p>
          ) : <div className="mb-4" />}
          <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            {results.length ? (
              <Card className="overflow-hidden !p-0">
                <Banner title={t('res_h')} />
                <ul className="divide-y divide-line px-5 py-1" data-results>
                  {results.map((m) => {
                    const o = m.outcome;
                    return (
                      <li key={m.id} className="flex items-center gap-3 py-3" data-outcome={o ?? undefined}>
                        {o ? (
                          <span title={t(o === 'w' ? 'res_win' : o === 'd' ? 'res_draw' : 'res_loss')}
                            className={`grid size-9 shrink-0 place-items-center rounded-full font-display text-sm font-black ${o === 'w' ? 'bg-accent text-on-accent' : o === 'd' ? 'bg-gold text-fg' : 'bg-fg text-white'}`}>
                            <span aria-hidden="true">{t(o === 'w' ? 'res_w' : o === 'd' ? 'res_d' : 'res_l')}</span>
                            <span className="sr-only">{t(o === 'w' ? 'res_win' : o === 'd' ? 'res_draw' : 'res_loss')}</span>
                          </span>
                        ) : <span className="size-9 shrink-0" />}
                        <span className="grid min-w-0 flex-1">
                          <span className="text-xs text-muted">{short.format(new Date(m.kickoff_at))} · {m.tag}</span>
                          <span className="truncate" dir="ltr">
                            <bdi className={m.clubHome ? 'font-extrabold' : 'font-medium'}>{m.home}</bdi>
                            <span className="mx-1.5 text-muted">–</span>
                            <bdi className={m.clubHome ? 'font-medium' : 'font-extrabold'}>{m.away}</bdi>
                          </span>
                        </span>
                        <span dir="ltr" className="shrink-0 rounded-full bg-fg px-3 py-1 font-display font-black tabular-nums text-white">{m.score}</span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}
            {table.length && tableInfo ? (
              <Card className="overflow-hidden !p-0" data-league-table>
                <Banner
                  title={`${tableInfo.category ?? tableInfo.competition}${tableInfo.group_name ? ` · ${t('st_group', { group: tableInfo.group_name })}` : ''}`}
                  sub={`${tableInfo.season ? t('st_season', { season: tableInfo.season }) : tableInfo.competition}${tableFinal ? ` · ${t('st_final')}` : ''}`} />
                {clubRow ? (
                  <p className="bg-gold px-5 py-2 font-display text-sm font-extrabold text-fg" data-club-summary>
                    {t('st_you', { pos: clubRow.position, n: table.length, pts: clubRow.points })}
                  </p>
                ) : null}
                <div className="overflow-x-auto px-3 pb-3 pt-2 sm:px-4">
                  <table className="w-full text-start text-sm tabular-nums">
                    <thead><tr className="text-xs font-bold uppercase tracking-wide text-muted">
                      <th className="px-1.5 py-2 text-start">#</th><th className="px-1.5 py-2 text-start">{t('th_team')}</th>
                      {(['th_p', 'th_w', 'th_d', 'th_l'] as const).map((k) => <th key={k} className="px-1.5 py-2 text-end">{t(k)}</th>)}
                      <th className="hidden px-1.5 py-2 text-end sm:table-cell">{t('th_goals')}</th><th className="px-1.5 py-2 text-end">{t('th_pts')}</th>
                    </tr></thead>
                    <tbody>
                      {table.map((r) => (
                        <tr key={r.team_name} className={r.is_club ? 'bg-gold/45 font-bold' : 'border-t border-line'} data-club-row={r.is_club || undefined}>
                          <td className={`px-1.5 py-2 ${r.is_club ? 'rounded-s-xl' : ''}`}>
                            <span className={`grid size-7 place-items-center rounded-full text-xs font-black ${r.is_club ? 'bg-fg text-gold' : r.position === 1 ? 'bg-accent text-on-accent' : 'bg-surface'}`}>{r.position}</span>
                          </td>
                          <td className="px-1.5 py-2"><bdi className={r.is_club ? 'font-black' : 'font-semibold'}>{r.team_name}</bdi></td>
                          <td className="px-1.5 py-2 text-end">{r.played}</td><td className="px-1.5 py-2 text-end">{r.won}</td><td className="px-1.5 py-2 text-end">{r.drawn}</td><td className="px-1.5 py-2 text-end">{r.lost}</td>
                          <td className="hidden px-1.5 py-2 text-end sm:table-cell" dir="ltr">{r.goals_for}–{r.goals_against}</td>
                          <td className={`px-1.5 py-2 text-end text-base font-black ${r.is_club ? 'rounded-e-xl' : ''}`}>{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : records.length ? (
              <Card className="overflow-hidden !p-0">
                <Banner title={t('stand')} />
                <div className="overflow-x-auto px-3 pb-3 pt-2 sm:px-4">
                  <table className="w-full text-start text-sm tabular-nums">
                    <thead><tr className="text-xs font-bold uppercase tracking-wide text-muted">
                      <th className="px-1.5 py-2 text-start">#</th><th className="px-1.5 py-2 text-start">{t('th_team')}</th>
                      {(['th_p', 'th_w', 'th_d', 'th_l', 'th_pts'] as const).map((k) => <th key={k} className="px-1.5 py-2 text-end">{t(k)}</th>)}
                    </tr></thead>
                    <tbody>
                      {records.map((r, i) => (
                        <tr key={r.team_season_id} className="border-t border-line">
                          <td className="px-1.5 py-2"><span className="grid size-7 place-items-center rounded-full bg-surface text-xs font-black">{i + 1}</span></td><td className="px-1.5 py-2 font-bold">{r.team_name}</td>
                          <td className="px-1.5 py-2 text-end">{r.played}</td><td className="px-1.5 py-2 text-end">{r.won}</td><td className="px-1.5 py-2 text-end">{r.drawn}</td><td className="px-1.5 py-2 text-end">{r.lost}</td>
                          <td className="px-1.5 py-2 text-end text-base font-black">{r.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}
          </div>
        </Section>
      ) : null}


      <Section>
        <H2>{t('faq_h')}</H2>
        <div className="mt-4"><Faq items={[1, 2, 3].map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }))} /></div>
      </Section>

      <Section id="sponsors">
        <div className="flex items-center justify-between gap-3"><H2>{t('ourp')} {t('partners')}</H2><Link href="/sponsors" className="font-semibold text-pitch underline">{t('sp_all')} →</Link></div>
        <div className="mt-4 flex flex-wrap gap-3">
          {STRIP.map((s) => (
            <span key={s.name} className={`flex min-h-16 items-center rounded-card border bg-white px-5 py-3 font-display font-extrabold text-black ${s.kind === 'sp_main' ? 'border-accent' : 'border-line'}`}>
              {s.logo ? <Image src={s.logo.src} alt={s.name} width={s.logo.width} height={s.logo.height} className="h-10 w-auto" /> : s.name}
            </span>
          ))}
        </div>
      </Section>
    </>
  );
}
