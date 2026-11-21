'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { ATTENDANCE, coachesTeam } from '@/lib/coach';
import { meetingTime, resolveLocation } from '@/lib/locations';
import { getSupabase } from '@/lib/supabase/server';
import { addDays, helsinkiToIso, helsinkiToday } from '@/lib/time';

/**
 * Coach tools: training schedule and attendance. Every write runs as the coach; RLS (sessions_write, attendance_coach)
 * only allows teams they are assigned to, and the checks here give a clear message first. Results: ?result=<key under coach.*>.
 */

const uuid = z.string().uuid();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'r_time');

function back(fd: FormData, result: string, fallback = '/coach'): never {
  const raw = String(fd.get('back') ?? '');
  const url = new URL(raw.startsWith('/coach') ? raw : fallback, 'http://x');
  url.searchParams.set('result', result);
  redirect(url.pathname + url.search);
}

async function session(fd: FormData) {
  const member = await requireArea('coach');
  const supabase = await getSupabase();
  if (!supabase) back(fd, 'r_error');
  return { member, supabase };
}

const createSchema = z.object({
  team_season_id: uuid,
  title: z.string().trim().min(2, 'r_title').max(120, 'r_title'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'r_date'),
  start: hhmm, end: hhmm,
  meet: z.union([z.literal(''), hhmm]),
  meeting_point: z.string().trim().max(120, 'r_invalid').transform((v) => v || null),
  focus: z.string().trim().max(200, 'r_invalid').transform((v) => v || null),
  repeat: z.coerce.number().int().min(1, 'r_repeat').max(20, 'r_repeat'),
}).refine((v) => v.end > v.start, { message: 'r_endAfterStart' });

/**
 * Adds one session, or the same session weekly for up to 20 weeks. The database seeds an attendance row per player.
 * Optional meeting time and point (migration 0034); the place can be a new one saved on the way; "show on the website" puts
 * the session on the club website's calendar.
 */
export async function createSessions(fd: FormData): Promise<void> {
  const p = createSchema.safeParse(Object.fromEntries(['team_season_id', 'title', 'date', 'start', 'end', 'meet', 'meeting_point', 'focus', 'repeat'].map((k) => [k, fd.get(k) ?? ''])));
  if (!p.success) back(fd, p.error.issues[0]?.message ?? 'r_invalid');
  const { member, supabase } = await session(fd);
  if (!(await coachesTeam(supabase, member.id, p.data.team_season_id))) back(fd, 'r_notYourTeam');
  if (p.data.date < addDays(helsinkiToday(), -30)) back(fd, 'r_date'); // no back-filling more than a month
  if (meetingTime(p.data.meet, p.data.start) === 'bad') back(fd, 'e_meet');
  const place = await resolveLocation(supabase, fd, member.id);
  if ('error' in place) back(fd, place.error);
  const pub = fd.get('public') === 'on';
  const rows = Array.from({ length: p.data.repeat }, (_, i) => {
    const day = addDays(p.data.date, i * 7);
    return { team_season_id: p.data.team_season_id, title: p.data.title, focus: p.data.focus, location_id: place.id,
      starts_at: helsinkiToIso(day, p.data.start), ends_at: helsinkiToIso(day, p.data.end), status: 'scheduled', created_by: member.id,
      meet_at: p.data.meet ? helsinkiToIso(day, p.data.meet) : null, meeting_point: p.data.meeting_point, public: pub };
  });
  const { error } = await supabase.from('training_sessions').insert(rows);
  if (error) { console.error('[coach] create sessions refused', { code: error.code, message: error.message }); back(fd, error.code === '42501' ? 'r_notYourTeam' : 'r_error'); }
  revalidatePath('/coach', 'layout'); revalidatePath('/me', 'layout');
  back(fd, p.data.repeat > 1 ? 'r_sessionsCreated' : 'r_sessionCreated');
}

export async function cancelSession(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('session_id'));
  if (!id.success) back(fd, 'r_invalid');
  const { supabase } = await session(fd);
  const { data, error } = await supabase.from('training_sessions').update({ status: 'cancelled' }).eq('id', id.data).neq('status', 'completed').select('id');
  if (error || !data?.length) back(fd, error?.code === '42501' || !data?.length ? 'r_notYourTeam' : 'r_error');
  revalidatePath('/coach', 'layout');
  back(fd, 'r_sessionCancelled');
}

