'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isAdminRole } from '@afrofoot/db';
import { requireMember } from '@/lib/auth';
import { safeNext } from '@/lib/paths';
import { getSupabase } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';

export type MfaState = { status: 'idle' } | { status: 'error'; error: 'code' | 'wrong' | 'failed' };

/**
 * Confirm the sign-in with the 6-digit code from the authenticator app (Supabase Auth TOTP). The first time this also
 * finishes the setup (the factor becomes verified). On success the session is raised to "aal2" (new cookies) and the
 * admin continues where they were going.
 */
export async function verifyMfa(_: MfaState, fd: FormData): Promise<MfaState> {
  await requireMember('/mfa');
  const p = z.object({ factorId: z.string().uuid(), code: z.string().trim().regex(/^\d{6}$/) }).safeParse({ factorId: fd.get('factorId'), code: String(fd.get('code') ?? '').replace(/\s+/g, '') });
  if (!p.success) return { status: 'error', error: 'code' };
  const supabase = await getSupabase();
  if (!supabase) return { status: 'error', error: 'failed' };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: p.data.factorId, code: p.data.code });
  if (error) {
    console.error('[mfa] verify refused', { code: error.code, status: error.status });
    return { status: 'error', error: error.status === 422 || error.status === 400 || /invalid|expired/i.test(error.message) ? 'wrong' : 'failed' };
  }
  redirect(safeNext(fd.get('next')) ?? '/admin');
}

/**
 * A super admin resets another admin's two-step sign-in (a lost or new phone): their authenticator factors are removed,
 * so at the next sign-in they set it up again. Only with a confirmed session of their own; kept in the audit trail.
 */
export async function resetMfa(fd: FormData): Promise<void> {
  const actor = await requireMember('/admin/members');
  const back = (r: string) => redirect(`/admin/members?result=${r}`);
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) back('invalid');
  // the role comes from the database (getMember), the confirmed sign-in from the session
  if (actor.role !== 'super_admin' || actor.aal !== 'aal2') back('notAllowed');
  const db = serviceClient();
  if (!db) back('error');
  const { data: target } = await db!.from('profiles').select('role').eq('id', id.data!).maybeSingle();
  if (!target || !isAdminRole(target.role)) back('notAllowed');
  const { data: factors, error } = await db!.auth.admin.mfa.listFactors({ userId: id.data! });
  if (error) { console.error('[mfa] list refused', { message: error.message }); back('error'); }
  for (const f of factors?.factors ?? []) await db!.auth.admin.mfa.deleteFactor({ id: f.id, userId: id.data! });
  await db!.from('audit_log').insert({ actor_id: actor.id, action: 'UPDATE', table_name: 'auth.mfa_factors', record_id: id.data!, old_data: { factors: (factors?.factors ?? []).length }, new_data: { factors: 0, reason: 'two-step sign-in reset by a super admin' } });
  back('mfaReset');
}
