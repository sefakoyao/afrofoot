'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { coachesTeam } from '@/lib/coach';
import { LINES, PRESSING, PROTOCOL_DEFAULTS, STYLES, TEMPOS, WIDTHS } from '@/lib/match';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToIso, helsinkiToday } from '@/lib/time';

/**
 * Match day for coaches (migrations 0012, 0031). Every write runs as the coach; RLS (matches_write, squad_coach,
 * events_coach_*) limits it to their own teams and the database triggers enforce the squad and event rules.
 * Results: ?result=<key under match.*>. zod rules mirror the database checks.
 */
const uuid = z.string().uuid();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'r_time');
const optTime = z.union([z.literal(''), hhmm]);

function back(fd: FormData, result: string, hash = ''): never {
  const raw = String(fd.get('back') ?? '');
  const url = new URL(raw.startsWith('/coach') ? raw : '/coach', 'http://x');
  url.searchParams.set('result', result);
  redirect(url.pathname + url.search + hash);
}
async function db(fd: FormData) {
  const member = await requireArea('coach');
  const supabase = await getSupabase();
  if (!supabase) back(fd, 'r_error');
  return { member, supabase };
}
const refresh = (matchId?: string) => { if (matchId) revalidatePath(`/coach/matches/${matchId}`); revalidatePath('/coach', 'layout'); revalidatePath('/me', 'layout'); };
const minus = (iso: string, min: number) => new Date(Date.parse(iso) - min * 60000).toISOString();

// ---------- add a match or friendly ----------
const createSchema = z.object({
  team_season_id: uuid, kind: z.enum(['game', 'friendly']),
  opponent: z.string().trim().min(1, 'r_opponent').max(120, 'r_opponent'),
  division: z.string().trim().max(60, 'r_division').transform((v) => v || null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'r_date'), time: hhmm,
  home_away: z.enum(['home', 'away']),
  location_id: z.union([z.literal(''), uuid]).transform((v) => v || null),
});

export async function createMatch(fd: FormData): Promise<void> {
  const { member, supabase } = await db(fd);
  const parsed = createSchema.safeParse(Object.fromEntries(['team_season_id', 'kind', 'opponent', 'division', 'date', 'time', 'home_away', 'location_id'].map((k) => [k, fd.get(k) ?? ''])));
  if (!parsed.success) back(fd, parsed.error.issues[0]?.message?.startsWith('r_') ? parsed.error.issues[0].message : 'r_invalid', '#add-match');
  const v = parsed.data;
  if (v.kind === 'game' && !v.division) back(fd, 'r_division', '#add-match');
  if (v.date < helsinkiToday()) back(fd, 'r_date', '#add-match');
  if (!(await coachesTeam(supabase, member.id, v.team_season_id))) back(fd, 'r_notYourTeam');
  const kickoff = helsinkiToIso(v.date, v.time);
  const { data, error } = await supabase.from('matches').insert({
    team_season_id: v.team_season_id, event_type: v.kind, opponent: v.opponent, division: v.division, kickoff_at: kickoff,
    home_away: v.home_away, location_id: v.location_id, created_by: member.id,
    // standard pre-game protocol; the coach can change it on the match page
    meet_at: minus(kickoff, PROTOCOL_DEFAULTS.meet), warmup_at: minus(kickoff, PROTOCOL_DEFAULTS.warmup), briefing_at: minus(kickoff, PROTOCOL_DEFAULTS.briefing),
  }).select('id').single();
  if (error || !data) { console.error('[match] create refused', { code: error?.code, message: error?.message }); back(fd, 'r_error', '#add-match'); }
  refresh();
  redirect(`/coach/matches/${data.id}?result=r_matchCreated`);
}

// ---------- pre-game protocol ----------
const protocolSchema = z.object({ match_id: uuid, meet: optTime, warmup: optTime, briefing: optTime, meeting_point: z.string().trim().max(120, 'r_invalid').transform((v) => v || null), op: z.enum(['save', 'defaults']) });