/**
 * Saves attendance for one session: fields att_<player id> = present | late | absent | excused (empty = not marked).
 * Only players on the team's current roster are accepted; rows missing for players who joined after the session was
 * planned are created. Marking is possible from the session's day onward; a marked session counts as completed.
 */
export async function saveAttendance(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('session_id'));
  if (!id.success) back(fd, 'r_invalid');
  const { member, supabase } = await session(fd);
  const { data: s } = await supabase.from('training_sessions').select('id, team_season_id, starts_at, status').eq('id', id.data).maybeSingle();
  if (!s) back(fd, 'r_notYourTeam'); // RLS hides sessions of other teams
  if (s.status === 'cancelled') back(fd, 'r_cancelled');
  if (helsinkiToday(new Date(s.starts_at)) > helsinkiToday()) back(fd, 'r_tooEarly'); // from the session's day (Helsinki) onward

  const { data: roster } = await supabase.from('team_players').select('player_id').eq('team_season_id', s.team_season_id).is('left_on', null);
  const allowed = new Set((roster ?? []).map((r) => r.player_id));
  const marks: { player_id: string; attendance: string | null }[] = [];
  if (fd.get('all') === 'present') for (const pid of allowed) marks.push({ player_id: pid, attendance: 'present' }); // "All present" button
  else if (fd.get('all') === 'yes') {
    // "All who said yes are present": only the players who answered I'm in; the others keep their mark
    const { data: yes } = await supabase.from('session_attendance').select('player_id').eq('session_id', s.id).eq('availability', 'yes');
    for (const r of yes ?? []) if (allowed.has(r.player_id)) marks.push({ player_id: r.player_id, attendance: 'present' });
  }
  else for (const [k, v] of fd.entries()) {
    if (!k.startsWith('att_') || typeof v !== 'string') continue;
    const pid = k.slice(4);
    if (!allowed.has(pid)) back(fd, 'r_invalid');
    if (v !== '' && !(ATTENDANCE as readonly string[]).includes(v)) back(fd, 'r_invalid');
    marks.push({ player_id: pid, attendance: v || null });
  }
  if (!marks.length) back(fd, 'r_invalid');
  const now = new Date().toISOString();
  const { error } = await supabase.from('session_attendance').upsert(
    marks.map((m) => ({ session_id: s.id, player_id: m.player_id, attendance: m.attendance, marked_by: m.attendance ? member.id : null, marked_at: m.attendance ? now : null })),
    { onConflict: 'session_id,player_id' });
  if (error) { console.error('[coach] attendance refused', { code: error.code, message: error.message }); back(fd, error.code === '42501' ? 'r_notYourTeam' : 'r_error'); }
  if (marks.some((m) => m.attendance) && s.starts_at <= now) await supabase.from('training_sessions').update({ status: 'completed' }).eq('id', s.id).eq('status', 'scheduled');
  revalidatePath('/coach', 'layout');
  revalidatePath('/me', 'layout');
  back(fd, 'r_attendanceSaved');
}

/** The reply deadline of a training or game (migration 0048): players can sign in or out until then; reminders follow it. */
export async function setReplyBy(fd: FormData): Promise<void> {
  const { supabase } = await session(fd);
  const p = z.object({ kind: z.enum(['training', 'game']), id: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'r_date'), time: hhmm })
    .safeParse({ kind: fd.get('kind'), id: fd.get('id'), date: fd.get('date'), time: fd.get('time') });
  if (!p.success) back(fd, p.error.issues[0]?.message === 'r_time' ? 'r_time' : 'r_date');
  const v = p.data;
  const at = helsinkiToIso(v.date, v.time);
  const table = v.kind === 'training' ? 'training_sessions' : 'matches';
  const startCol = v.kind === 'training' ? 'starts_at' : 'kickoff_at';
  const { data: row } = await supabase.from(table).select(startCol).eq('id', v.id).maybeSingle();
  if (!row) back(fd, 'r_invalid');
  if (at > (row as Record<string, string>)[startCol]!) back(fd, 'r_replyByLate');
  const { data, error } = await supabase.from(table).update({ reply_by: at }).eq('id', v.id).select('id');
  if (error || !data?.length) back(fd, 'r_error');
  revalidatePath('/coach', 'layout');
  back(fd, 'r_replyBySaved');
}
