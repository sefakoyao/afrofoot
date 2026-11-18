'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getMember } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Shirt number requests (migration 0057): players ask (My profile), coaches (their team page) and admins
 * (Admin → Shirt numbers) decide. The database functions check who may do what and that the number is free.
 */
const uuid = z.string().uuid();
const BACK = /^\/(me\/profile|admin\/shirts|coach\/teams\/[0-9a-f-]{36})(\?[\w=&%-]*)?$/;
const note = z.string().trim().max(200);

function back(fd: FormData, result: string): never {
  const raw = String(fd.get('back') ?? '');
  const path = BACK.test(raw) ? raw : '/me/profile';
  redirect(`${path}${path.includes('?') ? '&' : '?'}result=${result}#shirts`);
}
async function db(fd: FormData) {
  const member = await getMember();
  const supabase = await getSupabase();
  if (!member || member.status !== 'active' || !supabase) back(fd, 'r_error');
  return supabase;
}
const refresh = () => { revalidatePath('/me', 'layout'); revalidatePath('/coach', 'layout'); revalidatePath('/admin', 'layout'); };

export async function requestShirt(fd: FormData): Promise<void> {
  const p = z.object({ team_season_id: uuid, number: z.coerce.number().int().min(1).max(99), note }).safeParse({ team_season_id: fd.get('team_season_id'), number: fd.get('number'), note: String(fd.get('note') ?? '') });
  if (!p.success) back(fd, 'r_pick');
  const supabase = await db(fd);
  const { error } = await supabase.rpc('request_shirt_number', { p_ts: p.data.team_season_id, p_number: p.data.number, p_note: p.data.note || null });
  if (error) back(fd, error.code === '23505' ? 'r_taken' : error.code === '42501' ? 'r_notAllowed' : 'r_error');
  refresh(); back(fd, 'r_requested');
}

export async function withdrawShirt(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('request_id'));
  if (!id.success) back(fd, 'r_error');
  const supabase = await db(fd);
  const { error } = await supabase.rpc('withdraw_shirt_request', { p_request: id.data });
  if (error) back(fd, 'r_error');
  refresh(); back(fd, 'r_withdrawn');
}

export async function decideShirt(fd: FormData): Promise<void> {
  const p = z.object({ request_id: uuid, decision: z.enum(['approve', 'decline']), note }).safeParse({ request_id: fd.get('request_id'), decision: fd.get('decision'), note: String(fd.get('note') ?? '') });
  if (!p.success) back(fd, 'r_error');
  const supabase = await db(fd);
  const { error } = await supabase.rpc('decide_shirt_request', { p_request: p.data.request_id, p_approve: p.data.decision === 'approve', p_note: p.data.note || null });
  if (error) back(fd, error.code === '23505' ? 'r_taken' : error.code === '42501' ? 'r_notAllowed' : error.code === '22023' ? 'r_gone' : 'r_error');
  refresh(); back(fd, p.data.decision === 'approve' ? 'r_approved' : 'r_declined');
}
