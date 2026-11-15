import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { publishLineup, saveGamePlan, saveProtocol, voidMatchEvent } from '@/app/actions/match';
import { LineupBuilder, type LineupPlayer } from '@/components/match/LineupBuilder';
import { LiveConsole } from '@/components/match/LiveConsole';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { coachesTeam } from '@/lib/coach';
import { LINES, PRESETS, PRESSING, ROLE_OF, STYLES, TEMPOS, WIDTHS, onPitch, type EventRow, type LiveState, type Slot } from '@/lib/match';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('match'))('title') };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const input = 'min-h-11 w-full rounded-control border border-line bg-raised px-3';
type Match = {
  id: string; team_season_id: string; opponent: string; event_type: 'game' | 'friendly'; division: string | null; home_away: 'home' | 'away'; kickoff_at: string;
  status: string; live_state: LiveState; goals_for: number | null; goals_against: number | null; formation: string | null; squad_published: boolean; location_id: string | null;
  meet_at: string | null; meeting_point: string | null; warmup_at: string | null; briefing_at: string | null;
  tactic_style: string | null; defensive_line: string | null; pressing: string | null; width: string | null; tempo: string | null; game_plan: string | null;
};
type RosterRow = { jersey_number: number | null; players: { id: string; first_name: string; last_name: string; position: string | null } };