export async function saveProtocol(fd: FormData): Promise<void> {
  const { supabase } = await db(fd);
  const parsed = protocolSchema.safeParse(Object.fromEntries(['match_id', 'meet', 'warmup', 'briefing', 'meeting_point', 'op'].map((k) => [k, fd.get(k) ?? ''])));
  if (!parsed.success) back(fd, parsed.error.issues[0]?.message === 'r_time' ? 'r_time' : 'r_invalid', '#protocol');
  const v = parsed.data;
  const { data: m } = await supabase.from('matches').select('kickoff_at').eq('id', v.match_id).maybeSingle();
  if (!m) back(fd, 'r_notYourTeam');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date(m.kickoff_at));
  const at = (hm: string) => (hm ? helsinkiToIso(day, hm) : null);
  const times = v.op === 'defaults'
    ? { meet_at: minus(m.kickoff_at, PROTOCOL_DEFAULTS.meet), warmup_at: minus(m.kickoff_at, PROTOCOL_DEFAULTS.warmup), briefing_at: minus(m.kickoff_at, PROTOCOL_DEFAULTS.briefing) }
    : { meet_at: at(v.meet), warmup_at: at(v.warmup), briefing_at: at(v.briefing) };
  const kick = Date.parse(m.kickoff_at);
  if (Object.values(times).some((x) => x && (Date.parse(x) > kick || Date.parse(x) < kick - 6 * 3600000))) back(fd, 'r_protocolTimes', '#protocol');
  const { data, error } = await supabase.from('matches').update({ ...times, meeting_point: v.meeting_point }).eq('id', v.match_id).select('id');
  if (error) back(fd, error.code === '23514' ? 'r_protocolTimes' : 'r_error', '#protocol');
  if (!data?.length) back(fd, 'r_notYourTeam');
  refresh(v.match_id);
  back(fd, 'r_protocolSaved', '#protocol');
}

// ---------- lineup ----------
const lineupSchema = z.object({
  match_id: uuid, formation: z.string().regex(/^[0-9-]{3,12}$/),
  starters: z.array(z.object({ slot: z.number().int().min(1).max(11), player: uuid })).max(11),
  subs: z.array(uuid).max(12), captain: z.union([z.literal(''), uuid]),
  rotation: z.array(z.object({ minute: z.number().int().min(1).max(120), off: uuid, on: uuid })).max(24),
  plan: z.object({
    style: z.enum(STYLES), line: z.enum(LINES), press: z.enum(PRESSING), width: z.enum(WIDTHS), tempo: z.enum(TEMPOS),
    text: z.string().max(2000).transform((v) => v.replace(/\r\n/g, '\n').trim()),
  }),
});

export async function saveLineup(fd: FormData): Promise<void> {
  const { supabase } = await db(fd);
  let raw: unknown;
  try {
    const j = (k: string, d: string) => JSON.parse(String(fd.get(k) ?? d));
    raw = { match_id: fd.get('match_id'), formation: fd.get('formation'), starters: j('starters', '[]'), subs: j('subs', '[]'), captain: fd.get('captain') ?? '', rotation: j('rotation', '[]'), plan: j('plan', '{}') };
  } catch { back(fd, 'r_invalid', '#lineup'); }
  const parsed = lineupSchema.safeParse(raw);
  if (!parsed.success) back(fd, 'r_invalid', '#lineup');
  const v = parsed.data;
  // the whole board in one step: formation, players, bench, captain, rotation plan, style, instructions and plan (migration 0032)
  const { error } = await supabase.rpc('save_lineup', {
    p_match: v.match_id, p_formation: v.formation, p_starters: v.starters, p_subs: v.subs, p_captain: v.captain || null, p_rotation: v.rotation,
    p_plan: { style: v.plan.style, line: v.plan.line, press: v.plan.press, width: v.plan.width, tempo: v.plan.tempo, text: v.plan.text },
  });
  if (error) {
    console.error('[match] lineup refused', { code: error.code, message: error.message });
    back(fd, /locked/i.test(error.message) ? 'r_lineupLocked' : error.code === '42501' ? 'r_notYourTeam' : /roster/i.test(error.message) ? 'r_notRoster'
      : /substitute|pitch then|goes off once/i.test(error.message) ? 'r_rotationInvalid' : 'r_lineupInvalid', '#lineup');
  }
  refresh(v.match_id);
  back(fd, 'r_lineupSaved', '#lineup');
}

export async function publishLineup(fd: FormData): Promise<void> {
  const { supabase } = await db(fd);
  const id = uuid.safeParse(fd.get('match_id'));
  if (!id.success) back(fd, 'r_invalid');
  const publish = fd.get('publish') === 'true';
  const { data, error } = await supabase.from('matches').update({ squad_published: publish }).eq('id', id.data).select('id');
  if (error || !data?.length) back(fd, error ? 'r_error' : 'r_notYourTeam', '#lineup');
  refresh(id.data);
  back(fd, publish ? 'r_published' : 'r_unpublished', '#lineup');
}

// ---------- live match ----------
const EVENT_TYPES = ['goal', 'own_goal', 'penalty_scored', 'penalty_missed', 'yellow_card', 'second_yellow', 'red_card', 'substitution', 'injury', 'note'] as const;
const optUuid = z.union([z.literal(''), uuid]).transform((v) => v || null);
const eventSchema = z.object({
  match_id: uuid, type: z.enum(EVENT_TYPES), side: z.enum(['us', 'opponent']),
  minute: z.coerce.number().int().min(0).max(130), added_minute: z.coerce.number().int().min(0).max(20),
  player_id: optUuid, assist_player_id: optUuid, player_out_id: optUuid,
  opponent_label: z.string().trim().max(80).transform((v) => v || null), note: z.string().trim().max(300).transform((v) => v || null),
});

