import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { cancelSession, saveAttendance } from '@/app/actions/coach';
import { ReplyByForm } from '@/components/events/ReplyByForm';
import { EventTasks } from '@/components/events/EventTasks';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { ATTENDANCE } from '@/lib/coach';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('coach'))('sessionTitle') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type RosterRow = { jersey_number: number | null; players: { id: string; first_name: string; last_name: string } };

const AVATAR = ['#3DAF2C', '#0b0b0b', '#c0392b', '#2f5fb3', '#8e44ad', '#d35400', '#16a085', '#7f8c8d'];
// the marks as one-tap squares: ✓ present (green), L late (yellow fill, black text), ✕ absent (red), E excused (grey)
const MARK: Record<string, string> = { present: 'peer-checked:bg-accent peer-checked:text-on-accent', late: 'peer-checked:bg-gold peer-checked:text-ink-950', absent: 'peer-checked:bg-danger peer-checked:text-white', excused: 'peer-checked:bg-ink-950 peer-checked:text-white', '': '' };
const SYMBOL: Record<string, string> = { present: '✓', late: 'L', absent: '✕', excused: 'E', '': '–' };

/** One training session: details, cancel, and attendance marking (large touch targets, works without JavaScript). */
export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('coach');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [t, tav, rawLocale, supabase] = await Promise.all([getTranslations('coach'), getTranslations('availability'), getLocale(), getSupabase()]);
  if (!supabase) notFound();
  // RLS (sessions_read) only returns sessions of the coach's own teams.
  const { data: s } = await supabase.from('training_sessions')
    .select('id, title, focus, starts_at, ends_at, status, team_season_id, reply_by, locations(name), team_seasons!inner(teams!inner(name))').eq('id', id).maybeSingle();
  if (!s) notFound();
  const teamName = (s.team_seasons as unknown as { teams: { name: string } }).teams.name;
  const place = (s.locations as unknown as { name: string } | null)?.name;
  const tag = isLocale(rawLocale) ? LOCALE_LABELS[rawLocale].intl : 'en-GB';
  const day = new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIME_ZONE });
  const hm = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });

  const [{ data: rosterData }, { data: rows }] = await Promise.all([
    supabase.from('team_players').select('jersey_number, players!inner(id, first_name, last_name)').eq('team_season_id', s.team_season_id).is('left_on', null),
    supabase.from('session_attendance').select('player_id, availability, attendance, note').eq('session_id', id),
  ]);
  const roster = ((rosterData as unknown as RosterRow[] | null) ?? []).sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999) || a.players.last_name.localeCompare(b.players.last_name));
  const byPlayer = new Map((rows ?? []).map((r) => [r.player_id, r]));
  const markable = s.status !== 'cancelled' && helsinkiToday(new Date(s.starts_at)) <= helsinkiToday();
  const marked = roster.filter((r) => byPlayer.get(r.players.id)?.attendance).length;
  const back = `/coach/sessions/${id}`;
  const att = (a: string) => roster.filter((r) => byPlayer.get(r.players.id)?.attendance === a).length;
  const [present, late, absent, excused] = [att('present'), att('late'), att('absent'), att('excused')];
  const saidYes = roster.filter((r) => byPlayer.get(r.players.id)?.availability === 'yes').length;
  const pct = (n: number) => (roster.length ? Math.round((n / roster.length) * 100) : 0);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Link href={`/coach/teams/${s.team_season_id}`} className="text-sm font-semibold text-pitch underline underline-offset-2">← {teamName}</Link>
      <header className="rounded-card border border-line bg-raised p-6">
        <h1 className="font-display text-2xl font-extrabold">{s.title}</h1>
        <p className="mt-1 font-semibold">{day.format(new Date(s.starts_at))} · <span dir="ltr">{hm.format(new Date(s.starts_at))}–{hm.format(new Date(s.ends_at))}</span></p>
        <p className="text-muted">{teamName}{place ? ` · ${place}` : ''}</p>
        {s.focus ? <p className="mt-2">{t('focus')}: {s.focus}</p> : null}
        {s.status === 'scheduled' ? <ReplyByForm kind="training" id={s.id} replyBy={s.reply_by} back={`/coach/sessions/${s.id}`} /> : null}
        <p className="mt-2"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.status === 'cancelled' ? 'bg-danger/10 text-danger' : s.status === 'completed' ? 'bg-accent/20 text-pitch' : 'bg-line'}`}>{t(`ss_${s.status}` as 'ss_scheduled')}</span></p>
      </header>
      <ResultBanner ns="coach" result={sp.result} />

      <EventTasks db={supabase} kind="session" eventId={s.id} teamSeasonId={s.team_season_id} back={back} result={sp.result} />

      <section className="grid gap-3" aria-labelledby="att-h" data-attendance>
        {/* Alternative A: the count as a ring, one row per player with their answer and the marks, Save at the bottom */}
        <div className="flex items-center gap-4 rounded-card border border-line bg-raised p-4">
          <div className="grid size-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(rgb(var(--accent)) 0 ${pct(present)}%, #EDF70F ${pct(present)}% ${pct(present + late)}%, rgb(var(--line)) ${pct(present + late)}%)` }} aria-hidden>
            <span className="grid size-12 place-items-center rounded-full bg-raised font-display text-sm font-black tabular-nums" dir="ltr">{present + late}/{roster.length}</span>
          </div>
          <div className="grid gap-0.5 text-sm">
            <h2 id="att-h" className="font-display text-lg font-extrabold">{t('attendance')}</h2>
            <p data-marked><b className="text-pitch">{t('att_present')} {present}</b> · <b>{t('att_late')} {late}</b> · <b className="text-danger">{t('att_absent')} {absent}</b>{excused ? <> · {t('att_excused')} {excused}</> : null}</p>
            <p className="text-muted">{t('markedCount', { marked, total: roster.length })} · {t('saidYes', { count: saidYes })}</p>
          </div>
        </div>
        {s.status === 'cancelled' ? <p className="text-muted">{t('r_cancelled')}</p> : !markable ? <p className="text-muted">{t('notYet')}</p> : null}
        {roster.length === 0 ? <p className="text-muted">{t('noPlayers')}</p> : (
          <form action={saveAttendance}>
            <input type="hidden" name="session_id" value={id} /><input type="hidden" name="back" value={back} />
            <fieldset disabled={!markable} className="grid gap-3 disabled:opacity-60">
              <legend className="sr-only">{t('attendance')}</legend>
              <ul className="overflow-hidden rounded-card border border-line bg-raised">
                {roster.map((r, i) => {
                  const row = byPlayer.get(r.players.id); const cur = row?.attendance ?? '';
                  const name = `${r.players.first_name} ${r.players.last_name}`;
                  const said = row?.availability ?? 'pending';
                  return (
                    <li key={r.players.id} role="radiogroup" aria-label={name} data-player={name} className="flex items-center gap-2 border-b border-line px-2.5 py-2.5 last:border-0 sm:gap-3 sm:px-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full font-display text-xs font-extrabold text-white sm:size-10 sm:text-sm" style={{ background: AVATAR[i % AVATAR.length] }} aria-hidden>{r.players.first_name[0]}{r.players.last_name[0]}</span>
                      <span className="grid min-w-0 flex-1 leading-tight">
                        <span className="line-clamp-2 break-words font-bold"><bdi>{name}</bdi>{r.jersey_number ? <span className="ms-1.5 text-xs font-semibold text-muted" dir="ltr">#{r.jersey_number}</span> : null}</span>
                        <span className={`truncate text-xs font-semibold ${said === 'yes' ? 'text-pitch' : said === 'no' ? 'text-danger' : 'text-muted'}`} data-said={said}>
                          {said === 'pending' ? t('noAnswer') : tav(said)}{row?.note ? <> · “<bdi>{row.note}</bdi>”</> : null}</span>
                      </span>
                      <span className="flex shrink-0 gap-1">
                        {[...ATTENDANCE, ''].map((a) => (
                          <label key={a || 'none'} className={`relative block ${a === '' ? 'sr-only' : ''}`} title={a ? t(`att_${a}` as 'att_present') : '–'}>
                            <input type="radio" name={`att_${r.players.id}`} value={a} defaultChecked={cur === a} className="peer sr-only" />
                            <span className={`grid size-9 cursor-pointer place-items-center rounded-lg sm:size-10 sm:rounded-xl bg-surface text-sm font-black text-muted peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${MARK[a]}`} aria-hidden>{SYMBOL[a]}</span>
                            <span className="sr-only">{a ? t(`att_${a}` as 'att_present') : '–'}</span>
                          </label>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted">{t('marksLegend')}</p>
              <div className="sticky bottom-20 z-10 flex gap-2 rounded-full bg-surface/95 p-1.5 shadow-lg md:bottom-2">
                <button name="all" value="yes" className="min-h-12 flex-1 rounded-full border-2 border-fg bg-raised px-3 text-sm font-extrabold hover:bg-fg hover:text-raised" data-all-yes>{t('allYesPresent')}</button>
                <button className="min-h-12 flex-1 rounded-full bg-accent px-4 font-display font-bold text-on-accent hover:brightness-110">{t('saveAttendance')}</button>
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
