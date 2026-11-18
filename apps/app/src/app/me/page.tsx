import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { ReplyForm } from '@/components/ReplyForm';
import { LineupView, type LineupSlot } from '@/components/match/LineupView';
import { requireArea } from '@/lib/auth';
import { mapsLinkFor } from '@/lib/locations';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToday, helsinkiToIso } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('me'))('tabCalendar') };
}

type Event = { id: string; event_type: 'practice' | 'game' | 'friendly' | 'event'; team_season_id: string | null; title: string; division: string | null; starts_at: string; ends_at: string; location_id: string | null; status: string;
  meet_at: string | null; meeting_point: string | null; kind: string | null; description: string | null; reply_by?: string | null };
type Reply = { availability: 'pending' | 'yes' | 'no' | 'maybe'; note: string | null };
type Place = { id: string; name: string; address: string | null; city: string | null; maps_url: string | null };

const TYPE_STYLE: Record<Event['event_type'], string> = { practice: 'bg-accent/20 text-pitch', game: 'bg-ink-950 text-white', friendly: 'bg-line text-fg', event: 'bg-fg/10 text-fg' };
const CANCELLED = new Set(['cancelled', 'postponed']);

/**
 * Calendar tab: every training, match and friendly of the player's teams (view team_schedule, migration 0015 — the database
 * only returns events of the player's own teams). One month at a time, grouped by day, Helsinki time; "next up" on top.
 */
