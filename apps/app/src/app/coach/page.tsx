import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { requireArea } from '@/lib/auth';
import { myTeams } from '@/lib/coach';
import { isolate } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { loadConductStatus } from '@/lib/conduct';

type Session = { id: string; title: string; starts_at: string; ends_at: string; status: string; team_season_id: string };

/**
 * Coach home: my teams this season, past sessions that still need attendance (the to-do list) and the next sessions.
 * Everything is limited by the database to the teams this coach is assigned to.
 */
export default async function CoachHome() {
  const member = await requireArea('coach');
  const [t, ta, rawLocale, supabase] = await Promise.all([getTranslations('coach'), getTranslations('app'), getLocale(), getSupabase()]);
  const tag = isLocale(rawLocale) ? LOCALE_LABELS[rawLocale].intl : 'en-GB';
  const when = new Intl.DateTimeFormat(tag, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const teams = supabase ? await myTeams(supabase, member.id) : [];
  const ids = teams.map((x) => x.id);
  const name = new Map(teams.map((x) => [x.id, x.name]));
  const now = new Date().toISOString();
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();

  const [{ data: upcoming }, { data: todo }, { data: roster }] = supabase && ids.length ? await Promise.all([
    supabase.from('training_sessions').select('id, title, starts_at, ends_at, status, team_season_id').in('team_season_id', ids).gte('starts_at', now).neq('status', 'cancelled').order('starts_at').limit(6),
    supabase.from('training_sessions').select('id, title, starts_at, ends_at, status, team_season_id').in('team_season_id', ids).lt('starts_at', now).gte('starts_at', since).eq('status', 'scheduled').order('starts_at', { ascending: false }),
    supabase.from('team_players').select('team_season_id').in('team_season_id', ids).is('left_on', null),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const [{ data: nextMatches }, conduct] = supabase && ids.length ? await Promise.all([
    supabase.from('matches').select('id, opponent, kickoff_at, team_season_id, live_state, meet_at').in('team_season_id', ids).gte('kickoff_at', new Date(Date.now() - 3 * 3600000).toISOString()).neq('status', 'cancelled').order('kickoff_at').limit(3),
    loadConductStatus(supabase, member.id),
  ]) : [{ data: [] }, supabase ? await loadConductStatus(supabase, member.id) : null];
  const tm = await getTranslations('match');
  const tc = await getTranslations('conduct');
  const count = (id: string) => (roster ?? []).filter((r) => r.team_season_id === id).length;

  const SessionItem = ({ s, cta }: { s: Session; cta: string }) => (
    <li>
      <Link href={`/coach/sessions/${s.id}`} data-session={s.id} className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-raised px-4 py-3 hover:border-accent">
        <span><span className="font-semibold">{when.format(new Date(s.starts_at))}</span> · {s.title}<span className="block text-sm text-muted">{name.get(s.team_season_id)}</span></span>
        <span className="text-sm font-bold text-pitch">{cta} <span aria-hidden className="rtl-flip inline-block">→</span></span>
      </Link>
    </li>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <section className="rounded-card border border-line bg-raised p-6">
        <h1 className="font-display text-2xl font-extrabold">{ta('welcome', { name: isolate(member.firstName || member.email) })}</h1>
        <p className="mt-1 text-muted">{t('lead')}</p>
      </section>

      {conduct?.version && !conduct.agreedAt ? (
        <div data-conduct-banner className="flex flex-wrap items-center justify-between gap-3 rounded-card border-2 border-danger/40 bg-danger/5 p-4">
          <p className="font-semibold">{tc('coachBanner')}</p>
          <Link href="/coach/conduct" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">{tc('readAndAgree')}</Link>
        </div>
      ) : null}
      {(nextMatches ?? []).length ? (
        <section aria-labelledby="nm-h" className="rounded-card border-2 border-fg bg-raised p-6">
          <h2 id="nm-h" className="font-display text-xl font-extrabold">{tm('nextMatches')}</h2>
          <ul className="mt-3 grid gap-2">
            {(nextMatches ?? []).map((m) => (
              <li key={m.id}><Link href={`/coach/matches/${m.id}`} data-next-match={m.id} className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface px-4 py-3 hover:border-accent">
                <span><span className="font-semibold">{when.format(new Date(m.kickoff_at))}</span> · <bdi>{t('vsOpponent', { opponent: m.opponent })}</bdi><span className="block text-sm text-muted">{name.get(m.team_season_id)}</span></span>
                <span className="text-sm font-bold text-pitch">{m.live_state !== 'not_started' && m.live_state !== 'full_time' ? tm('liveBadge') : tm('openMatchDay')} <span aria-hidden className="rtl-flip inline-block">→</span></span>
              </Link></li>
            ))}
          </ul>
        </section>
      ) : null}

      {teams.length === 0 ? <p role="status" className="rounded-card border border-line bg-raised p-6">{t('noTeams')}</p> : (
        <>
          {(todo ?? []).length ? (
            <section aria-labelledby="todo-h" className="rounded-card border-2 border-accent bg-raised p-6">
              <h2 id="todo-h" className="font-display text-xl font-extrabold">{t('todoTitle', { count: (todo ?? []).length })}</h2>
              <p className="mt-1 text-sm text-muted">{t('todoLead')}</p>
              <ul className="mt-3 grid gap-2">{(todo as Session[]).map((s) => <SessionItem key={s.id} s={s} cta={t('markAttendance')} />)}</ul>
            </section>
          ) : null}

          <section aria-labelledby="teams-h">
            <h2 id="teams-h" className="mb-3 font-display text-xl font-extrabold">{t('myTeams')}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {teams.map((x) => (
                <li key={x.id}>
                  <Link href={`/coach/teams/${x.id}`} data-team={x.name} className="block rounded-card border border-line bg-raised p-5 hover:border-accent">
                    <p className="font-display text-lg font-extrabold">{x.name}</p>
                    <p className="text-sm text-muted">{x.season}{x.division ? ` · ${x.division}` : ''}</p>
                    <p className="mt-2 text-sm">{t('playersCount', { count: count(x.id) })}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="next-h">
            <h2 id="next-h" className="mb-3 font-display text-xl font-extrabold">{t('upcoming')}</h2>
            {(upcoming ?? []).length === 0 ? <p className="rounded-card border border-line bg-raised p-5 text-muted">{t('noUpcoming')}</p>
              : <ul className="grid gap-2">{(upcoming as Session[]).map((s) => <SessionItem key={s.id} s={s} cta={t('open')} />)}</ul>}
          </section>
        </>
      )}
    </div>
  );
}
