'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { ATTENDANCE, coachesTeam } from '@/lib/coach';
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
  location_id: z.union([z.literal(''), uuid]).transform((v) => v || null),
  focus: z.string().trim().max(200, 'r_invalid').transform((v) => v || null),
  repeat: z.coerce.number().int().min(1, 'r_repeat').max(20, 'r_repeat'),
}).refine((v) => v.end > v.start, { message: 'r_endAfterStart' });

/** Adds one session, or the same session weekly for up to 20 weeks. The database seeds an attendance row per player. */
export async function createSessions(fd: FormData): Promise<void> {
  const p = createSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, p.error.issues[0]?.message ?? 'r_invalid');
  const { member, supabase } = await session(fd);
  if (!(await coachesTeam(supabase, member.id, p.data.team_season_id))) back(fd, 'r_notYourTeam');
  if (p.data.date < addDays(helsinkiToday(), -30)) back(fd, 'r_date'); // no back-filling more than a month
  const rows = Array.from({ length: p.data.repeat }, (_, i) => {
    const day = addDays(p.data.date, i * 7);
    return { team_season_id: p.data.team_season_id, title: p.data.title, focus: p.data.focus, location_id: p.data.location_id,
      starts_at: helsinkiToIso(day, p.data.start), ends_at: helsinkiToIso(day, p.data.end), status: 'scheduled', created_by: member.id };
  });
  const { error } = await supabase.from('training_sessions').insert(rows);
  if (error) { console.error('[coach] create sessions refused', { code: error.code, message: error.message }); back(fd, error.code === '42501' ? 'r_notYourTeam' : 'r_error'); }
  revalidatePath('/coach', 'layout');
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
