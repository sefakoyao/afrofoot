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
import { deriveLeague, getLeagueData } from '@/lib/league';
import { Standings } from '@/components/Standings';
import { STRIP } from '@/lib/sponsors';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'site' });
  return { ...pageMeta({ locale, path: '/', title: t('seo_home_title'), description: t('seo_home') }), title: { absolute: t('seo_home_title') } };
}

// Rebuilt at most once a minute so the next match and results follow the member app without a deploy.
export const revalidate = 60;

async function getHomeData() {
  const [league, posts] = await Promise.all([getLeagueData(), getPosts(3)]);
  return { league, posts };
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
  const { league: data, posts } = await getHomeData();
  const league = deriveLeague(data);
  const { next, results } = league;
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
                {results[0].href ? <Link href={results[0].href} className="rounded-full bg-accent px-7 py-3 font-display font-bold text-on-accent" data-hero-game>{t('md_details')}</Link> : null}
                <Link href="/#standings" className={`rounded-full px-7 py-3 font-display font-bold ${results[0].href ? 'border-2 border-white' : 'bg-accent text-on-accent'}`}>{t('stand')}</Link>
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

      <Standings league={league} t={t} day={day} short={short} />


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
