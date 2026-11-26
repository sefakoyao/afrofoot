import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { setEventStatus } from '@/app/actions/events';
import { EventForm } from '@/components/events/EventParts';
import { PinIcon } from '@/components/events/LocationPicker';
import type { ReplyRow } from '@/components/events/Replies';
import { ResultBanner } from '@/components/ResultBanner';
import { inScope, type Scope } from '@/lib/staff';
import { mapsLinkFor } from '@/lib/locations';
import { loadOpponents } from '@/lib/opponents';
import { getSupabase } from '@/lib/supabase/server';

type Place = { name: string; address: string | null; city: string | null; maps_url: string | null };
type Group = 'training' | 'game' | 'event';
const FILTERS = ['week', 'training', 'game', 'event', 'cancelled'] as const;
type Filter = (typeof FILTERS)[number];
/** One line of the upcoming list: a training, a game (league or friendly) or another club / team event. */
interface Row {
  id: string; kind: string; group: Group; title: string; at: string; status: string; team: string | null; place: Place | null;
  extra: string | null; public: boolean | null; meetAt: string | null; meetingPoint: string | null; description: string | null;
  href: string | null; canChange: boolean; replies: ReplyRow[] | null;
}
const KIND_CHIP: Record<string, string> = { training: 'bg-accent/15 text-pitch', game: 'bg-gold text-ink-950', friendly: 'border border-fg/25' };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Teams & events → Events (migration 0034), for admins (/admin/events) and coaches (/coach/events), in the Members page's
 * layout: tiles and filters on top, then every upcoming training, game and event in one list by date (today, tomorrow,
 * the next 7 days, later) with the players' replies and a ⋯ menu, then "Add an event" and the saved places.
 * Admins see every team and the whole club; a coach the whole club and the teams they coach.
 */
