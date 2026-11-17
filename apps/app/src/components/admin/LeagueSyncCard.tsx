import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { syncLeagueNow } from '@/app/actions/federation';
import { ResultBanner } from '@/components/ResultBanner';
import { getSupabase } from '@/lib/supabase/server';

/** Admin home: the Palloliitto league table's last update, the club's position, and "Update the league table now". */
export async function LeagueSyncCard({ result }: { result: unknown }) {
  const [t, raw, supabase] = await Promise.all([getTranslations('fed'), getLocale(), getSupabase()]);
  const tag = isLocale(raw) ? LOCALE_LABELS[raw].intl : 'en-GB';
  const when = new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE });
  const [{ data: run }, { data: rows }] = supabase ? await Promise.all([
    supabase.from('sync_runs').select('status, error, started_at, finished_at').eq('kind', 'federation').neq('status', 'running').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('public_standings').select('competition_external_id, category, season, position, team_name, is_club, points, played').order('season', { ascending: false }).limit(200),
  ]) : [{ data: null }, { data: [] }];
  type Row = { competition_external_id: string; category: string | null; season: number | null; position: number; team_name: string; is_club: boolean; points: number; played: number };
  const all = (rows ?? []) as Row[];
  const withGames = all.filter((r) => all.some((x) => x.competition_external_id === r.competition_external_id && x.played > 0));
  const latest = withGames[0]?.competition_external_id;
  const table = withGames.filter((r) => r.competition_external_id === latest);
  const club = table.find((r) => r.is_club);
  return (
    <section id="league" className="scroll-mt-24 rounded-card border border-line bg-raised p-6" data-league-sync>
      <h2 className="font-display text-lg font-extrabold">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted">{t('lead')}</p>
      <div className="mt-3"><ResultBanner ns="fed" result={result} /></div>
      {club ? <p className="mt-3 font-semibold" data-club-position>{t('club', { team: club.team_name, position: club.position, teams: table.length, points: club.points, competition: club.category ?? '', season: club.season ?? '' })}</p> : null}
      <p className="mt-1 text-sm text-muted" data-last-run={run?.status ?? 'none'}>
        {!run ? t('never') : run.status === 'ok' ? t('lastOk', { date: when.format(new Date(run.finished_at ?? run.started_at)) })
          : t('lastFailed', { date: when.format(new Date(run.started_at)), error: run.error ?? '?' })}
      </p>
      <form action={syncLeagueNow} className="mt-4">
        <button className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110" data-sync-now>{t('button')}</button>
      </form>
    </section>
  );
}
