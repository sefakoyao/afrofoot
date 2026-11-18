import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { createSessions } from '@/app/actions/coach';
import { createMatch } from '@/app/actions/match';
import { EventForm, EventList, MeetFields, PublicField, type EventRow } from '@/components/events/EventParts';
import { LocationPicker } from '@/components/events/LocationPicker';
import { Replies } from '@/components/events/Replies';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { coachesTeam, myTeams } from '@/lib/coach';
import { getSupabase } from '@/lib/supabase/server';
import { missingConsent } from '@/lib/conduct';
import { STATUS_BADGE, shownStatus, type ContractStatus } from '@/lib/contracts';
import { relationLabel } from '@/lib/relations';
import { helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('coach'))('teamTitle') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const input = 'min-h-11 w-full rounded-control border border-line bg-raised px-3';
type RosterRow = { jersey_number: number | null; captain: boolean; players: { id: string; first_name: string; last_name: string; position: string | null; profile_id: string | null; photo_path: string | null } };
type Session = { id: string; title: string; starts_at: string; ends_at: string; status: string; session_attendance?: { player_id: string; availability: string; note: string | null }[] };

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
    supabase.from('team_players').select('jersey_number, captain, players!inner(id, first_name, last_name, position, profile_id, photo_path)').eq('team_season_id', id).is('left_on', null),
    supabase.from('training_sessions').select('id, title, starts_at, ends_at, status, session_attendance(player_id, availability, note)').eq('team_season_id', id).gte('starts_at', now).order('starts_at').limit(12),
    supabase.from('training_sessions').select('id, title, starts_at, ends_at, status').eq('team_season_id', id).lt('starts_at', now).order('starts_at', { ascending: false }).limit(10),
    supabase.from('session_attendance').select('player_id, attendance, training_sessions!inner(team_season_id, starts_at, status)')
      .eq('training_sessions.team_season_id', id).lt('training_sessions.starts_at', now).neq('training_sessions.status', 'cancelled').not('attendance', 'is', null),
    supabase.from('locations').select('id, name, city').eq('active', true).order('name'),
  ]);
  const roster = ((rosterData as unknown as RosterRow[] | null) ?? []).sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999) || a.players.last_name.localeCompare(b.players.last_name));
  const { data: contacts } = roster.length
    ? await supabase.from('player_private').select('player_id, phone, emergency_name, emergency_relation, emergency_phone').in('player_id', roster.map((r) => r.players.id))
    : { data: [] };
  const contact = new Map((contacts ?? []).map((c) => [c.player_id, c]));
  // Upcoming matches and friendlies with the players' sign in / out (Calendar tab, migration 0029).
  const { data: matchRows } = await supabase.from('matches').select('id, opponent, event_type, kickoff_at, status, live_state, squad_published').eq('team_season_id', id).gte('kickoff_at', new Date(Date.now() - 3 * 3600000).toISOString()).order('kickoff_at').limit(8);
  const { data: recent } = await supabase.from('matches').select('id, opponent, kickoff_at, goals_for, goals_against').eq('team_season_id', id).eq('status', 'played').order('kickoff_at', { ascending: false }).limit(5);
  // Players' contracts (migration 0031: coaches read the contracts of their own players, never drafts) and the coach's own Code of Conduct status.
  const { data: contractRows } = await supabase.from('player_contracts').select('id, player_id, status, ends_on, starts_on').in('player_id', roster.map((r) => r.players.id)).order('starts_on', { ascending: false });
  const contractOf = new Map<string, { id: string; status: ContractStatus; ends_on: string }>();
  for (const c of (contractRows ?? []) as { id: string; player_id: string; status: ContractStatus; ends_on: string }[]) if (!contractOf.has(c.player_id)) contractOf.set(c.player_id, c);
  const tk = await getTranslations('contract');
  const photoPaths = roster.map((r) => r.players.photo_path).filter((x): x is string => !!x);
  const { data: signedPhotos } = photoPaths.length ? await supabase.storage.from('player-photos').createSignedUrls(photoPaths, 3600) : { data: [] };
  const photoOf = new Map((signedPhotos ?? []).filter((x) => x.path && x.signedUrl).map((x) => [x.path!, x.signedUrl]));
  const [tm, trel] = await Promise.all([getTranslations('match'), getTranslations('relation')]);
  const { data: matchReplies } = (matchRows ?? []).length
    ? await supabase.from('match_availability').select('match_id, player_id, availability, note').in('match_id', (matchRows ?? []).map((m) => m.id)) : { data: [] };
  const nameOf = new Map(roster.map((r) => [r.players.id, `${r.players.first_name} ${r.players.last_name}`]));
  const noConduct = await missingConsent(supabase, roster.map((r) => r.players.profile_id).filter((x): x is string => !!x));
  const tc = await getTranslations('conduct');
  const rate = (pid: string) => {
    const rows = (att ?? []).filter((a) => a.player_id === pid && a.attendance !== 'excused');
    return rows.length ? Math.round((rows.filter((a) => a.attendance === 'present' || a.attendance === 'late').length / rows.length) * 100) : null;
  };
  const back = `/coach/teams/${id}`;
  // Other events (migration 0034): this team's and the club-wide ones, from yesterday on.
  const { data: eventRows } = await supabase.from('club_events')
    .select('id, kind, title, starts_at, ends_at, meet_at, meeting_point, status, public, team_season_id, description, locations(name, address, city, maps_url)')
    .or(`team_season_id.eq.${id},team_season_id.is.null`).gte('ends_at', new Date(Date.now() - 86400000).toISOString()).order('starts_at').limit(20);
  const hm = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const te = await getTranslations('events');

  const repliesOf = (rows: { player_id: string; availability: string; note: string | null }[] | undefined) =>
    (rows ?? []).filter((r) => nameOf.has(r.player_id)).map((r) => ({ player_id: r.player_id, name: nameOf.get(r.player_id)!, availability: r.availability, note: r.note }));
  const SessionRow = ({ s }: { s: Session }) => (
    <li className="py-1" data-session-row={s.id}>
      <Link href={`/coach/sessions/${s.id}`} data-session={s.id} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2 hover:text-pitch">
        <span><span className="font-semibold">{when.format(new Date(s.starts_at))}</span> · {s.title}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.status === 'cancelled' ? 'bg-danger/10 text-danger' : s.status === 'completed' ? 'bg-accent/20 text-pitch' : 'bg-line'}`}>{t(`ss_${s.status}` as 'ss_scheduled')}</span>
      </Link>
      {s.status === 'scheduled' ? <Replies rows={repliesOf(s.session_attendance)} /> : null}
    </li>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{team.name}</h1>
        <p className="mt-1 text-muted">{team.season}{team.division ? ` · ${team.division}` : ''}</p>
      </header>
      <ResultBanner ns="coach" result={sp.result} />
      <ResultBanner ns="match" result={sp.result} />
      <ResultBanner ns="events" result={sp.result} />

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
            <label className="grid gap-1 text-sm font-semibold">{t('repeat')}
              <select name="repeat" defaultValue="1" className={input}>{[1, 2, 4, 6, 8, 10, 12, 16, 20].map((n) => <option key={n} value={n}>{n === 1 ? t('once') : t('weeks', { count: n })}</option>)}</select></label>
            <MeetFields />
            <LocationPicker places={locations ?? []} className="sm:col-span-2" />
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t('focus')}<input name="focus" maxLength={200} placeholder={t('focusEg')} className={input} /></label>
            <PublicField className="sm:col-span-2" />
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

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="matches-h">
        <h2 id="matches-h" className="font-display text-xl font-extrabold">{tm('matchesTitle')}</h2>
        {(matchRows ?? []).length === 0 ? <p className="mt-2 text-muted">{t('noMatches')}</p> : (
          <ul className="mt-2 divide-y divide-line">
            {(matchRows ?? []).map((m) => {
              const rs = (matchReplies ?? []).filter((r) => r.match_id === m.id && nameOf.has(r.player_id));
              const who = (a: string) => rs.filter((r) => r.availability === a);
              const none = rs.filter((r) => r.availability !== 'yes' && r.availability !== 'no');
              return (
                <li key={m.id} className="py-3" data-match={m.opponent} data-replies={`${who('yes').length}/${who('no').length}/${none.length}`}>
                  <p><Link href={`/coach/matches/${m.id}`} data-match-link={m.id} className="font-semibold text-pitch underline underline-offset-2">{when.format(new Date(m.kickoff_at))} · <bdi>{t('vsOpponent', { opponent: m.opponent })}</bdi></Link>
                    {m.live_state !== 'not_started' && m.live_state !== 'full_time' ? <span className="ms-2 rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">{tm('liveBadge')}</span> : null}
                    {m.squad_published ? <span className="ms-2 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-bold text-pitch">{tm('published')}</span> : null}
                    {m.event_type === 'friendly' ? <span className="ms-2 rounded-full bg-line px-2 py-0.5 text-xs font-bold">{t('friendly')}</span> : null}
                    {m.status !== 'scheduled' ? <span className="ms-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">{t(`ms_${m.status}` as 'ms_cancelled')}</span> : null}</p>
                  {m.status === 'scheduled' ? <Replies rows={rs.map((r) => ({ player_id: r.player_id, name: nameOf.get(r.player_id)!, availability: r.availability, note: r.note }))} /> : null}
                </li>
              );
            })}
          </ul>
        )}
        {(recent ?? []).length ? (
          <>
            <h3 className="mt-5 text-xs font-bold uppercase tracking-widest text-muted">{tm('results')}</h3>
            <ul className="mt-1 divide-y divide-line">
              {(recent ?? []).map((m) => (
                <li key={m.id}><Link href={`/coach/matches/${m.id}`} className="flex min-h-11 items-center justify-between gap-2 py-1 hover:text-pitch">
                  <span>{when.format(new Date(m.kickoff_at))} · <bdi>{t('vsOpponent', { opponent: m.opponent })}</bdi></span>
                  <b className="tabular-nums" dir="ltr">{m.goals_for ?? 0}–{m.goals_against ?? 0}</b></Link></li>
              ))}
            </ul>
          </>
        ) : null}
        <details id="add-match" className="mt-4 rounded-card bg-surface p-4">
          <summary className="cursor-pointer font-semibold">{tm('addMatch')}</summary>
          <form action={createMatch} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="team_season_id" value={id} /><input type="hidden" name="back" value={back} />
            <fieldset className="grid gap-1 sm:col-span-2"><legend className="text-sm font-semibold">{tm('kind')}</legend>
              <div className="flex gap-2">{(['game', 'friendly'] as const).map((k) => (
                <label key={k} className="relative"><input type="radio" name="kind" value={k} defaultChecked={k === 'game'} className="peer sr-only" />
                  <span className="flex min-h-11 cursor-pointer items-center rounded-full border-2 border-line px-4 font-bold peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{tm(k)}</span></label>))}</div>
            </fieldset>
            <label className="grid gap-1 text-sm font-semibold">{tm('opponent')}<input name="opponent" required maxLength={120} className={input} /></label>
            <label className="grid gap-1 text-sm font-semibold">{tm('division')}<input name="division" maxLength={60} defaultValue={team.division ?? ''} placeholder="M4 Group A" className={input} />
              <span className="text-xs font-normal text-muted">{tm('divisionHint')}</span></label>
            <label className="grid gap-1 text-sm font-semibold">{t('date')}<input name="date" type="date" required min={helsinkiToday()} defaultValue={helsinkiToday()} className={input} /></label>
            <label className="grid gap-1 text-sm font-semibold">{tm('kickoffTime')}<input name="time" type="time" required defaultValue="18:00" className={input} /></label>
            <label className="grid gap-1 text-sm font-semibold">{tm('homeAway')}
              <select name="home_away" defaultValue="home" className={input}><option value="home">{tm('home')}</option><option value="away">{tm('away')}</option></select></label>
            <MeetFields match />
            <LocationPicker places={locations ?? []} className="sm:col-span-2" />
            <p className="text-xs text-muted sm:col-span-2">{tm('addMatchNote')}</p>
            <button className="min-h-11 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110 sm:col-span-2 sm:justify-self-start">{tm('addMatchButton')}</button>
          </form>
        </details>
      </section>

      <section id="events" className="rounded-card border border-line bg-raised p-6" aria-labelledby="events-h">
        <h2 id="events-h" className="font-display text-xl font-extrabold">{te('eventsTitle')}</h2>
        <EventList events={(eventRows ?? []) as unknown as EventRow[]} back={back} canChange={(e) => e.team_season_id === id} fmt={{ when, hm }}
          teamName={(x) => (x ? team.name : null)} />
        <details className="mt-4 rounded-card bg-surface p-4">
          <summary className="cursor-pointer font-semibold">{te('addEvent')}</summary>
          <EventForm back={back} places={locations ?? []} fixedTeam={id} />
        </details>
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
                    <p className="flex flex-wrap items-center gap-x-1 font-semibold">
                      {r.players.photo_path && photoOf.get(r.players.photo_path)
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={photoOf.get(r.players.photo_path) ?? undefined} alt="" className="me-1 size-8 rounded-full object-cover" data-roster-photo />
                        : <span aria-hidden className="me-1 flex size-8 items-center justify-center rounded-full bg-fg/10 text-[10px] font-black">{r.players.first_name[0]}{r.players.last_name[0]}</span>}
                      <span className="inline-block w-8 text-muted" dir="ltr">{r.jersey_number ? `#${r.jersey_number}` : ''}</span>
                      <bdi>{r.players.first_name} {r.players.last_name}</bdi>{r.captain ? <span className="ms-2 rounded-full bg-accent px-2 text-xs font-bold text-on-accent">C</span> : null}
                      {r.players.profile_id && noConduct.has(r.players.profile_id) ? <span className="ms-2 whitespace-nowrap rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white" data-conduct-flag>{tc('flagShort')}</span> : null}</p>
                    {(() => { const k = contractOf.get(r.players.id); if (!k) return <p className="ps-8 text-xs text-muted" data-contract="none">{tm('noContract')}</p>;
                      const st = shownStatus(k, helsinkiToday());
                      return <p className="ps-8 text-xs" data-contract={st}><Link href={`/coach/contracts/${k.id}`} className="font-semibold text-pitch underline underline-offset-2">{tk('myContract')}</Link> <span className={`ms-1 rounded-full px-2 py-0.5 font-bold ${STATUS_BADGE[st]}`}>{tk(`st_${st}`)}</span></p>; })()}
                    <p className="ps-8 text-sm text-muted">{r.players.position ? tpos(r.players.position) : '–'} · <span data-rate>{pct === null ? t('noAttendance') : t('attendanceRate', { rate: pct })}</span></p>
                    {c?.emergency_name ? <p className="ps-8 text-xs text-muted">{t('emergency')}: <bdi>{c.emergency_name}</bdi>{c.emergency_relation ? ` (${relationLabel(trel, c.emergency_relation)})` : ''}{c.emergency_phone ? <> · <a href={`tel:${c.emergency_phone}`} className="underline" dir="ltr">{c.emergency_phone}</a></> : null}</p> : null}
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