export async function EventsView({ sp, scope }: { sp: Record<string, string | string[] | undefined>; scope: Scope }) {
  const coach = scope.area === 'coach';
  const [t, tm, tc, rawLocale, supabase] = await Promise.all([getTranslations('events'), getTranslations('match'), getTranslations('coach'), getLocale(), getSupabase()]);
  const tag = isLocale(rawLocale) ? LOCALE_LABELS[rawLocale].intl : 'en-GB';
  const hm = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const wd = new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: TIME_ZONE });
  const dd = new Intl.DateTimeFormat(tag, { day: 'numeric', timeZone: TIME_ZONE });
  const mon = new Intl.DateTimeFormat(tag, { month: 'short', timeZone: TIME_ZONE });
  const dayKey = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TIME_ZONE });
  const nowIso = new Date().toISOString();
  const places = 'locations(name, address, city, maps_url)';
  const [{ data: events }, { data: teamRows }, { data: saved }, { data: sessions }, { data: games }] = supabase ? await Promise.all([
    supabase.from('club_events').select(`id, kind, title, starts_at, ends_at, meet_at, meeting_point, status, public, team_season_id, description, ${places}`)
      .gte('ends_at', new Date(Date.now() - 86400000).toISOString()).order('starts_at').limit(60),
    supabase.from('team_seasons').select('id, teams!inner(name), seasons!inner(is_current)').eq('seasons.is_current', true),
    supabase.from('locations').select('id, name, address, city, maps_url').eq('active', true).order('name'),
    supabase.from('training_sessions').select(`id, title, starts_at, status, team_season_id, ${places}`).gte('starts_at', nowIso).order('starts_at').limit(40),
    supabase.from('matches').select(`id, opponent, event_type, division, home_away, kickoff_at, status, team_season_id, ${places}`).gte('kickoff_at', nowIso).order('kickoff_at').limit(40),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  // a coach: whole-club events and the teams they coach (RLS gives the same; this keeps other teams' rows out)
  const mine = <T extends { team_season_id: string | null }>(rows: unknown) => ((rows ?? []) as T[]).filter((r) => !coach || r.team_season_id === null || inScope(scope, r.team_season_id));
  const teamHref = (id: string | null) => (id && !coach ? `/admin/teams/${id}` : null);
  type Sport = { id: string; status: string; team_season_id: string; locations: Place | null };
  const base = { public: null, meetAt: null, meetingPoint: null, description: null, canChange: false, replies: [] as ReplyRow[] };
  const all: Row[] = [
    ...mine<Sport & { title: string; starts_at: string }>(sessions).map((x): Row => ({ ...base, id: x.id, kind: 'training', group: 'training', title: x.title, at: x.starts_at,
      status: x.status, team: x.team_season_id, place: x.locations, extra: null, href: coach ? `/coach/sessions/${x.id}` : teamHref(x.team_season_id) })),
    ...mine<Sport & { opponent: string; event_type: 'game' | 'friendly'; division: string | null; home_away: string; kickoff_at: string }>(games).map((x): Row => ({ ...base, id: x.id,
      kind: x.event_type, group: 'game', title: tc('vsOpponent', { opponent: x.opponent }), at: x.kickoff_at, status: x.status, team: x.team_season_id, place: x.locations,
      extra: [x.division, tm(x.home_away === 'away' ? 'away' : 'home')].filter(Boolean).join(' · '), href: coach ? `/coach/matches/${x.id}` : teamHref(x.team_season_id) })),
    ...mine<{ id: string; kind: string; title: string; starts_at: string; meet_at: string | null; meeting_point: string | null; status: string; public: boolean; team_season_id: string | null; description: string | null; locations: Place | null }>(events)
      .map((e): Row => ({ id: e.id, kind: e.kind, group: 'event', title: e.title, at: e.starts_at, status: e.status, team: e.team_season_id, place: e.locations, extra: null,
        public: e.public, meetAt: e.meet_at, meetingPoint: e.meeting_point, description: e.description, href: teamHref(e.team_season_id),
        canChange: !coach || inScope(scope, e.team_season_id), replies: null })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  // the players' replies to the listed trainings and games, with names (admin_all on both tables and on players)
  const trainingIds = all.filter((x) => x.group === 'training').map((x) => x.id), gameIds = all.filter((x) => x.group === 'game').map((x) => x.id);
  type Reply = { player_id: string; availability: string; note: string | null; session_id?: string; match_id?: string; players: { first_name: string; last_name: string } | null };
  const [{ data: sessionReplies }, { data: gameReplies }] = supabase ? await Promise.all([
    trainingIds.length ? supabase.from('session_attendance').select('session_id, player_id, availability, note, players(first_name, last_name)').in('session_id', trainingIds) : Promise.resolve({ data: [] }),
    gameIds.length ? supabase.from('match_availability').select('match_id, player_id, availability, note, players(first_name, last_name)').in('match_id', gameIds) : Promise.resolve({ data: [] }),
  ]) : [{ data: [] }, { data: [] }];
  const replyMap = new Map<string, ReplyRow[]>();
  for (const r of [...((sessionReplies ?? []) as unknown as Reply[]), ...((gameReplies ?? []) as unknown as Reply[])]) {
    const key = r.session_id ?? r.match_id ?? '';
    replyMap.set(key, [...(replyMap.get(key) ?? []), { player_id: r.player_id, name: r.players ? `${r.players.first_name} ${r.players.last_name}` : '–', availability: r.availability, note: r.note }]);
  }
  for (const x of all) if (x.group !== 'event') x.replies = replyMap.get(x.id) ?? [];

  const teams = coach ? scope.teams.map((x) => ({ id: x.id, name: x.name })) : ((teamRows ?? []) as unknown as { id: string; teams: { name: string } }[]).map((x) => ({ id: x.id, name: x.teams.name }));
  const teamName = new Map(teams.map((x) => [x.id, x.name]));
  const back = `/${scope.area}/events`;

  // filters (?f=, ?team=) and the tiles' numbers (cancelled ones are not counted)
  const f = (FILTERS as readonly string[]).includes(one(sp.f)) ? (one(sp.f) as Filter) : '';
  const team = one(sp.team) === 'club' || teamName.has(one(sp.team)) ? one(sp.team) : '';
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString();
  const byTeam = all.filter((x) => !team || (team === 'club' ? x.team === null : x.team === team));
  const live = byTeam.filter((x) => x.status !== 'cancelled');
  const count = (k: Filter) => k === 'cancelled' ? byTeam.length - live.length : k === 'week' ? live.filter((x) => x.at < weekEnd).length : live.filter((x) => x.group === k).length;
  const rows = byTeam.filter((x) => !f ? true : f === 'cancelled' ? x.status === 'cancelled' : x.status !== 'cancelled' && (f === 'week' ? x.at < weekEnd : x.group === f));
  const params = (p: { f?: string; team?: string }) => {
    const q = new URLSearchParams();
    const nf = 'f' in p ? p.f : f, nt = 'team' in p ? p.team : team;
    if (nf) q.set('f', nf); if (nt) q.set('team', nt);
    const s = q.toString(); return s ? `${back}?${s}` : back;
  };

  // groups by Helsinki day: today, tomorrow, the next 7 days, later
  const today = dayKey.format(new Date()), tomorrow = dayKey.format(new Date(Date.now() + 86400000));
  const bucket = (x: Row) => { const d = dayKey.format(new Date(x.at)); return d <= today ? 'today' : d === tomorrow ? 'tomorrow' : x.at < weekEnd ? 'week' : 'later'; };
  const groups = (['today', 'tomorrow', 'week', 'later'] as const).map((g) => ({ g, list: rows.filter((x) => bucket(x) === g) })).filter((x) => x.list.length);
  const addOpen = one(sp.add) === '1' || all.length === 0;

  const pill = (key: Filter | '', label: string) => (
    <Link href={params({ f: key })} aria-current={f === key ? 'true' : undefined} data-filter={key || 'all'}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold ${f === key ? 'border-fg bg-fg text-white' : 'border-line bg-raised hover:border-accent'}`}>
      {label}<span className={f === key ? 'text-white/70' : 'text-muted'}>{key ? count(key) : byTeam.length}</span>
    </Link>
  );
  const tile = (key: Filter, label: string, gold = false) => (
    <Link href={params({ f: f === key ? '' : key })} data-tile={key}
      className={`grid content-start rounded-card border p-2.5 transition sm:p-4 hover:border-accent ${gold ? 'border-gold bg-gold text-ink-950' : 'border-line bg-raised'} ${f === key ? 'ring-2 ring-accent' : ''}`}>
      <span className="font-display text-2xl font-black leading-none sm:text-3xl">{count(key)}</span>
      <span className={`mt-1 text-[11px] font-semibold leading-tight sm:text-sm ${gold ? '' : 'text-muted'}`}>{label}</span>
    </Link>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold">{t('adminTitle')}</h1>
          <p className="mt-1 max-w-3xl text-muted">{coach ? t('coachLead') : t('adminLead')}</p>
        </div>
        {coach && teams.length === 0 ? null : (
          <Link href={`${params({})}${params({}).includes('?') ? '&' : '?'}add=1#add`} data-add-event
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 font-bold text-on-accent hover:brightness-110"><span aria-hidden className="text-xl leading-none">+</span>{t('addEvent')}</Link>
        )}
      </header>
      <ResultBanner ns="events" result={sp.result} />

      <div className="grid grid-cols-4 gap-2 sm:gap-3" data-event-tiles>
        {tile('week', t('tileWeek'), true)}
        {tile('training', t('tileTrainings'))}
        {tile('game', t('tileGames'))}
        {tile('event', t('tileEvents'))}
      </div>

      <section id="events" aria-labelledby="ev-h" className="grid gap-3">
        <h2 id="ev-h" className="sr-only">{t('upcoming')}</h2>
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-raised p-2.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('filterBy')}>
            {pill('', t('fAll'))}{pill('training', t('fTrainings'))}{pill('game', t('fGames'))}{pill('event', t('fEvents'))}{pill('cancelled', t('cancelled'))}
          </div>
          {teams.length > 1 || !coach ? (
            <form className="ms-auto flex items-center gap-2" data-team-filter>
              {f ? <input type="hidden" name="f" value={f} /> : null}
              <label className="sr-only" htmlFor="ev-team">{t('team')}</label>
              <select id="ev-team" name="team" defaultValue={team} className="min-h-9 rounded-full border border-line bg-raised px-3 text-sm font-semibold">
                <option value="">{t('allTeams')}</option>
                <option value="club">{t('wholeClub')}</option>
                {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <button className="min-h-9 rounded-full border border-fg px-3 text-sm font-bold hover:bg-fg hover:text-raised">{t('show')}</button>
            </form>
          ) : null}
        </div>

        {rows.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-center text-muted" data-no-events>{all.length ? t('noMatch') : t('noEvents')}</p> : (
          <div className="rounded-card border border-line bg-raised" data-event-list>
            <table className="w-full text-start text-sm md:table-fixed">
              <thead className="hidden border-b border-line bg-surface/60 text-[11px] uppercase tracking-widest text-muted md:table-header-group">
                <tr>
                  <th scope="col" className="w-24 px-3 py-3 text-start">{t('colWhen')}</th>
                  <th scope="col" className="px-3 py-3 text-start">{t('colEvent')}</th>
                  <th scope="col" className="w-40 px-2 py-3 text-start">{t('team')}</th>
                  <th scope="col" className="w-56 px-2 py-3 text-start">{t('colReplies')}</th>
                  <th scope="col" className="w-16 px-3 py-3"><span className="sr-only">{t('colActions')}</span></th>
                </tr>
              </thead>
              {groups.map(({ g, list }) => (
                <tbody key={g} className="divide-y divide-line border-b border-line last:border-b-0" data-day-group={g}>
                  <tr className="block bg-surface/40 md:table-row"><th scope="rowgroup" colSpan={5} className="block px-3 py-2 text-start text-xs font-black uppercase tracking-widest text-muted md:table-cell">{t(`grp_${g}`)} <span className="font-semibold">· {list.length}</span></th></tr>
                  {list.map((x) => <EventRow key={x.id} x={x} t={t} tc={tc} fmt={{ hm, wd, dd, mon }} isToday={dayKey.format(new Date(x.at)) <= today} team={x.team ? teamName.get(x.team) ?? '' : t('wholeClub')} back={params({})} />)}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </section>

      {coach && teams.length === 0 ? null : (
        <details id="add" className="rounded-card border border-line bg-raised p-5 open:p-6" open={addOpen} data-add-form>
          <summary className="flex cursor-pointer list-none items-center gap-2 font-display text-xl font-extrabold [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-accent text-lg text-on-accent">+</span>{t('addEvent')}</summary>
          <EventForm back={back} places={(saved ?? []).map((p) => ({ id: p.id, name: p.name, city: p.city }))} teams={teams} clubWide={!coach} sport opponents={supabase ? await loadOpponents(supabase) : []} />
        </details>
      )}

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="pl-h">
        <h2 id="pl-h" className="font-display text-xl font-extrabold">{t('placesTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('placesLead')}</p>
        {(saved ?? []).length === 0 ? <p className="mt-2 text-muted">{t('noPlaces')}</p> : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-places>
            {(saved ?? []).map((p) => { const link = mapsLinkFor(p); return (
              <li key={p.id} className="flex items-start justify-between gap-2 rounded-control border border-line p-3">
                <span className="min-w-0"><bdi className="block font-semibold">{p.name}</bdi>{p.address || p.city ? <span className="block truncate text-xs text-muted">{[p.address, p.city].filter(Boolean).join(', ')}</span> : null}</span>
                {link ? <a href={link} target="_blank" rel="noopener noreferrer" aria-label={`${t('openMaps')}: ${p.name}`} className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-pitch hover:border-accent"><PinIcon /></a> : null}
              </li>); })}
          </ul>
        )}
      </section>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<'events'>>>;
type TC = Awaited<ReturnType<typeof getTranslations<'coach'>>>;

/** One upcoming item: date block, what and where, team, replies (counts that open the names) and the ⋯ menu. */
function EventRow({ x, t, tc, fmt, isToday, team, back }: { x: Row; t: T; tc: TC; fmt: Record<'hm' | 'wd' | 'dd' | 'mon', Intl.DateTimeFormat>; isToday: boolean; team: string; back: string }) {
  const d = new Date(x.at), off = x.status === 'cancelled', link = x.place ? mapsLinkFor(x.place) : null;
  const chip = KIND_CHIP[x.kind] ?? 'bg-fg/10';
  return (
    <tr data-event-row={x.group} data-sport-item={x.group === 'event' ? undefined : x.kind} data-club-event={x.group === 'event' ? x.title : undefined} data-status={x.status}
      className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 p-3 hover:bg-accent/5 md:table-row md:p-0 ${off ? 'opacity-60' : ''}`}>
      <td className="md:px-3 md:py-3 md:align-top">
        <span className={`grid w-14 justify-items-center rounded-2xl py-1.5 leading-tight ${isToday ? 'bg-accent text-on-accent' : 'bg-surface'}`} aria-hidden>
          <span className="text-[10px] font-bold uppercase">{fmt.wd.format(d)}</span>
          <span className="font-display text-xl font-black">{fmt.dd.format(d)}</span>
          <span className="text-[10px] font-bold uppercase">{fmt.mon.format(d)}</span>
        </span>
      </td>
      <td className="min-w-0 md:px-3 md:py-3">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${chip}`}>{t(`kind_${x.kind}` as 'kind_other')}</span>
          {x.href ? <Link href={x.href} className={`font-bold hover:underline ${off ? 'line-through' : ''}`}><bdi>{x.title}</bdi></Link> : <bdi className={`font-bold ${off ? 'line-through' : ''}`}>{x.title}</bdi>}
          {off ? <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">{t('cancelled')}</span> : null}
          {x.public !== null ? <span className="rounded-full bg-line px-2 py-0.5 text-xs font-semibold">{x.public ? t('onWebsite') : t('membersOnly')}</span> : null}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          <span className="sr-only">{fmt.wd.format(d)} {fmt.dd.format(d)} {fmt.mon.format(d)} </span>
          <b className="text-fg" dir="ltr">{fmt.hm.format(d)}</b>
          {x.meetAt ? <> · {t('meeting')} <b dir="ltr">{fmt.hm.format(new Date(x.meetAt))}</b>{x.meetingPoint ? <> <bdi>{x.meetingPoint}</bdi></> : null}</> : null}
          {x.place ? <> · {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-pitch hover:underline"><PinIcon /><bdi>{x.place.name}</bdi></a> : <bdi>{x.place.name}</bdi>}</> : null}
          {x.extra ? <> · {x.extra}</> : null}
          <span className="md:hidden"> · <bdi>{team}</bdi></span>
        </p>
        {x.description ? <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-muted">{x.description}</p> : null}
      </td>
      <td className="hidden md:table-cell md:px-2 md:py-3"><bdi className="font-semibold">{team}</bdi></td>
      <td className="col-span-3 col-start-2 md:px-2 md:py-3">{x.replies && !off ? <ReplyCounts rows={x.replies} tc={tc} /> : <span className="hidden text-muted md:inline">–</span>}</td>
      <td className="col-start-3 row-start-1 md:px-3 md:py-3 md:text-end">
        {x.href || x.canChange || link ? (
          <details className="relative inline-block" data-row-menu>
            <summary aria-label={t('moreActions', { title: x.title })}
              className="grid size-9 cursor-pointer list-none place-items-center rounded-full border border-line bg-raised text-lg font-black hover:border-accent [&::-webkit-details-marker]:hidden">⋯</summary>
            <div className="absolute end-0 top-full z-20 mt-2 grid w-56 gap-1 rounded-card border border-line bg-raised p-2 text-start shadow-xl">
              {x.href ? <Link href={x.href} className="rounded-control px-3 py-2 font-semibold hover:bg-accent/10">{x.group === 'event' || !back.startsWith('/coach') ? t('openTeam') : x.group === 'training' ? t('openTraining') : t('openGame')}</Link> : null}
              {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="rounded-control px-3 py-2 font-semibold hover:bg-accent/10">{t('openMaps')}</a> : null}
              {x.canChange ? (
                <form action={setEventStatus}>
                  <input type="hidden" name="event_id" value={x.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="status" value={off ? 'scheduled' : 'cancelled'} />
                  <button className={`w-full rounded-control px-3 py-2 text-start font-semibold ${off ? 'hover:bg-accent/10' : 'text-danger hover:bg-danger/10'}`} data-event-status>{off ? t('restore') : t('cancel')}</button>
                </form>
              ) : null}
            </div>
          </details>
        ) : null}
      </td>
    </tr>
  );
}

/** In / out / no reply as three chips; a click opens the names (with notes) in a panel, like the Members page's menus. */
function ReplyCounts({ rows, tc }: { rows: ReplyRow[]; tc: TC }) {
  const byName = (a: ReplyRow, b: ReplyRow) => a.name.localeCompare(b.name);
  const yes = rows.filter((r) => r.availability === 'yes').sort(byName);
  const no = rows.filter((r) => r.availability === 'no').sort(byName);
  const none = rows.filter((r) => r.availability !== 'yes' && r.availability !== 'no').sort(byName);
  const groups = [
    { key: 'in', title: tc('groupIn'), list: yes, tone: 'text-pitch' },
    { key: 'out', title: tc('groupOut'), list: no, tone: 'text-danger' },
    { key: 'none', title: tc('groupNone'), list: none, tone: 'text-muted' },
  ];
  const chips = (
    <span className="flex flex-wrap items-center gap-1">
      <span className="whitespace-nowrap rounded-full bg-accent/20 px-2 py-0.5 text-xs font-bold text-pitch">{tc('repliesIn', { count: yes.length })}</span>
      <span className="whitespace-nowrap rounded-full bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">{tc('repliesOut', { count: no.length })}</span>
      <span className="whitespace-nowrap rounded-full bg-line px-2 py-0.5 text-xs font-bold">{tc('repliesNone', { count: none.length })}</span>
    </span>
  );
  if (!rows.length) return <span data-replies="0/0/0/0" className="text-xs text-muted">{tc('repliesInvited', { count: 0 })}</span>;
  return (
    <details className="relative" data-replies={`${yes.length}/${no.length}/${none.length}/${rows.length}`}>
      <summary className="cursor-pointer list-none rounded-full [&::-webkit-details-marker]:hidden" title={tc('showNames')}>{chips}</summary>
      <div className="absolute start-0 top-full z-20 mt-2 grid w-72 max-w-[80vw] gap-3 rounded-card border border-line bg-raised p-3 text-sm shadow-xl">
        {groups.map((g) => (
          <div key={g.key} data-reply-group={g.key}>
            <p className={`font-bold ${g.tone}`}>{g.title} ({g.list.length})</p>
            {g.list.length ? (
              <ul className="mt-1 grid gap-0.5">
                {g.list.map((r) => <li key={r.player_id} data-reply-name={r.name}><bdi className="font-semibold">{r.name}</bdi>{r.note ? <span className="text-muted"> · “<bdi>{r.note}</bdi>”</span> : null}</li>)}
              </ul>
            ) : <p className="mt-1 text-muted">–</p>}
          </div>
        ))}
      </div>
    </details>
  );
}
