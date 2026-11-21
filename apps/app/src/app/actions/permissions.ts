'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/permissions';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Admin → People → Coach permissions (migration 0070): saves one coach's ticks. Rights ticked are added, rights unticked
 * removed; the database (RLS admin_all, guard: coaches only) checks the same and the audit trail records each change.
 */
const PATH = '/admin/members/permissions';
function go(result: string, coach?: string): never { redirect(`${PATH}?result=${result}${coach ? `#c-${coach}` : ''}`); }

/** The database's reason, as a message the admin can act on (the code and text also go to the server logs). */
function why(e: { code?: string; message?: string }): string {
  if (e.code === '42P01' || e.code === 'PGRST205' || /coach_permissions/.test(e.message ?? '') && /does not exist|schema cache/.test(e.message ?? '')) return 'p_notInstalled';
  if (e.code === '23514' || /coaches and player-coaches/.test(e.message ?? '')) return 'p_notCoach';
  if (e.code === '42501') return 'p_notAllowed';
  if (e.code === '42883' || e.code === '22P02') return 'p_dbOld';
  return 'p_error';
}

export async function saveCoachPermissions(fd: FormData): Promise<void> {
  await requireArea('admin');
  const id = z.string().uuid().safeParse(fd.get('profile_id'));
  if (!id.success) go('p_invalid');
  const wanted = new Set(fd.getAll('perm').map(String).filter((p): p is (typeof PERMISSIONS)[number] => (PERMISSIONS as readonly string[]).includes(p)));
  const supabase = await getSupabase();
  if (!supabase) go('p_error', id.data);
  const { data: had, error: readError } = await supabase.from('coach_permissions').select('permission').eq('profile_id', id.data);
  if (readError) { console.error('[permissions] read refused', { code: readError.code, message: readError.message }); go(why(readError), id.data); }
  const have = new Set(((had ?? []) as { permission: string }[]).map((r) => r.permission));
  const add = [...wanted].filter((p) => !have.has(p)), remove = [...have].filter((p) => !wanted.has(p as never));
  if (add.length) {
    const { error } = await supabase.from('coach_permissions').insert(add.map((permission) => ({ profile_id: id.data, permission })));
    if (error) { console.error('[permissions] grant refused', { code: error.code, message: error.message }); go(why(error), id.data); }
  }
  if (remove.length) {
    const { error } = await supabase.from('coach_permissions').delete().eq('profile_id', id.data).in('permission', remove);
    if (error) { console.error('[permissions] remove refused', { code: error.code, message: error.message }); go(why(error), id.data); }
  }
  revalidatePath('/admin', 'layout'); revalidatePath('/coach', 'layout');
  go('p_saved', id.data);
}

/**
 * A player who coaches a team gets the Player-coach role (playing and coaching rights in one account, migration 0045),
 * so that coach permissions can be ticked for them. The profiles guard lets club and super admins do this; a database
 * without the Player-coach role (before 0045) says so.
 */
export async function makePlayerCoach(fd: FormData): Promise<void> {
  await requireArea('admin');
  const id = z.string().uuid().safeParse(fd.get('profile_id'));
  if (!id.success) go('p_invalid');
  const supabase = await getSupabase();
  if (!supabase) go('p_error');
  const { data, error } = await supabase.from('profiles').update({ role: 'player_coach' }).eq('id', id.data).eq('role', 'player').select('id');
  if (error) {
    console.error('[permissions] player-coach refused', { code: error.code, message: error.message });
    go(error.code === '22P02' ? 'p_noPlayerCoachRole' : error.code === '42501' ? 'p_notAllowed' : 'p_error', id.data);
  }
  if (!data?.length) go('p_error', id.data);
  revalidatePath('/admin', 'layout'); revalidatePath('/coach', 'layout');
  go('p_madePlayerCoach', id.data);
}
