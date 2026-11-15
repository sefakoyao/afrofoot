'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ROLES, assignableRoles, canManageMember, isRole } from '@afrofoot/db';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/** What an admin can do to one member. The status changes follow the account life cycle: pending → active ⇄ suspended. */
const memberAction = z.discriminatedUnion('op', [
  z.object({ op: z.literal('approve'), id: z.string().uuid() }),
  z.object({ op: z.literal('suspend'), id: z.string().uuid() }),
  z.object({ op: z.literal('reactivate'), id: z.string().uuid() }),
  z.object({ op: z.literal('role'), id: z.string().uuid(), role: z.enum(ROLES) }),
]);
const NEXT_STATUS = { approve: 'active', suspend: 'suspended', reactivate: 'active' } as const;
const FROM_STATUS = { approve: ['pending'], suspend: ['active', 'pending'], reactivate: ['suspended'] } as const;

/** Back to the list the admin was looking at (only /admin/members, so the field cannot redirect elsewhere). */
function back(fd: FormData, result: string): never {
  const raw = String(fd.get('back') ?? '');
  const url = new URL(raw.startsWith('/admin/members') ? raw : '/admin/members', 'http://x');
  url.searchParams.set('result', result);
  redirect(url.pathname + url.search);
}

/**
 * Approve, suspend, reactivate or change the role of a member. Runs as the signed-in admin, so RLS (admin_all) and the
 * guard_profiles trigger still decide; the checks here only give a clear message first. Every change lands in audit_log.
 */
export async function updateMember(fd: FormData): Promise<void> {
  const actor = await requireArea('admin');
  const p = memberAction.safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, 'invalid');
  const a = p.data;

  const supabase = await getSupabase();
  if (!supabase) back(fd, 'error');
  const { data: target } = await supabase.from('profiles').select('id, role, status').eq('id', a.id).maybeSingle();
  if (!target || !isRole(target.role)) back(fd, 'notFound');
  if (!canManageMember(actor, { id: target.id, role: target.role })) back(fd, 'notAllowed');

  let change: { status?: string; role?: string };
  if (a.op === 'role') {
    if (!assignableRoles(actor.role).includes(a.role)) back(fd, 'notAllowed');
    if (a.role === target.role) back(fd, 'unchanged');
    change = { role: a.role };
  } else {
    if (!(FROM_STATUS[a.op] as readonly string[]).includes(target.status)) back(fd, 'unchanged');
    change = { status: NEXT_STATUS[a.op] };
  }

  const { error } = await supabase.from('profiles').update(change).eq('id', a.id);
  if (error) {
    console.error('[members] update refused', { code: error.code, message: error.message });
    back(fd, error.code === '42501' ? 'notAllowed' : error.code === '23514' ? 'lastSuper' : 'error');
  }
  revalidatePath('/admin', 'layout');
  back(fd, a.op === 'role' ? 'roleChanged' : a.op);
}