/** Match day: pre-game protocol, game plan (lineup style), lineup on a pitch, live scoreboard, timeline and statistics. */
export default async function MatchDayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const member = await requireArea('coach');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [t, rawLocale, supabase] = await Promise.all([getTranslations('match'), getLocale(), getSupabase()]);
  if (!supabase) notFound();
  const { data } = await supabase.from('matches').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  const m = data as Match;
  if (!(await coachesTeam(supabase, member.id, m.team_season_id))) notFound(); // a player of the team can read the match, but this page is for coaches

  const [{ data: ts }, { data: rosterData }, { data: replies }, { data: squad }, { data: events }, { data: formations }, { data: place }, { data: stats }] = await Promise.all([
    supabase.from('team_seasons').select('teams!inner(name)').eq('id', m.team_season_id).maybeSingle(),
    supabase.from('team_players').select('jersey_number, players!inner(id, first_name, last_name, position)').eq('team_season_id', m.team_season_id).is('left_on', null),
    supabase.from('match_availability').select('player_id, availability, note').eq('match_id', id),
    supabase.from('match_squad').select('player_id, status, slot, captain').eq('match_id', id),
    supabase.from('match_events').select('id, type, side, minute, added_minute, player_id, assist_player_id, player_out_id, opponent_label, note, voided, created_at').eq('match_id', id).order('minute').order('added_minute').order('created_at'),
    supabase.from('formations').select('code, slots').order('sort_order'),
    m.location_id ? supabase.from('locations').select('name, address, city').eq('id', m.location_id).maybeSingle() : Promise.resolve({ data: null }),
    m.live_state === 'full_time' ? supabase.from('match_player_stats').select('player_id, minutes, goals, assists, yellow_cards, red_card').eq('match_id', id) : Promise.resolve({ data: [] }),
  ]);
  const team = (ts?.teams as unknown as { name: string } | undefined)?.name ?? '';
  const roster = ((rosterData as unknown as RosterRow[] | null) ?? []).sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
  const name = new Map(roster.map((r) => [r.players.id, `${r.players.first_name} ${r.players.last_name}`]));
  const reply = new Map((replies ?? []).map((r) => [r.player_id, r]));
  const evs = (events as EventRow[] | null) ?? [];
  const live = evs.filter((e) => !e.voided);
  const starters = (squad ?? []).filter((s) => s.status === 'starter');
  const subs = (squad ?? []).filter((s) => s.status === 'substitute');
  const pitchNow = onPitch(starters.map((s) => s.player_id), live);
  const subsUsed = new Set(live.filter((e) => e.type === 'substitution' && e.side === 'us').map((e) => e.player_id));
  const P = (pid: string) => ({ id: pid, name: name.get(pid) ?? '?' });
  const lineupPlayers: LineupPlayer[] = roster.map((r) => ({
    id: r.players.id, name: `${r.players.first_name} ${r.players.last_name}`, shirt: r.jersey_number, role: r.players.position ? ROLE_OF[r.players.position] ?? null : null,
    reply: (reply.get(r.players.id)?.availability ?? 'pending') as LineupPlayer['reply'],
  }));
  const formationList = ((formations ?? []) as { code: string; slots: Slot[] }[]);
  const phaseAt = (type: string) => live.find((e) => e.type === type)?.created_at ?? null;

  const tag = isLocale(rawLocale) ? LOCALE_LABELS[rawLocale].intl : 'en-GB';
  const longDay = new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIME_ZONE });
  const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIME_ZONE });
  const hmIn = (iso: string | null) => (iso ? hm.format(new Date(iso)) : '');
  const back = `/coach/matches/${id}`;
  const started = m.live_state !== 'not_started';
  const count = (a: string) => roster.filter((r) => (reply.get(r.players.id)?.availability ?? 'pending') === a).length;
  const steps = [
    { key: 'meet', at: m.meet_at, extra: m.meeting_point }, { key: 'warmup', at: m.warmup_at }, { key: 'briefing', at: m.briefing_at }, { key: 'kickoff', at: m.kickoff_at },
  ].filter((s) => s.at).sort((a, b) => a.at!.localeCompare(b.at!));
  const nowIso = new Date().toISOString();
  const nextStep = m.live_state === 'not_started' ? steps.find((s) => s.at! > nowIso) : undefined;
  const style = (m.tactic_style ?? 'balanced') as (typeof STYLES)[number];

  const Live = (
    <section id="live" aria-labelledby="live-h" className="rounded-card border-2 border-fg bg-raised p-4 sm:p-6">
      <h2 id="live-h" className="mb-3 font-display text-xl font-extrabold">{t('liveTitle')}</h2>
      {m.status === 'cancelled' || m.status === 'postponed' ? <p className="text-muted">{t(`status_${m.status}`)}</p> : (
        <LiveConsole matchId={id} back={back} team={team} opponent={m.opponent} homeAway={m.home_away} state={m.live_state}
          times={{ kickoff: phaseAt('kickoff'), secondHalf: phaseAt('second_half') }} score={{ us: m.goals_for ?? 0, them: m.goals_against ?? 0 }}
          onPitch={[...pitchNow].map(P)} benchLeft={subs.filter((s) => !subsUsed.has(s.player_id)).map((s) => P(s.player_id))}
          squad={[...starters, ...subs].map((s) => P(s.player_id))} disabled={false} />
      )}
      {!started && starters.length === 0 ? <p className="mt-3 text-sm text-muted">{t('liveNeedsLineup')}</p> : null}
    </section>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Link href={`/coach/teams/${m.team_season_id}`} className="text-sm font-semibold text-pitch underline underline-offset-2">← {team}</Link>
      <header className="rounded-card border border-line bg-raised p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">{m.event_type === 'friendly' ? t('friendly') : m.division ?? t('game')} · {t(m.home_away)}</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold"><bdi>{team}</bdi> – <bdi>{m.opponent}</bdi></h1>
        <p className="mt-1 font-semibold">{longDay.format(new Date(m.kickoff_at))} · <span dir="ltr">{hmIn(m.kickoff_at)}</span></p>
        {place ? <p className="text-muted">{[place.name, place.address, place.city].filter(Boolean).join(', ')}</p> : null}
        <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label={t('sections')}>
          {(['protocol', 'plan', 'lineup', 'live', 'timeline'] as const).map((s) => <a key={s} href={`#${s}`} className="rounded-full border border-line px-3 py-1.5 font-semibold hover:border-accent">{t(`nav_${s}`)}</a>)}
        </nav>
      </header>
      <ResultBanner ns="match" result={sp.result} />

      {started ? Live : null}

      <section id="protocol" aria-labelledby="protocol-h" className="rounded-card border border-line bg-raised p-6">
        <h2 id="protocol-h" className="font-display text-xl font-extrabold">{t('protocolTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('protocolLead')}</p>
        <ol className="mt-4 grid gap-2 sm:grid-cols-4" data-protocol>
          {steps.map((s) => (
            <li key={s.key} data-step={s.key} className={`rounded-card p-3 ${nextStep?.key === s.key ? 'border-2 border-accent bg-accent/10' : 'bg-surface'}`}>
              <p className="text-xs font-bold uppercase tracking-widest text-muted">{t(`step_${s.key}`)}</p>
              <p className="font-display text-2xl font-black" dir="ltr">{hmIn(s.at)}</p>
              {s.extra ? <p className="text-sm"><bdi>{s.extra}</bdi></p> : null}
              {nextStep?.key === s.key ? <p className="text-xs font-bold text-pitch">{t('nextStep')}</p> : null}
            </li>
          ))}
        </ol>
        <details className="mt-4" open={!m.meet_at && !m.warmup_at && !m.briefing_at}>
          <summary className="cursor-pointer font-semibold">{t('editProtocol')}</summary>
          <form action={saveProtocol} className="mt-3 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="match_id" value={id} /><input type="hidden" name="back" value={back} />
            <label className="grid gap-1 text-sm font-semibold">{t('step_meet')}<input name="meet" type="time" defaultValue={hmIn(m.meet_at)} className={input} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('step_warmup')}<input name="warmup" type="time" defaultValue={hmIn(m.warmup_at)} className={input} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('step_briefing')}<input name="briefing" type="time" defaultValue={hmIn(m.briefing_at)} className={input} /></label>
            <label className="grid gap-1 text-sm font-semibold sm:col-span-3">{t('meetingPoint')}<input name="meeting_point" maxLength={120} defaultValue={m.meeting_point ?? ''} placeholder={t('meetingPointEg')} className={input} /></label>
            <p className="text-xs text-muted sm:col-span-3">{t('protocolRule', { kickoff: hmIn(m.kickoff_at) })}</p>
            <div className="flex flex-wrap gap-2 sm:col-span-3">
              <button name="op" value="save" className="min-h-11 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">{t('saveProtocol')}</button>
              <button name="op" value="defaults" className="min-h-11 rounded-full border-2 border-fg px-5 font-bold hover:bg-fg hover:text-raised">{t('standardTimes')}</button>
            </div>
          </form>
        </details>
      </section>

      <section id="plan" aria-labelledby="plan-h" className="rounded-card border border-line bg-raised p-6">
        <h2 id="plan-h" className="font-display text-xl font-extrabold">{t('planTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('planLead')}</p>
        <form action={saveGamePlan} className="mt-4 grid gap-4">
          <input type="hidden" name="match_id" value={id} /><input type="hidden" name="back" value={back} />
          <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="mb-2 text-sm font-semibold">{t('style')}</legend>
            {STYLES.map((s) => (
              <label key={s} className="relative block">
                <input type="radio" name="style" value={s} defaultChecked={style === s} className="peer sr-only" />
                <span className="block h-full cursor-pointer rounded-card border-2 border-line p-4 peer-checked:border-accent peer-checked:bg-accent/10 peer-focus-visible:ring-2 peer-focus-visible:ring-accent" data-style={s}>
                  <span className="flex items-center justify-between gap-2"><span className="font-display font-extrabold">{t(`style_${s}`)}</span><span className="rounded-full bg-line px-2 text-xs font-bold" dir="ltr">{PRESETS[s].formation}</span></span>
                  <span className="mt-1 block text-sm text-muted">{t(`styleDesc_${s}`)}</span>
                  <span className="mt-2 block text-xs">{t(`styleKeys_${s}`)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-4">
            {([['line', LINES, m.defensive_line ?? PRESETS[style].line], ['press', PRESSING, m.pressing ?? PRESETS[style].press], ['width', WIDTHS, m.width ?? PRESETS[style].width], ['tempo', TEMPOS, m.tempo ?? PRESETS[style].tempo]] as const).map(([k, opts, cur]) => (
              <label key={k} className="grid gap-1 text-sm font-semibold">{t(`ins_${k}`)}
                <select name={k} defaultValue={cur} className={input}>{opts.map((o) => <option key={o} value={o}>{t(`opt_${k}_${o}`)}</option>)}</select></label>
            ))}
          </div>
          <label className="grid gap-1 text-sm font-semibold">{t('gamePlan')}
            <textarea name="game_plan" maxLength={2000} rows={4} defaultValue={m.game_plan ?? ''} placeholder={t('gamePlanEg')} className="rounded-control border border-line bg-raised p-3" />
            <span className="text-xs font-normal text-muted">{t('gamePlanNote')}</span></label>
          <div className="flex flex-wrap gap-2">
            <button name="op" value="preset" className="min-h-11 rounded-full border-2 border-fg px-5 font-bold hover:bg-fg hover:text-raised">{t('applyStyle')}</button>
            <button name="op" value="save" className="min-h-11 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">{t('savePlan')}</button>
          </div>
          <p className="text-xs text-muted">{t('applyStyleNote')}</p>
        </form>
      </section>

      <section id="lineup" aria-labelledby="lineup-h" className="rounded-card border border-line bg-raised p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="lineup-h" className="font-display text-xl font-extrabold">{t('lineupTitle')}</h2>
            <p className="mt-1 flex flex-wrap gap-2 text-sm" data-availability={`${count('yes')}/${count('no')}/${count('pending') + count('maybe')}`}>
              <span className="rounded-full bg-accent/20 px-3 py-0.5 font-bold text-pitch">{t('availIn', { count: count('yes') })}</span>
              <span className="rounded-full bg-danger/10 px-3 py-0.5 font-bold text-danger">{t('availOut', { count: count('no') })}</span>
              <span className="rounded-full bg-line px-3 py-0.5 font-bold">{t('availNone', { count: count('pending') + count('maybe') })}</span>
            </p>
          </div>
          <form action={publishLineup} className="flex items-center gap-2">
            <input type="hidden" name="match_id" value={id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="publish" value={m.squad_published ? 'false' : 'true'} />
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${m.squad_published ? 'bg-accent/20 text-pitch' : 'bg-line'}`} data-published={m.squad_published}>{m.squad_published ? t('published') : t('notPublished')}</span>
            <button disabled={!m.squad_published && starters.length === 0} className="min-h-11 rounded-full border-2 border-fg px-4 font-bold hover:bg-fg hover:text-raised disabled:opacity-50">{m.squad_published ? t('unpublish') : t('publish')}</button>
          </form>
        </div>
        <p className="mb-4 mt-1 text-xs text-muted">{t('publishNote')}</p>
        <LineupBuilder matchId={id} back={back} opponent={m.opponent} locked={started} formations={formationList} roster={lineupPlayers}
          initial={{ formation: m.formation ?? PRESETS[style].formation, starters: Object.fromEntries(starters.filter((s) => s.slot).map((s) => [s.slot!, s.player_id])), subs: subs.map((s) => s.player_id), captain: (squad ?? []).find((s) => s.captain)?.player_id ?? null }} />
      </section>

      {started ? null : Live}

      <section id="timeline" aria-labelledby="tl-h" className="rounded-card border border-line bg-raised p-6">
        <h2 id="tl-h" className="font-display text-xl font-extrabold">{t('timeline')}</h2>
        {evs.length === 0 ? <p className="mt-2 text-muted">{t('noEvents')}</p> : (
          <ol className="mt-3 grid gap-1.5">
            {evs.map((e) => (
              <li key={e.id} data-timeline={e.type} data-voided={e.voided} className={`flex flex-wrap items-center justify-between gap-2 rounded-card px-3 py-2 text-sm ${e.voided ? 'bg-surface text-muted line-through' : e.side === 'us' ? 'bg-accent/10' : 'bg-surface'}`}>
                <span><b className="me-2 inline-block w-12 tabular-nums" dir="ltr">{e.minute}{e.added_minute ? `+${e.added_minute}` : ''}&apos;</b>{t(`ev_${e.type}`)}
                  {e.player_id ? <> · <bdi className="font-semibold">{name.get(e.player_id)}</bdi></> : e.opponent_label ? <> · <bdi>{e.opponent_label}</bdi></> : null}
                  {e.player_out_id ? <> ({t('off')}: <bdi>{name.get(e.player_out_id)}</bdi>)</> : null}
                  {e.assist_player_id ? <> ({t('assist')}: <bdi>{name.get(e.assist_player_id)}</bdi>)</> : null}
                  {e.side === 'opponent' && !['kickoff', 'half_time', 'second_half', 'full_time'].includes(e.type) ? <span className="ms-1 text-xs text-muted">· <bdi>{m.opponent}</bdi></span> : null}
                  {e.note ? <span className="ms-1 text-muted">“<bdi>{e.note}</bdi>”</span> : null}</span>
                {!e.voided && m.live_state !== 'full_time' ? (
                  <form action={voidMatchEvent}><input type="hidden" name="match_id" value={id} /><input type="hidden" name="event_id" value={e.id} /><input type="hidden" name="back" value={back} />
                    <button className="min-h-9 rounded-full border border-line px-3 text-xs font-bold hover:border-danger" aria-label={`${t('void')}: ${t(`ev_${e.type}`)} ${e.minute}'`}>{t('void')}</button></form>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {m.live_state === 'full_time' ? <p className="mt-3 text-xs text-muted">{t('finishedNote')}</p> : null}
      </section>

      {m.live_state === 'full_time' && (stats ?? []).length ? (
        <section aria-labelledby="stats-h" className="rounded-card border border-line bg-raised p-6" data-stats>
          <h2 id="stats-h" className="font-display text-xl font-extrabold">{t('statsTitle')}</h2>
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted"><tr>
                <th scope="col" className="px-2 py-2 text-start">{t('player')}</th>{(['min', 'g', 'a', 'y', 'r'] as const).map((k) => <th key={k} scope="col" className="px-2 py-2 text-end">{t(`th_${k}`)}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {(stats ?? []).sort((a, b) => b.minutes - a.minutes).map((s) => (
                  <tr key={s.player_id} data-stat-row={s.player_id}><td className="px-2 py-1.5"><bdi>{name.get(s.player_id)}</bdi></td>
                    <td className="px-2 py-1.5 text-end tabular-nums">{s.minutes}</td><td className="px-2 py-1.5 text-end">{s.goals}</td><td className="px-2 py-1.5 text-end">{s.assists}</td><td className="px-2 py-1.5 text-end">{s.yellow_cards}</td><td className="px-2 py-1.5 text-end">{s.red_card ? 1 : 0}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
