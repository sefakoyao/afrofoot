'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { mailer } from '@/lib/supabase/mailer';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Admin → Sign-in help (migration 0044). The admin never sees or sets a password and cannot sign in as the member:
 * these actions only send Supabase's own emails to the member's address, and each one is written to the audit log.
 */
const uuid = z.string().uuid();
const back = (member: string, result: string): never => redirect(`/admin/signin-help?member=${encodeURIComponent(member)}&result=${result}`);

async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3001';
  return `${h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')}://${host}`;
}

export async function sendSigninLink(fd: FormData): Promise<void> {
  await requireArea('admin');
  const member = String(fd.get('member') ?? '');
  const kind = z.enum(['password', 'confirmation']).safeParse(fd.get('kind'));
  if (!uuid.safeParse(member).success || !kind.success) redirect('/admin/signin-help?result=r_invalid');
  const supabase = await getSupabase();
  const mail = mailer();
  if (!supabase || !mail) return back(member, 'r_error');
  const { data } = await supabase.rpc('signin_status', { p_profile: member });
  const st = (data as { email: string | null; has_account: boolean; email_confirmed: boolean }[] | null)?.[0];
  if (!st?.has_account || !st.email) return back(member, 'r_noEmail');
  const origin = await appOrigin();
  const { error } = kind.data === 'password'
    ? await mail.auth.resetPasswordForEmail(st.email, { redirectTo: `${origin}/auth/confirm?next=/reset-password` })
    : st.email_confirmed ? { error: null } : await mail.auth.resend({ type: 'signup', email: st.email, options: { emailRedirectTo: `${origin}/auth/confirm` } });
  if (error) {
    console.error('[signin-help] email refused', { kind: kind.data, status: error.status, code: error.code });
    return back(member, error.status === 429 || error.code?.startsWith('over_') ? 'r_tooMany' : 'r_error');
  }
  await supabase.rpc('log_signin_help', { p_profile: member, p_action: kind.data === 'password' ? 'password_link' : 'confirmation_link' });
  return back(member, kind.data === 'password' ? 'r_passwordSent' : st.email_confirmed ? 'r_alreadyConfirmed' : 'r_confirmationSent');
}

/** Lets a player with overdue fees sign in until a date (players.fee_exempt_until, migration 0022), e.g. to pay in the app. */
export async function grantSigninExemption(fd: FormData): Promise<void> {
  await requireArea('admin');
  const p = z.object({
    member: uuid, player: uuid,
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().min(2).max(200),
  }).safeParse({ member: fd.get('member'), player: fd.get('player'), until: fd.get('until'), reason: fd.get('reason') });
  const member = String(fd.get('member') ?? '');
  if (!p.success) return back(member, 'r_invalid');
  const today = new Date().toISOString().slice(0, 10);
  const max = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  if (p.data.until < today || p.data.until > max) return back(member, 'r_dates');
  const supabase = await getSupabase();
  if (!supabase) return back(member, 'r_error');
  const { error } = await supabase.rpc('set_fee_exemption', { p_player: p.data.player, p_until: p.data.until, p_reason: p.data.reason });
  if (error) { console.error('[signin-help] exemption refused', { code: error.code }); return back(member, 'r_error'); }
  revalidatePath('/admin/signin-help');
  return back(member, 'r_exempted');
}