function eventError(message: string): string {
  if (/not in the match squad/i.test(message)) return 'r_evNotSquad';
  if (/not on the pitch/i.test(message)) return 'r_evNotOnPitch';
  if (/already played/i.test(message)) return 'r_evAlreadyPlayed';
  if (/only a substitute/i.test(message)) return 'r_evOnlySub';
  if (/finished/i.test(message)) return 'r_evFinished';
  return 'r_evInvalid';
}

export async function addMatchEvent(fd: FormData): Promise<void> {
  const { supabase } = await db(fd);
  const parsed = eventSchema.safeParse(Object.fromEntries(['match_id', 'type', 'side', 'minute', 'added_minute', 'player_id', 'assist_player_id', 'player_out_id', 'opponent_label', 'note'].map((k) => [k, fd.get(k) ?? ''])));
  if (!parsed.success) back(fd, 'r_evInvalid', '#live');
  const v = parsed.data;
  // keep only the fields that belong to this kind of event (the database refuses the others)
  const ours = v.side === 'us';
  const row = {
    match_id: v.match_id, type: v.type, side: v.side, minute: v.minute, added_minute: v.added_minute,
    player_id: ours && v.type !== 'note' ? v.player_id : null,
    assist_player_id: ours && (v.type === 'goal' || v.type === 'penalty_scored') ? v.assist_player_id : null,
    player_out_id: ours && v.type === 'substitution' ? v.player_out_id : null,
    opponent_label: ours ? null : v.opponent_label, note: v.note,
  };
  if (ours && v.type !== 'note' && !row.player_id) back(fd, 'r_evPlayer', '#live');
  if (row.type === 'substitution' && ours && (!row.player_out_id || row.player_out_id === row.player_id)) back(fd, 'r_evPlayer', '#live');
  if (row.assist_player_id && row.assist_player_id === row.player_id) back(fd, 'r_evInvalid', '#live');
  const { error } = await supabase.from('match_events').insert(row);
  if (error) { console.error('[match] event refused', { code: error.code, message: error.message }); back(fd, eventError(error.message), '#live'); }
  refresh(v.match_id);
  back(fd, 'r_evAdded', '#live');
}

const phaseSchema = z.object({ match_id: uuid, phase: z.enum(['kickoff', 'half_time', 'second_half', 'full_time']), minute: z.coerce.number().int().min(0).max(130), added_minute: z.coerce.number().int().min(0).max(20) });
const EXPECTED = { kickoff: 'not_started', half_time: 'first_half', second_half: 'half_time', full_time: 'second_half' } as const;

export async function matchPhase(fd: FormData): Promise<void> {
  const { supabase } = await db(fd);
  const parsed = phaseSchema.safeParse({ match_id: fd.get('match_id'), phase: fd.get('phase'), minute: fd.get('minute') ?? '0', added_minute: fd.get('added_minute') ?? '0' });
  if (!parsed.success) back(fd, 'r_invalid', '#live');
  const v = parsed.data;
  const { data: m } = await supabase.from('matches').select('live_state, status').eq('id', v.match_id).maybeSingle();
  if (!m) back(fd, 'r_notYourTeam');
  if (m.live_state !== EXPECTED[v.phase] || m.status === 'cancelled' || m.status === 'postponed') back(fd, 'r_phaseOrder', '#live');
  const minute = v.phase === 'kickoff' ? 0 : v.phase === 'second_half' ? 45 : v.minute;
  const { error } = await supabase.from('match_events').insert({ match_id: v.match_id, type: v.phase, side: 'us', minute, added_minute: v.phase === 'kickoff' || v.phase === 'second_half' ? 0 : v.added_minute });
  if (error) { console.error('[match] phase refused', { code: error.code, message: error.message }); back(fd, eventError(error.message), '#live'); }
  refresh(v.match_id);
  back(fd, `r_${v.phase}`, '#live');
}

export async function voidMatchEvent(fd: FormData): Promise<void> {
  const { member, supabase } = await db(fd);
  const parsed = z.object({ match_id: uuid, event_id: uuid }).safeParse({ match_id: fd.get('match_id'), event_id: fd.get('event_id') });
  if (!parsed.success) back(fd, 'r_invalid', '#live');
  const { data, error } = await supabase.from('match_events').update({ voided: true, voided_by: member.id, voided_at: new Date().toISOString() })
    .eq('id', parsed.data.event_id).eq('match_id', parsed.data.match_id).eq('voided', false).select('id');
  if (error) back(fd, eventError(error.message), '#timeline');
  if (!data?.length) back(fd, 'r_notYourTeam', '#timeline');
  refresh(parsed.data.match_id);
  back(fd, 'r_evVoided', '#timeline');
}
