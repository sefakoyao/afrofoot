'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isAdminRole } from '@afrofoot/db';
import { requireMember } from '@/lib/auth';
import { coachesTeam } from '@/lib/coach';
import { EVENT_KINDS } from '@/lib/events';
import { meetingTime, resolveLocation } from '@/lib/locations';
import { getSupabase } from '@/lib/supabase/server';
import { addDays, helsinkiToIso, helsinkiToday } from '@/lib/time';

/**
 * Other events (migration 0034: club_events): team meetings, social events, tournaments, camps…
 * Coaches add events for the teams they coach; admins also for the whole club. RLS (club_events_admin / club_events_coach)
 * enforces the same; the checks here give a clear message first. zod rules mirror the table's checks.
 * Results: ?result=<key under events.*>.
 */
const uuid = z.string().uuid();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'e_time');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'e_date');

function back(fd: FormData, result: string): never {
  const raw = String(fd.get('back') ?? '');
  const url = new URL(raw.startsWith('/coach') || raw.startsWith('/admin') ? raw : '/', 'http://x');
  url.searchParams.set('result', result);
  redirect(url.pathname + url.search + '#events');
}
const refresh = () => { revalidatePath('/coach', 'layout'); revalidatePath('/admin', 'layout'); revalidatePath('/me', 'layout'); };

async function writer(fd: FormData, team: string | null) {
  const member = await requireMember();
  const supabase = await getSupabase();
  if (!supabase) back(fd, 'e_error');
  const admin = isAdminRole(member.role);
  if (!admin && (member.role !== 'coach' || !team || !(await coachesTeam(supabase, member.id, team)))) back(fd, 'e_notYours');
  return { member, supabase };
}

const createSchema = z.object({
  team_season_id: z.union([z.literal(''), uuid]).transform((v) => v || null),
  kind: z.enum(EVENT_KINDS, { message: 'e_invalid' }),
  title: z.string().trim().min(2, 'e_title').max(120, 'e_title'),
  date: day, start: hhmm, end: hhmm,
  end_date: z.union([z.literal(''), day]),
  meet: z.union([z.literal(''), hhmm]),
  meeting_point: z.string().trim().max(120, 'e_invalid').transform((v) => v || null),
  description: z.string().trim().max(2000, 'e_invalid').transform((v) => v || null),
});

export async function createEvent(fd: FormData): Promise<void> {
  const p = createSchema.safeParse(Object.fromEntries(['team_season_id', 'kind', 'title', 'date', 'start', 'end', 'end_date', 'meet', 'meeting_point', 'description'].map((k) => [k, fd.get(k) ?? ''])));
  if (!p.success) back(fd, p.error.issues[0]?.message?.startsWith('e_') ? p.error.issues[0].message : 'e_invalid');
  const v = p.data;
  if (v.date < helsinkiToday()) back(fd, 'e_date');
  const endDay = v.end_date || v.date;
  if (endDay < v.date || (endDay === v.date && v.end <= v.start)) back(fd, 'e_end');
  if (endDay > addDays(v.date, 14)) back(fd, 'e_long');
  if (meetingTime(v.meet, v.start) === 'bad') back(fd, 'e_meet');
  const { member, supabase } = await writer(fd, v.team_season_id);
  const place = await resolveLocation(supabase, fd, member.id);
  if ('error' in place) back(fd, place.error);
  const { error } = await supabase.from('club_events').insert({
    team_season_id: v.team_season_id, kind: v.kind, title: v.title, description: v.description,
    starts_at: helsinkiToIso(v.date, v.start), ends_at: helsinkiToIso(endDay, v.end),
    meet_at: v.meet ? helsinkiToIso(v.date, v.meet) : null, meeting_point: v.meeting_point,
    location_id: place.id, public: fd.get('public') === 'on', created_by: member.id,
  });
  if (error) { console.error('[events] create refused', { code: error.code, message: error.message }); back(fd, error.code === '42501' ? 'e_notYours' : error.code === '23514' ? 'e_invalid' : 'e_error'); }
  refresh();
  back(fd, 'e_created');
}

/** Cancel or restore an event (players and the website then show it as cancelled). */
export async function setEventStatus(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('event_id'));
  const status = z.enum(['scheduled', 'cancelled']).safeParse(fd.get('status'));
  if (!id.success || !status.success) back(fd, 'e_invalid');
  const supabase = await getSupabase();
  await requireMember();
  if (!supabase) back(fd, 'e_error');
  const { data, error } = await supabase.from('club_events').update({ status: status.data }).eq('id', id.data).select('id');
  if (error || !data?.length) back(fd, 'e_notYours'); // RLS: not an event this member may change
  refresh();
  back(fd, status.data === 'cancelled' ? 'e_cancelled' : 'e_restored');
}
