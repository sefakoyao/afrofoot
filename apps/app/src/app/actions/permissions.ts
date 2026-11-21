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

export async function saveCoachPermissions(fd: FormData): Promise<void> {
  await requireArea('admin');
  const id = z.string().uuid().safeParse(fd.get('profile_id'));
  if (!id.success) go('p_invalid');
  const wanted = new Set(fd.getAll('perm').map(String).filter((p): p is (typeof PERMISSIONS)[number] => (PERMISSIONS as readonly string[]).includes(p)));
  const supabase = await getSupabase();
  if (!supabase) go('p_error', id.data);
  const { data: had } = await supabase.from('coach_permissions').select('permission').eq('profile_id', id.data);
  const have = new Set(((had ?? []) as { permission: string }[]).map((r) => r.permission));
  const add = [...wanted].filter((p) => !have.has(p)), remove = [...have].filter((p) => !wanted.has(p as never));
  if (add.length) {
    const { error } = await supabase.from('coach_permissions').insert(add.map((permission) => ({ profile_id: id.data, permission })));
    if (error) { console.error('[permissions] grant refused', { code: error.code, message: error.message }); go(error.code === '23514' ? 'p_notCoach' : 'p_error', id.data); }
  }
  if (remove.length) {
    const { error } = await supabase.from('coach_permissions').delete().eq('profile_id', id.data).in('permission', remove);
    if (error) { console.error('[permissions] remove refused', { code: error.code, message: error.message }); go('p_error', id.data); }
  }
  revalidatePath('/admin', 'layout'); revalidatePath('/coach', 'layout');
  go('p_saved', id.data);
}