export default async function CalendarTab({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const member = await requireArea('me');
  const sp = await searchParams;
  const [t, tav, rawLocale, supabase] = await Promise.all([getTranslations('me'), getTranslations('availability'), getLocale(), getSupabase()]);
  const tag = isLocale(rawLocale) ? LOCALE_LABELS[rawLocale].intl : 'en-GB';
  const today = helsinkiToday();
  const wanted = typeof sp.m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const [y, mo] = wanted.split('-').map(Number) as [number, number];
  const monthStart = `${wanted}-01`;
  const nextMonth = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7), prevMonth = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
  const from = helsinkiToIso(monthStart, '00:00'), to = helsinkiToIso(`${nextMonth}-01`, '00:00');

  // Two rounds of parallel reads (each Supabase call is a network round trip; in a row they made the tab feel slow).
  const [{ data: monthData }, { data: nextData }, { data: me }] = supabase ? await Promise.all([
    // cancelled events are left out of the player's list; postponed ones stay, marked, until they get a new date
    supabase.from('team_schedule').select('*').gte('starts_at', from).lt('starts_at', to).neq('status', 'cancelled').order('starts_at'),
    supabase.from('team_schedule').select('*').gte('starts_at', new Date().toISOString()).not('status', 'in', '(cancelled,postponed)').order('starts_at').limit(1),
    // My replies (sign in / out): RLS returns only the player's own rows (migration 0008); rows exist for roster players.
    supabase.from('players').select('id').eq('profile_id', member.id).maybeSingle(),
  ]) : [{ data: [] }, { data: [] }, { data: null }];
  const events = (monthData as Event[] | null) ?? [];
  const next = ((nextData as Event[] | null) ?? [])[0] ?? null;
  const all = next ? [...events, next] : events;
  const placeIds = [...new Set(all.map((e) => e.location_id).filter((x): x is string => !!x))];
  const teamIds = [...new Set(all.map((e) => e.team_season_id).filter((x): x is string => !!x))];
  const practiceIds = all.filter((e) => e.event_type === 'practice').map((e) => e.id), matchIds = all.filter((e) => e.event_type === 'game' || e.event_type === 'friendly').map((e) => e.id);
  const none = Promise.resolve({ data: [] });
  // Match day details (migration 0031): protocol times; once the coach publishes the lineup, RLS (squad_players_read) returns the whole
  // squad, and names come from team_roster (teammates' names and shirt numbers only).
  type MatchInfo = { id: string; meet_at: string | null; meeting_point: string | null; warmup_at: string | null; briefing_at: string | null; squad_published: boolean;
    tactic_style: string | null; formation: string | null; game_plan: string | null; goals_for: number | null; goals_against: number | null; live_state: string };
  type SquadRow = { match_id: string; player_id: string; status: 'starter' | 'substitute' | 'not_selected'; slot: number | null; shirt_number: number | null; captain: boolean };
  const [{ data: places }, { data: teams }, { data: sessReplies }, { data: matchReplies }, { data: matchInfo }, { data: squadRows }, { data: roster }, { data: formations }] = supabase ? await Promise.all([
    placeIds.length ? supabase.from('locations').select('id, name, address, city, maps_url').in('id', placeIds) : none,
    teamIds.length ? supabase.from('team_seasons').select('id, teams(name)').in('id', teamIds) : none,
    me && practiceIds.length ? supabase.from('session_attendance').select('session_id, availability, note').eq('player_id', me.id).in('session_id', practiceIds) : none,
    me && matchIds.length ? supabase.from('match_availability').select('match_id, availability, note').eq('player_id', me.id).in('match_id', matchIds) : none,
    matchIds.length ? supabase.from('matches').select('id, meet_at, meeting_point, warmup_at, briefing_at, squad_published, tactic_style, formation, game_plan, goals_for, goals_against, live_state').in('id', matchIds) : none,
    matchIds.length ? supabase.from('match_squad').select('match_id, player_id, status, slot, shirt_number, captain').in('match_id', matchIds).neq('status', 'not_selected') : none,
    matchIds.length && teamIds.length ? supabase.from('team_roster').select('team_season_id, player_id, display_name, jersey_number').in('team_season_id', teamIds) : none,
    matchIds.length ? supabase.from('formations').select('code, slots') : none,
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const reply = new Map<string, Reply>([
    ...((sessReplies ?? []) as (Reply & { session_id: string })[]).map((r) => [r.session_id, r] as const),
    ...((matchReplies ?? []) as (Reply & { match_id: string })[]).map((r) => [r.match_id, r] as const),
  ]);
  const squad = new Map<string, SquadRow[]>();
  for (const r of (squadRows ?? []) as SquadRow[]) squad.set(r.match_id, [...(squad.get(r.match_id) ?? []), r]);
  const role = new Map([...squad].map(([mid, rows]) => [mid, rows.find((r) => r.player_id === me?.id)] as const).filter(([, r]) => !!r) as [string, SquadRow][]);
  const rosterRows = (roster ?? []) as { team_season_id: string; player_id: string; display_name: string; jersey_number: number | null }[];
  const nameOf = new Map(rosterRows.map((r) => [r.player_id, r.display_name]));
  const shirtOf = new Map(rosterRows.map((r) => [r.player_id, r.jersey_number]));
  const slotsOf = new Map(((formations ?? []) as { code: string; slots: LineupSlot[] }[]).map((f) => [f.code, f.slots]));
  const info = new Map(((matchInfo as MatchInfo[] | null) ?? []).map((x) => [x.id, x]));
  const [tmatch, tev] = await Promise.all([getTranslations('match'), getTranslations('events')]);
  const nowIso = new Date().toISOString();
  const dayTime = new Intl.DateTimeFormat(tag, { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const place = new Map(((places as Place[] | null) ?? []).map((p) => [p.id, p]));
  const teamName = new Map(((teams as unknown as { id: string; teams: { name: string } }[] | null) ?? []).map((x) => [x.id, x.teams.name]));
  const manyTeams = teamName.size > 1;

  const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(iso));
  const dayLabel = new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIME_ZONE });
  const hm = new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const monthLabel = new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, 1)));
  const byDay = new Map<string, Event[]>();
  for (const e of events) byDay.set(dayKey(e.starts_at), [...(byDay.get(dayKey(e.starts_at)) ?? []), e]);

  const title = (e: Event) => (e.event_type === 'practice' || e.event_type === 'event' ? e.title : t('vs', { opponent: e.title }));
  const Where = ({ e }: { e: Event }) => {
    const p = e.location_id ? place.get(e.location_id) : null;
    if (!p) return null;
    const text = [p.name, p.address, p.city].filter(Boolean).join(', ');
    const link = mapsLinkFor(p); // the saved link, or a Google Maps search from the address
    return link
      ? <a href={link} target="_blank" rel="noopener noreferrer" className="text-pitch underline underline-offset-2" data-maps-link>{text}</a>
      : <span>{text}</span>;
  };
  const REPLY_STYLE: Record<Reply['availability'], string> = { yes: 'bg-accent/20 text-pitch', no: 'bg-danger/10 text-danger', maybe: 'bg-line text-fg', pending: 'bg-line text-muted' };
  const ReplyBox = ({ e, r }: { e: Event; r: Reply }) => {
    // replies close at the deadline (migration 0048), at the latest when the event starts
    const closesAt = e.reply_by && e.reply_by < e.starts_at ? e.reply_by : e.starts_at;
    const open = e.status === 'scheduled' && closesAt > nowIso;
    const deadline = e.reply_by && e.status === 'scheduled' && e.starts_at > nowIso ? (
      <p className={`text-xs font-semibold ${open ? 'text-muted' : 'text-danger'}`} data-reply-by={open ? 'open' : 'closed'}>
        {open ? t('replyBy', { when: dayTime.format(new Date(e.reply_by)) }) : t('repliesClosed')}
      </p>
    ) : null;
    const label = <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${REPLY_STYLE[r.availability]}`} data-reply-state={r.availability}>{r.availability === 'pending' ? t('noReply') : tav(r.availability)}</span>;
    if (!open) return <>{deadline}{r.availability === 'pending' ? null : <p className="text-sm">{t('yourReply')}: {label}{r.note ? <span className="ms-2 text-muted">“{r.note}”</span> : null}</p>}</>;
    return <>{deadline}<ReplyForm eventId={e.id} kind={e.event_type} availability={r.availability} note={r.note} eventLabel={title(e)} /></>;
  };
  const MatchDay = ({ e, open }: { e: Event; open: boolean }) => {
    const x = info.get(e.id);
    if (!x) return null;
    const steps = ([['meet', x.meet_at], ['warmup', x.warmup_at], ['briefing', x.briefing_at]] as const).filter(([, at]) => at);
    const mine = role.get(e.id);
    const upcoming = x.live_state === 'not_started' && !CANCELLED.has(e.status) && e.starts_at > nowIso;
    const rows = squad.get(e.id) ?? [];
    const slots = x.formation ? slotsOf.get(x.formation) : undefined;
    const lineup = x.squad_published && slots && rows.some((r) => r.status === 'starter') ? (
      <LineupView slots={slots} label={tmatch('pitch')} benchLabel={tmatch('bench')} youLabel={tmatch('you')}
        starters={rows.filter((r) => r.status === 'starter' && r.slot).map((r) => ({ slot: r.slot!, name: nameOf.get(r.player_id) ?? '–', shirt: r.shirt_number ?? shirtOf.get(r.player_id) ?? null, captain: r.captain, me: r.player_id === me?.id }))}
        bench={rows.filter((r) => r.status === 'substitute').map((r) => ({ name: nameOf.get(r.player_id) ?? '–', shirt: r.shirt_number ?? shirtOf.get(r.player_id) ?? null, captain: r.captain, me: r.player_id === me?.id }))} />
    ) : null;
    return (
      <div className="mt-1 grid gap-2" data-matchday>
        {x.live_state === 'full_time' || (x.live_state !== 'not_started' && x.goals_for !== null) ? (
          <p className="font-display text-2xl font-black tabular-nums" dir="ltr" data-result>{x.goals_for ?? 0}–{x.goals_against ?? 0}
            {x.live_state !== 'full_time' ? <span className="ms-2 rounded-full bg-danger px-2 py-0.5 align-middle text-xs font-bold text-white">{tmatch('liveBadge')}</span> : null}</p>
        ) : null}
        {x.squad_published ? (
          <div className="grid gap-2 rounded-card bg-surface p-3 text-sm" data-my-role={mine?.status ?? 'not_selected'}>
            <p className="font-semibold">{tmatch(`myRole_${mine?.status ?? 'not_selected'}`)}{mine?.captain ? ` · ${tmatch('youCaptain')}` : ''}</p>
            {x.tactic_style ? <p>{tmatch(`style_${x.tactic_style}`)}{x.formation ? <span className="ms-1 text-muted" dir="ltr">({x.formation})</span> : null}</p> : null}
            {x.game_plan ? <p className="whitespace-pre-line text-muted">{x.game_plan}</p> : null}
            {lineup ? (
              <details open={open} className="group" data-lineup-details>
                <summary className="cursor-pointer font-semibold text-pitch">{tmatch('seeLineup')}</summary>
                <div className="mt-2">{lineup}</div>
              </details>
            ) : null}
          </div>
        ) : upcoming ? (
          <div className="flex items-center gap-3 rounded-card border-2 border-dashed border-line p-3 text-sm text-muted" data-lineup-placeholder>
            <svg viewBox="0 0 34 50" className="h-12 w-8 shrink-0" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="1" width="32" height="48" rx="3" /><path d="M1 25h32" /><circle cx="17" cy="25" r="5" /><path d="M10 1v7h14V1M10 49v-7h14v7" /></svg>
            <p><span className="block font-semibold text-fg">{tmatch('lineupPendingTitle')}</span>{tmatch('lineupPendingText')}</p>
          </div>
        ) : null}
        {steps.length && !CANCELLED.has(e.status) ? (
          <ol className="flex flex-wrap gap-2 text-sm" aria-label={tmatch('protocolTitle')} data-player-protocol>
            {steps.map(([k, at]) => <li key={k} className="rounded-full bg-surface px-3 py-1"><span className="text-muted">{tmatch(`step_${k}`)}</span> <b dir="ltr">{hm.format(new Date(at!))}</b>{k === 'meet' && x.meeting_point ? <> · <bdi>{x.meeting_point}</bdi></> : null}</li>)}
            <li className="rounded-full bg-fg px-3 py-1 text-raised"><span>{tmatch('step_kickoff')}</span> <b dir="ltr">{hm.format(new Date(e.starts_at))}</b></li>
          </ol>
        ) : null}
      </div>
    );
  };
  const Item = ({ e, anchor }: { e: Event; anchor?: boolean }) => {
    const off = CANCELLED.has(e.status);
    const r = reply.get(e.id);
    return (
      <li id={anchor ? `ev-${e.id}` : undefined} data-event={e.event_type} data-status={e.status} data-event-id={e.id} className={`grid gap-1 rounded-card border border-line bg-raised p-4 ${off ? 'opacity-70' : ''}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${TYPE_STYLE[e.event_type]}`}>{e.event_type === 'event' ? tev(`kind_${e.kind ?? 'other'}` as 'kind_other') : t(`ev_${e.event_type}`)}</span>
          <span className="font-semibold" dir="ltr">{hm.format(new Date(e.starts_at))}–{hm.format(new Date(e.ends_at))}</span>
          {off ? <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">{t(`ev_${e.status}` as 'ev_cancelled')}</span> : null}
        </div>
        <p className={`font-display text-lg font-extrabold ${off ? 'line-through' : ''}`}><bdi>{title(e)}</bdi>{e.division ? <span className="ms-2 text-sm font-normal text-muted">{e.division}</span> : null}</p>
        <p className="text-sm text-muted"><Where e={e} />{manyTeams || !e.team_season_id ? <> · {e.team_season_id ? teamName.get(e.team_season_id) : tev('wholeClub')}</> : null}</p>
        {(e.event_type === 'practice' || e.event_type === 'event') && e.meet_at && !off ? (
          <p className="text-sm" data-meeting><span className="rounded-full bg-surface px-3 py-1"><span className="text-muted">{tev('meeting')}</span> <b dir="ltr">{hm.format(new Date(e.meet_at))}</b>{e.meeting_point ? <> · <bdi>{e.meeting_point}</bdi></> : null}</span></p>
        ) : null}
        {e.event_type === 'event' && e.description ? <p className="whitespace-pre-line text-sm text-muted">{e.description}</p> : null}
        {e.event_type === 'game' || e.event_type === 'friendly' ? <MatchDay e={e} open={!anchor} /> : null}
        {r ? <ReplyBox e={e} r={r} /> : null}
      </li>
    );
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {next ? (
        <section aria-labelledby="next-h" className="rounded-card border-2 border-accent bg-raised p-5" data-next>
          <h2 id="next-h" className="text-xs font-bold uppercase tracking-widest text-muted">{t('nextUp')}</h2>
          <p className="mt-1 font-semibold">{dayLabel.format(new Date(next.starts_at))}</p>
          <ul className="mt-2"><Item e={next} /></ul>
        </section>
      ) : null}

      <section aria-labelledby="month-h" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="month-h" className="font-display text-xl font-extrabold capitalize">{monthLabel}</h2>
          <nav className="flex gap-2" aria-label={t('monthNav')}>
            <Link href={`/me?m=${prevMonth}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-raised px-4 font-semibold hover:border-accent" aria-label={t('prevMonth')}><span aria-hidden className="rtl-flip inline-block">←</span></Link>
            {wanted !== today.slice(0, 7) ? <Link href="/me" className="inline-flex min-h-11 items-center rounded-full border border-line bg-raised px-4 font-semibold hover:border-accent">{t('thisMonth')}</Link> : null}
            <Link href={`/me?m=${nextMonth}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-raised px-4 font-semibold hover:border-accent" aria-label={t('nextMonth')}><span aria-hidden className="rtl-flip inline-block">→</span></Link>
          </nav>
        </div>
        {events.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-muted">{t('noEvents')}</p> : (
          <ol className="grid gap-4">
            {[...byDay.entries()].map(([key, list]) => (
              <li key={key} data-day={key}>
                <h3 className={`mb-2 text-sm font-bold ${key === today ? 'text-pitch' : 'text-muted'}`}>
                  {dayLabel.format(new Date(list[0]!.starts_at))}{key === today ? ` · ${t('today')}` : ''}
                </h3>
                <ul className="grid gap-2">{list.map((e) => <Item key={e.id} e={e} anchor />)}</ul>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
