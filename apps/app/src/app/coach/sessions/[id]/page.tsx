import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { cancelSession, saveAttendance } from '@/app/actions/coach';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { ATTENDANCE } from '@/lib/coach';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('coach'))('sessionTitle') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PILL: Record<string, string> = {
  present: 'peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent',
  late: 'peer-checked:border-fg peer-checked:bg-fg peer-checked:text-raised',
  absent: 'peer-checked:border-danger peer-checked:bg-danger peer-checked:text-white',
  excused: 'peer-checked:border-muted peer-checked:bg-muted peer-checked:text-white',
  '': 'peer-checked:border-fg peer-checked:bg-line',
};
type RosterRow = { jersey_number: number | null; players: { id: string; first_name: string; last_name: string } };

/** One training session: details, cancel, and attendance marking (large touch targets, works without JavaScript). */
export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('coach');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [t, tav, rawLocale, supabase] = await Promise.all([getTranslations('coach'), getTranslations('availability'), getLocale(), getSupabase()]);
  if (!supabase) notFound();
  // RLS (sessions_read) only returns sessions of the coach's own teams.
  const { data: s } = await supabase.from('training_sessions')
    .select('id, title, focus, starts_at, ends_at, status, team_season_id, locations(name), team_seasons!inner(teams!inner(name))').eq('id', id).maybeSingle();
  if (!s) notFound();
  const teamName = (s.team_seasons as unknown as { teams: { name: string } }).teams.name;
  const place = (s.locations as unknown as { name: string } | null)?.name;
  const tag = isLocale(rawLocale) ? LOCALE_LABELS[rawLocale].intl : 'en-GB';
  const day = new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIME_ZONE });
  const hm = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });

  const [{ data: rosterData }, { data: rows }] = await Promise.all([
    supabase.from('team_players').select('jersey_number, players!inner(id, first_name, last_name)').eq('team_season_id', s.team_season_id).is('left_on', null),
    supabase.from('session_attendance').select('player_id, availability, attendance').eq('session_id', id),
  ]);
  const roster = ((rosterData as unknown as RosterRow[] | null) ?? []).sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999) || a.players.last_name.localeCompare(b.players.last_name));
  const byPlayer = new Map((rows ?? []).map((r) => [r.player_id, r]));
  const markable = s.status !== 'cancelled' && helsinkiToday(new Date(s.starts_at)) <= helsinkiToday();
  const marked = roster.filter((r) => byPlayer.get(r.players.id)?.attendance).length;
  const back = `/coach/sessions/${id}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Link href={`/coach/teams/${s.team_season_id}`} className="text-sm font-semibold text-pitch underline underline-offset-2">← {teamName}</Link>
      <header className="rounded-card border border-line bg-raised p-6">
        <h1 className="font-display text-2xl font-extrabold">{s.title}</h1>
        <p className="mt-1 font-semibold">{day.format(new Date(s.starts_at))} · <span dir="ltr">{hm.format(new Date(s.starts_at))}–{hm.format(new Date(s.ends_at))}</span></p>
        <p className="text-muted">{teamName}{place ? ` · ${place}` : ''}</p>
        {s.focus ? <p className="mt-2">{t('focus')}: {s.focus}</p> : null}
        <p className="mt-2"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.status === 'cancelled' ? 'bg-danger/10 text-danger' : s.status === 'completed' ? 'bg-accent/20 text-pitch' : 'bg-line'}`}>{t(`ss_${s.status}` as 'ss_scheduled')}</span></p>
      </header>
      <ResultBanner ns="coach" result={sp.result} />

      <section className="rounded-card border border-line bg-raised p-4 sm:p-6" aria-labelledby="att-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="att-h" className="font-display text-xl font-extrabold">{t('attendance')}</h2>
          <span className="text-sm text-muted" data-marked>{t('markedCount', { marked, total: roster.length })}</span>
        </div>
        {s.status === 'cancelled' ? <p className="mt-2 text-muted">{t('r_cancelled')}</p> : !markable ? <p className="mt-2 text-muted">{t('notYet')}</p> : null}
        {roster.length === 0 ? <p className="mt-2 text-muted">{t('noPlayers')}</p> : (
          <form action={saveAttendance} className="mt-3">
            <input type="hidden" name="session_id" value={id} /><input type="hidden" name="back" value={back} />
            <fieldset disabled={!markable} className="grid gap-3 disabled:opacity-60">
              <legend className="sr-only">{t('attendance')}</legend>
              {roster.map((r) => {
                const row = byPlayer.get(r.players.id); const cur = row?.attendance ?? '';
                return (
                  <div key={r.players.id} role="radiogroup" aria-label={`${r.players.first_name} ${r.players.last_name}`} data-player={`${r.players.first_name} ${r.players.last_name}`} className="rounded-card bg-surface p-3">
                    <p className="font-semibold"><span className="text-muted" dir="ltr">{r.jersey_number ? `#${r.jersey_number} ` : ''}</span><bdi>{r.players.first_name} {r.players.last_name}</bdi>
                      {row && row.availability !== 'pending' ? <span className="ms-2 text-xs font-normal text-muted">({t('replied')}: {tav(row.availability)})</span> : null}</p>
                    <div className="mt-2 grid grid-cols-5 gap-1.5">
                      {[...ATTENDANCE, ''].map((a) => (
                        <label key={a || 'none'} className="relative block">
                          <input type="radio" name={`att_${r.players.id}`} value={a} defaultChecked={cur === a} className="peer sr-only" />
                          <span className={`flex min-h-11 cursor-pointer items-center justify-center rounded-full border-2 border-line bg-raised px-1 text-center text-xs font-bold sm:text-sm peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${PILL[a]}`}>
                            {a ? t(`att_${a}` as 'att_present') : '–'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="sticky bottom-2 mt-2 flex flex-wrap gap-2 rounded-card bg-raised/95 p-2 shadow-lg">
                <button className="min-h-12 flex-1 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">{t('saveAttendance')}</button>
                <button name="all" value="present" className="min-h-12 rounded-full border-2 border-fg px-5 font-bold hover:bg-fg hover:text-raised">{t('allPresent')}</button>
              </div>
            </fieldset>
          </form>
        )}
      </section>

      {s.status === 'scheduled' ? (
        <form action={cancelSession} className="justify-self-start">
          <input type="hidden" name="session_id" value={id} /><input type="hidden" name="back" value={`/coach/teams/${s.team_season_id}`} />
          <button className="min-h-11 rounded-full border-2 border-danger px-5 font-bold text-danger hover:bg-danger/10">{t('cancelSession')}</button>
        </form>
      ) : null}
    </div>
  );
}
