import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { Faq } from '@/components/Faq';
import { NewsCard } from '@/components/NewsCard';
import { getPosts, type Post } from '@/lib/news';
import Image from 'next/image';
import { HeroSlider } from '@/components/HeroSlider';
import { ButtonLink, Card, H2, Section, Tag } from '@/components/Page';
import { Link } from '@/i18n/routing';
import { getPublicClient } from '@/lib/supabase';
import { STRIP } from '@/lib/sponsors';

interface Fixture { id: string; team_name: string; opponent: string; home_away: string | null; kickoff_at: string; status: string; goals_for: number | null; goals_against: number | null; venue: string | null; city: string | null }
interface Record_ { team_season_id: string; team_name: string; competition: string; played: number; won: number; drawn: number; lost: number; points: number }

async function getHomeData() {
  const db = getPublicClient();
  if (!db) return { fixtures: [] as Fixture[], records: [] as Record_[], posts: [] as Post[] };
  const [f, r, n] = await Promise.all([
    db.from('public_fixtures').select('id,team_name,opponent,home_away,kickoff_at,status,goals_for,goals_against,venue,city').order('kickoff_at', { ascending: false }).limit(40),
    db.from('public_team_records').select('team_season_id,team_name,competition,played,won,drawn,lost,points').order('points', { ascending: false }).limit(12),
    getPosts(3),
  ]);
  return { fixtures: (f.data ?? []) as Fixture[], records: (r.data ?? []) as Record_[], posts: n };
}

const vs = (m: Fixture) => (m.home_away === 'away' ? `${m.opponent}  vs  ${m.team_name}` : `${m.team_name}  vs  ${m.opponent}`);

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('site');
  const l = (locale in LOCALE_LABELS ? locale : 'en') as Locale;
  const intl = LOCALE_LABELS[l].intl;
  const when = new Intl.DateTimeFormat(intl, { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Helsinki' });
  const day = new Intl.DateTimeFormat(intl, { dateStyle: 'long', timeZone: 'Europe/Helsinki' });
  const short = new Intl.DateTimeFormat(intl, { day: '2-digit', month: '2-digit', timeZone: 'Europe/Helsinki' });
  const { fixtures, records, posts } = await getHomeData();
  const now = Date.now();
  const next = fixtures.filter((m) => m.status === 'scheduled' && new Date(m.kickoff_at).getTime() >= now).sort((a, b) => +new Date(a.kickoff_at) - +new Date(b.kickoff_at))[0];
  const results = fixtures.filter((m) => m.status === 'played').slice(0, 3);
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
                {([['102+', 'players'], ['40+', 'nations'], ['2020', 'founded']] as const).map(([n, k]) => (
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
              <span className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">{t('hs_k2')} · {next.team_name}</span>
              <h2 className="font-display text-5xl font-black md:text-6xl">{vs(next)}</h2>
              <p className="text-lg text-white/80">{when.format(new Date(next.kickoff_at))}{next.venue ? ` · ${next.venue}${next.city ? `, ${next.city}` : ''}` : ''}</p>
              <div><Link href="/team" className="inline-block rounded-full bg-accent px-7 py-3 font-display font-bold text-on-accent">{t('cal')}</Link></div>
            </div>,
          ] : []),
          ...(results[0] ? [
            <div key="result" className="grid gap-4">
              <span className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold text-on-accent">{t('hs_k3')} · {results[0].team_name}</span>
              <h2 className="font-display text-5xl font-black md:text-6xl" dir="ltr">{vs(results[0])} <span className="text-accent">{results[0].goals_for} – {results[0].goals_against}</span></h2>
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
              <Tag solid>{next.team_name}</Tag>
              <p className="mt-2 font-display text-2xl font-extrabold">{vs(next)}</p>
              <p className="text-muted">{when.format(new Date(next.kickoff_at))}{next.venue ? ` · ${next.venue}${next.city ? `, ${next.city}` : ''}` : ''}</p>
            </div>
            <ButtonLink href="/team">{t('cal')}</ButtonLink>
          </Card>
        </Section>
      ) : null}

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
            ...(appUrl ? [{ href: appUrl, k: 'tile1', external: true }] : []),
            { href: '/membership', k: 'tile2', external: false }, { href: '/sponsors', k: 'tile3', external: false },
          ].map(({ href, k, external }) => (
            <Card key={k}>
              <h3 className="font-display text-xl font-extrabold">{t(k)}</h3><p className="mt-1 text-muted">{t(`${k}p`)}</p>
              <p className="mt-3">{external
                ? <a href={href} className="font-semibold text-pitch underline">→</a>
                : <Link href={href} className="font-semibold text-pitch underline">→</Link>}</p>
            </Card>
          ))}
        </div>
      </Section>

      {records.length || results.length ? (
        <Section id="standings">
          <H2>{t('stand')}</H2>
          <p className="mb-4 mt-1 text-sm text-muted">{t('sync')}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {results.length ? (
              <Card>
                <h3 className="font-display text-xl font-extrabold">{t('res_h')}</h3>
                <ul className="mt-3 divide-y divide-line">
                  {results.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-x-3 py-2">
                      <span className="text-sm text-muted">{short.format(new Date(m.kickoff_at))}</span>
                      <b>{vs(m)}</b><span className="font-display font-black">{m.goals_for} – {m.goals_against}</span><em className="text-sm text-muted">{t('lastm')}</em>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {records.length ? (
              <Card className="overflow-x-auto">
                <table className="w-full text-start">
                  <thead><tr className="text-sm text-muted">
                    <th className="p-1 text-start">#</th><th className="p-1 text-start">{t('th_team')}</th>
                    {(['th_p', 'th_w', 'th_d', 'th_l', 'th_pts'] as const).map((k) => <th key={k} className="p-1 text-end">{t(k)}</th>)}
                  </tr></thead>
                  <tbody>
                    {records.map((r, i) => (
                      <tr key={r.team_season_id} className="border-t border-line">
                        <td className="p-1">{i + 1}</td><td className="p-1 font-bold">{r.team_name}</td>
                        <td className="p-1 text-end">{r.played}</td><td className="p-1 text-end">{r.won}</td><td className="p-1 text-end">{r.drawn}</td><td className="p-1 text-end">{r.lost}</td>
                        <td className="p-1 text-end font-black">{r.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : null}
          </div>
        </Section>
      ) : null}

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

      <Section>
        <H2>{t('faq_h')}</H2>
        <div className="mt-4"><Faq items={[1, 2, 3].map((n) => ({ q: t(`faq${n}q`), a: t(`faq${n}a`) }))} /></div>
      </Section>
    </>
  );
}
