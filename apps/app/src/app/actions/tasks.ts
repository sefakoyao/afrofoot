'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { TASK_ICONS } from '@/components/TaskIcon';
import { getMember } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Game-day and training tasks (migration 0062). Coaches (their team's events) and admins add, give and remove tasks and
 * add task types; players take open tasks and give back their own (claim / release functions). The database checks who
 * may do what (RLS and the functions); these actions validate the form and say what happened.
 */
const uuid = z.string().uuid();
const BACK = /^\/(coach\/(matches|sessions)\/[0-9a-f-]{36}|me|admin\/tasks)(\?[\w=&%-]*)?$/;

function back(fd: FormData, result: string): never {
  const raw = String(fd.get('back') ?? '');
  const path = BACK.test(raw) ? raw : '/me';
  const anchor = String(fd.get('anchor') ?? '');
  redirect(`${path}${path.includes('?') ? '&' : '?'}result=${result}${/^[\w-]{1,60}$/.test(anchor) ? `#${anchor}` : '#tasks'}`);
}
async function db(fd: FormData) {
  const member = await getMember();
  const supabase = await getSupabase();
  if (!member || member.status !== 'active' || !supabase) back(fd, 't_error');
  return supabase;
}
function fail(fd: FormData, what: string, error: { code?: string; message?: string }): never {
  console.error(`[tasks] ${what} refused`, { code: error.code, message: error.message });
  back(fd, error.code === '42501' ? 't_notAllowed' : error.code === '23505' ? 't_taken' : error.code === '23514' ? 't_notInTeam' : error.code === '22023' ? 't_started' : 't_error');
}
const refresh = () => { revalidatePath('/me', 'layout'); revalidatePath('/coach', 'layout'); revalidatePath('/admin', 'layout'); };
const eventRef = z.object({ kind: z.enum(['match', 'session']), event_id: uuid });
const col = (kind: 'match' | 'session') => (kind === 'match' ? 'match_id' : 'session_id');

/** Adds a task of one type to a game or training, open (no player yet). */
export async function addEventTask(fd: FormData): Promise<void> {
  const p = eventRef.extend({ type_id: uuid }).safeParse({ kind: fd.get('kind'), event_id: fd.get('event_id'), type_id: fd.get('type_id') });
  if (!p.success) back(fd, 't_invalid');
  const supabase = await db(fd);
  const { error } = await supabase.from('event_tasks').insert({ [col(p.data.kind)]: p.data.event_id, task_type_id: p.data.type_id });
  if (error) fail(fd, 'add', error);
  refresh(); back(fd, 't_added');
}

/** Gives a task to a player of the team, or makes it open again (empty player). */
export async function assignEventTask(fd: FormData): Promise<void> {
  const p = z.object({ task_id: uuid, player_id: z.union([uuid, z.literal('')]) }).safeParse({ task_id: fd.get('task_id'), player_id: fd.get('player_id') ?? '' });
  if (!p.success) back(fd, 't_invalid');
  const supabase = await db(fd);
  const { data, error } = await supabase.from('event_tasks').update({ player_id: p.data.player_id || null }).eq('id', p.data.task_id).select('id');
  if (error) fail(fd, 'assign', error);
  if (!data?.length) back(fd, 't_notAllowed');
  refresh(); back(fd, p.data.player_id ? 't_assigned' : 't_opened');
}

export async function removeEventTask(fd: FormData): Promise<void> {
  const p = uuid.safeParse(fd.get('task_id'));
  if (!p.success) back(fd, 't_invalid');
  const supabase = await db(fd);
  const { data, error } = await supabase.from('event_tasks').delete().eq('id', p.data).select('id');
  if (error) fail(fd, 'remove', error);
  if (!data?.length) back(fd, 't_notAllowed');
  refresh(); back(fd, 't_removed');
}

// as the database: 2–60 characters, one of the icons the app draws
const typeSchema = z.object({ name: z.string().trim().min(2, 't_name').max(60, 't_name'), icon: z.enum(TASK_ICONS, { message: 't_icon' }) });

/** A new task type for the whole club (coaches and admins); from a game or training it is added to that event too. */
export async function createTaskType(fd: FormData): Promise<void> {
  const p = typeSchema.safeParse({ name: fd.get('name') ?? '', icon: fd.get('icon') ?? '' });
  if (!p.success) back(fd, p.error.issues[0]?.message ?? 't_invalid');
  const ev = eventRef.safeParse({ kind: fd.get('kind'), event_id: fd.get('event_id') });
  const supabase = await db(fd);
  const { data, error } = await supabase.from('task_types').insert({ name: p.data.name, icon: p.data.icon }).select('id').single();
  if (error) back(fd, error.code === '23505' ? 't_typeExists' : error.code === '42501' ? 't_notAllowed' : 't_error');
  if (ev.success) {
    const { error: e2 } = await supabase.from('event_tasks').insert({ [col(ev.data.kind)]: ev.data.event_id, task_type_id: data.id });
    if (e2) fail(fd, 'add new', e2);
  }
  refresh(); back(fd, ev.success ? 't_added' : 't_typeAdded');
}

/** Admins: rename a club task type (built-in names come from the translations) or hide / show any type. */
export async function updateTaskType(fd: FormData): Promise<void> {
  const p = z.object({ id: uuid, active: z.enum(['true', 'false']).optional(), name: z.string().trim().min(2, 't_name').max(60, 't_name').optional(), icon: z.enum(TASK_ICONS).optional() })
    .safeParse(Object.fromEntries([...fd].filter(([k]) => ['id', 'active', 'name', 'icon'].includes(k))));
  if (!p.success) back(fd, p.error.issues[0]?.message ?? 't_invalid');
  const supabase = await db(fd);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (p.data.active) patch.active = p.data.active === 'true';
  if (p.data.name) patch.name = p.data.name;
  if (p.data.icon) patch.icon = p.data.icon;
  const { data, error } = await supabase.from('task_types').update(patch).eq('id', p.data.id).select('id');
  if (error) back(fd, error.code === '23505' ? 't_typeExists' : 't_error');
  if (!data?.length) back(fd, 't_notAllowed');
  refresh(); back(fd, p.data.active === 'false' ? 't_typeHidden' : p.data.active === 'true' ? 't_typeShown' : 't_saved');
}

/** Players: "I'll do it" (take an open task) and "I can't do it" (give back their own). */
export async function claimTask(fd: FormData): Promise<void> {
  const p = uuid.safeParse(fd.get('task_id'));
  if (!p.success) back(fd, 't_invalid');
  const supabase = await db(fd);
  const { error } = await supabase.rpc('claim_event_task', { p_task: p.data });
  if (error) fail(fd, 'claim', error);
  refresh(); back(fd, 't_claimed');
}
export async function releaseTask(fd: FormData): Promise<void> {
  const p = uuid.safeParse(fd.get('task_id'));
  if (!p.success) back(fd, 't_invalid');
  const supabase = await db(fd);
  const { error } = await supabase.rpc('release_event_task', { p_task: p.data });
  if (error) fail(fd, 'release', error);
  refresh(); back(fd, 't_released');
}
