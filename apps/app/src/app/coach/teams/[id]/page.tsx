import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { createSessions } from '@/app/actions/coach';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { coachesTeam, myTeams } from '@/lib/coach';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('coach'))('teamTitle') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const input = 'min-h-11 w-full rounded-control border border-line bg-raised px-3';
type RosterRow = { jersey_number: number | null; captain: boolean; players: { id: string; first_name: string; last_name: string; position: string | null } };
type Session = { id: string; title: string; starts_at: string; ends_at: string; status: string };

/** International phone → digits for wa.me links (WhatsApp wants the number without "+"). */
const waDigits = (phone: string) => phone.replace(/[^\d]/g, '');

export default async function CoachTeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const member = await requireArea('coach');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [t, tpos, rawLocale, supabase] = await Promise.all([getTranslations('coach'), getTranslations('position'), getLocale(), getSupabase()]);
  if (!supabase || !(await coachesTeam(supabase, member.id, id))) notFound(); // not this coach's team
  const team = (await myTeams(supabase, member.id)).find((x) => x.id === id)!;
  const tag = isLocale(rawLocale) ? LOCALE_LABELS[rawLocale].intl : 'en-GB';
  const when = new Intl.DateTimeFormat(tag, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const now = new Date().toISOString();

  const [{ data: rosterData }, { data: upcoming }, { data: past }, { data: att }, { data: locations }] = await Promise.all([
    supabase.from('team_players').select('jersey_number, captain, players!inner(id, first_name, last_name, position)').eq('team_season_id', id).is('left_on', null),
    supabase.from('training_sessions').select('id, title, starts_at, ends_at, status').eq('team_season_id', id).gte('starts_at', now).order('starts_at').limit(12),
    supabase.from('training_sessions').select('id, title, starts_at, ends_at, status').eq('team_season_id', id).lt('starts_at', now).order('starts_at', { ascending: false }).limit(10),
    supabase.from('session_attendance').select('player_id, attendance, training_sessions!inner(team_season_id, starts_at, status)')
      .eq('training_sessions.team_season_id', id).lt('training_sessions.starts_at', now).neq('training_sessions.status', 'cancelled').not('attendance', 'is', null),
    supabase.from('locations').select('id, name').order('name'),
  ]);
  const roster = ((rosterData as unknown as RosterRow[] | null) ?? []).sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999) || a.players.last_name.localeCompare(b.players.last_name));
  const { data: contacts } = roster.length
    ? await supabase.from('player_private').select('player_id, phone, emergency_name, emergency_relation, emergency_phone').in('player_id', roster.map((r) => r.players.id))
    : { data: [] };
  const contact = new Map((contacts ?? []).map((c) => [c.player_id, c]));
  const rate = (pid: string) => {
    const rows = (att ?? []).filter((a) => a.player_id === pid && a.attendance !== 'excused');
    return rows.length ? Math.round((rows.filter((a) => a.attendance === 'present' || a.attendance === 'late').length / rows.length) * 100) : null;
  };
  const back = `/coach/teams/${id}`;

  const SessionRow = ({ s }: { s: Session }) => (
    <li>
      <Link href={`/coach/sessions/${s.id}`} data-session={s.id} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2 hover:text-pitch">
        <span><span className="font-semibold">{when.format(new Date(s.starts_at))}</span> · {s.title}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.status === 'cancelled' ? 'bg-danger/10 text-danger' : s.status === 'completed' ? 'bg-accent/20 text-pitch' : 'bg-line'}`}>{t(`ss_${s.status}` as 'ss_scheduled')}</span>
      </Link>
    </li>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{team.name}</h1>
        <p className="mt-1 text-muted">{team.season}{team.division ? ` · ${team.division}` : ''}</p>
      </header>
      <ResultBanner ns="coach" result={sp.result} />

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="sched-h">
        <h2 id="sched-h" className="font-display text-xl font-extrabold">{t('schedule')}</h2>
        {(upcoming ?? []).length === 0 ? <p className="mt-2 text-muted">{t('noUpcoming')}</p>
          : <ul className="mt-2 divide-y divide-line">{(upcoming as Session[]).map((s) => <SessionRow key={s.id} s={s} />)}</ul>}

        <details className="mt-4 rounded-card bg-surface p-4" open={(upcoming ?? []).length === 0}>
          <summary className="cursor-pointer font-semibold">{t('addTraining')}</summary>
          <form action={createSessions} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="team_season_id" value={id} /><input type="hidden" name="back" value={back} />
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t('title')}<input name="title" required minLength={2} maxLength={120} defaultValue={t('defaultTitle')} className={input} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('date')}<input name="date" type="date" required min={helsinkiToday()} defaultValue={helsinkiToday()} className={input} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm font-semibold">{t('start')}<input name="start" type="time" required defaultValue="18:00" className={input} /></label>
              <label className="grid gap-1 text-sm font-semibold">{t('end')}<input name="end" type="time" required defaultValue="19:30" className={input} /></label>
            </div>
            <label className="grid gap-1 text-sm font-semibold">{t('location')}
              <select name="location_id" defaultValue="" className={input}><option value="">–</option>{(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold">{t('repeat')}
              <select name="repeat" defaultValue="1" className={input}>{[1, 2, 4, 6, 8, 10, 12, 16, 20].map((n) => <option key={n} value={n}>{n === 1 ? t('once') : t('weeks', { count: n })}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t('focus')}<input name="focus" maxLength={200} placeholder={t('focusEg')} className={input} /></label>
            <button className="min-h-11 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110 sm:col-span-2 sm:justify-self-start">{t('add')}</button>
          </form>
          <p className="mt-2 text-xs text-muted">{t('timesNote')}</p>
        </details>

        {(past ?? []).length ? (
          <>
            <h3 className="mt-5 text-xs font-bold uppercase tracking-widest text-muted">{t('recent')}</h3>
            <ul className="mt-1 divide-y divide-line">{(past as Session[]).map((s) => <SessionRow key={s.id} s={s} />)}</ul>
          </>
        ) : null}
      </section>

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="roster-h">
        <h2 id="roster-h" className="font-display text-xl font-extrabold">{t('players', { count: roster.length })}</h2>
        {roster.length === 0 ? <p className="mt-2 text-muted">{t('noPlayers')}</p> : (
          <ul className="mt-3 divide-y divide-line">
            {roster.map((r) => {
              const c = contact.get(r.players.id); const pct = rate(r.players.id);
              return (
                <li key={r.players.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center" data-player={`${r.players.first_name} ${r.players.last_name}`}>
                  <div>
                    <p className="font-semibold"><span className="inline-block w-8 text-muted" dir="ltr">{r.jersey_number ? `#${r.jersey_number}` : ''}</span>
                      <bdi>{r.players.first_name} {r.players.last_name}</bdi>{r.captain ? <span className="ms-2 rounded-full bg-accent px-2 text-xs font-bold text-on-accent">C</span> : null}</p>
                    <p className="ps-8 text-sm text-muted">{r.players.position ? tpos(r.players.position) : '–'} · <span data-rate>{pct === null ? t('noAttendance') : t('attendanceRate', { rate: pct })}</span></p>
                    {c?.emergency_name ? <p className="ps-8 text-xs text-muted">{t('emergency')}: <bdi>{c.emergency_name}</bdi>{c.emergency_relation ? ` (${c.emergency_relation})` : ''}{c.emergency_phone ? <> · <a href={`tel:${c.emergency_phone}`} className="underline" dir="ltr">{c.emergency_phone}</a></> : null}</p> : null}
                  </div>
                  <div className="flex gap-2 ps-8 sm:ps-0">
                    {c?.phone ? (
                      <>
                        <a href={`tel:${c.phone}`} aria-label={`${t('call')} ${r.players.first_name}`} className="inline-flex min-h-11 items-center rounded-full border-2 border-fg px-4 font-bold hover:bg-fg hover:text-raised">{t('call')}</a>
                        <a href={`https://wa.me/${waDigits(c.phone)}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${r.players.first_name}`} className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 font-bold text-on-accent hover:brightness-110">WhatsApp</a>
                      </>
                    ) : <span className="text-xs text-muted">{t('noPhone')}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
