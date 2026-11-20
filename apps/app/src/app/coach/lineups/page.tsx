import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { coachScope } from '@/lib/staff';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('lineups'))('title') };
}

type Game = { id: string; opponent: string; kickoff_at: string; home_away: string; event_type: string; status: string; formation: string | null; squad_published: boolean; team_season_id: string };

/**
 * Coach → Teams & events → Line-ups: the coach's teams' games from a week ago to two months ahead, each with how far the
 * line-up is (starters, substitutes, players who said yes), whether players can see it, and links to the line-up
 * builder on the game page and to the Matchday poster. Reads only what RLS gives coaches (matches_read, match_squad).
 */
export default async function LineupsPage() {
  const [scope, t, tc, tm, locale, supabase] = await Promise.all([coachScope(), getTranslations('lineups'), getTranslations('coach'), getTranslations('match'), getLocale(), getSupabase()]);
  const ids = (scope.teams ?? []).map((x) => x.id);
  const teamName = new Map((scope.teams ?? []).map((x) => [x.id, x.name]));
  const tag = isLocale(locale) ? LOCALE_LABELS[locale].intl : 'en-GB';
  const when = new Intl.DateTimeFormat(tag, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const since = new Date(Date.now() - 7 * 86400000).toISOString(), until = new Date(Date.now() + 62 * 86400000).toISOString();
  const { data } = supabase && ids.length
    ? await supabase.from('matches').select('id, opponent, kickoff_at, home_away, event_type, status, formation, squad_published, team_season_id')
      .in('team_season_id', ids).neq('status', 'cancelled').gte('kickoff_at', since).lte('kickoff_at', until).order('kickoff_at')
    : { data: [] };
  const games = (data ?? []) as Game[];
  const gameIds = games.map((g) => g.id);
  const [{ data: squad }, { data: replies }] = supabase && gameIds.length ? await Promise.all([
    supabase.from('match_squad').select('match_id, status').in('match_id', gameIds).in('status', ['starter', 'substitute']),
    supabase.from('match_availability').select('match_id, availability').in('match_id', gameIds).eq('availability', 'yes'),
  ]) : [{ data: [] }, { data: [] }];
  const count = (rows: { match_id: string }[] | null, id: string, f: (r: never) => boolean = () => true) => (rows ?? []).filter((r) => r.match_id === id && f(r as never)).length;
  const now = new Date().toISOString();
  const upcoming = games.filter((g) => g.kickoff_at >= now), recent = games.filter((g) => g.kickoff_at < now).reverse();

  const row = (g: Game) => {
    const starters = count(squad as { match_id: string; status: string }[] | null, g.id, (r: { status: string }) => r.status === 'starter');
    const subs = count(squad as { match_id: string; status: string }[] | null, g.id, (r: { status: string }) => r.status === 'substitute');
    const yes = count(replies as { match_id: string }[] | null, g.id);
    const state = starters === 0 ? 'none' : g.squad_published ? 'published' : 'draft';
    return (
      <li key={g.id} className="grid gap-2 rounded-card border border-line bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" data-lineup-game={g.id} data-lineup-state={state}>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold"><bdi>{tc('vsOpponent', { opponent: g.opponent })}</bdi>
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${state === 'published' ? 'bg-accent text-on-accent' : state === 'draft' ? 'bg-gold text-ink-950' : 'bg-line text-fg'}`}>{t(`state_${state}`)}</span></p>
          <p className="text-sm text-muted">{when.format(new Date(g.kickoff_at))} · <bdi>{teamName.get(g.team_season_id) ?? ''}</bdi> · {tm(g.home_away === 'away' ? 'away' : 'home')}{g.formation ? <> · <span dir="ltr">{g.formation}</span></> : null}</p>
          <p className="mt-1 text-sm" data-lineup-counts>{t('counts', { starters, subs, yes })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/coach/matches/${g.id}#lineup`} className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-sm font-bold text-on-accent hover:brightness-110" data-open-lineup>{starters ? t('edit') : t('make')}</Link>
          {starters ? <Link href={`/coach/poster?match=${g.id}`} className="inline-flex min-h-10 items-center rounded-full border-2 border-fg px-4 text-sm font-bold" data-open-poster>{t('poster')}</Link> : null}
        </div>
      </li>
    );
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
      </header>
      {ids.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-muted">{tc('noTeams')}</p> : (
        <>
          <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="up-h">
            <h2 id="up-h" className="font-display text-xl font-extrabold">{t('upcoming')}</h2>
            {upcoming.length ? <ul className="mt-3 grid gap-3">{upcoming.map(row)}</ul> : <p className="mt-2 text-muted">{t('noUpcoming')}</p>}
          </section>
          {recent.length ? (
            <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="rec-h">
              <h2 id="rec-h" className="font-display text-xl font-extrabold">{t('recent')}</h2>
              <ul className="mt-3 grid gap-3">{recent.map(row)}</ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
