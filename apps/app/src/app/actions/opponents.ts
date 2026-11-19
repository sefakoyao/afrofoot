'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/** Admin → Teams & events → Opponents (migration 0061): add, rename, hide or show the names coaches pick from. */
const uuid = z.string().uuid();
// as the database: 1–120 characters, no spaces around (opponents.name check)
const name = z.string().trim().min(1, 'r_name').max(120, 'r_name');

function back(result: string): never { redirect(`/admin/opponents?result=${result}`); }
async function db() {
  await requireArea('admin');
  const supabase = await getSupabase();
  if (!supabase) back('r_error');
  return supabase;
}
function fail(what: string, error: { code?: string; message?: string }): never {
  console.error(`[opponents] ${what} refused`, { code: error.code, message: error.message });
  back(error.code === '23505' ? 'r_duplicate' : error.code === '42501' ? 'r_notAllowed' : 'r_error');
}
const refresh = () => { revalidatePath('/admin', 'layout'); revalidatePath('/coach', 'layout'); };

export async function addOpponent(fd: FormData): Promise<void> {
  const p = name.safeParse(fd.get('name') ?? '');
  if (!p.success) back(p.error.issues[0]?.message ?? 'r_name');
  const supabase = await db();
  const { error } = await supabase.from('opponents').insert({ name: p.data });
  if (error) fail('add', error);
  refresh(); back('r_added');
}

export async function renameOpponent(fd: FormData): Promise<void> {
  const p = z.object({ id: uuid, name }).safeParse({ id: fd.get('id'), name: fd.get('name') ?? '' });
  if (!p.success) back(p.error.issues[0]?.message ?? 'r_invalid');
  const supabase = await db();
  const { error } = await supabase.from('opponents').update({ name: p.data.name, updated_at: new Date().toISOString() }).eq('id', p.data.id);
  if (error) fail('rename', error);
  refresh(); back('r_renamed');
}

export async function setOpponentActive(fd: FormData): Promise<void> {
  const p = z.object({ id: uuid, active: z.enum(['true', 'false']) }).safeParse({ id: fd.get('id'), active: fd.get('active') });
  if (!p.success) back('r_invalid');
  const supabase = await db();
  const { error } = await supabase.from('opponents').update({ active: p.data.active === 'true', updated_at: new Date().toISOString() }).eq('id', p.data.id);
  if (error) fail('active', error);
  refresh(); back(p.data.active === 'true' ? 'r_shown' : 'r_hidden');
}
