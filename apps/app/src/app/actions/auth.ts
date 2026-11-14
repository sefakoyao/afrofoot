'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isLocale } from '@afrofoot/i18n';
import type { AuthError } from '@supabase/supabase-js';
import { getMember, homeFor } from '@/lib/auth';
import type { AuthState } from '@/lib/formState';
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS } from '@/lib/locale';
import { safeNext } from '@/lib/paths';
import { forgotSchema, resetSchema, signInSchema } from '@/lib/schemas';
import { getSupabase } from '@/lib/supabase/server';
import { isFeeBlock } from '@/lib/supabase/middleware';

const fields = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
const fail = (error: string): AuthState => ({ status: 'error', error });

/** Null when NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY were not set when the app was built. */
async function client() {
  const supabase = await getSupabase();
  if (!supabase) console.error('[auth] Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the Vercel project, then redeploy');
  return supabase;
}

/** Map Supabase Auth errors to message keys without revealing whether an account exists. */
function authError(e: AuthError): AuthState {
  if (isFeeBlock(e)) return { status: 'blocked' };
  if (e.status === 429 || e.code === 'over_request_rate_limit' || e.code === 'over_email_send_rate_limit') return fail('tooManyAttempts');
  if (e.code === 'email_not_confirmed') return fail('emailNotConfirmed');
  if (e.code === 'invalid_credentials' || e.status === 400) return fail('invalidCredentials');
  // Unexpected: log the cause for the Vercel runtime logs (no email, password or key).
  console.error('[auth] Supabase Auth error', { status: e.status, code: e.code, message: e.message });
  return fail('unavailable');
}

/** Origin of this app for links in emails. APP_URL wins; otherwise the request host (Supabase only accepts redirect URLs on its allow list). */
async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3001';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function signIn(_: AuthState, fd: FormData): Promise<AuthState> {
  const r = await signInOnce(fd);
  const email = String(fd.get('email') ?? '').slice(0, 200);
  return r.status === 'error' || r.status === 'blocked' ? { ...r, email } : r;
}

async function signInOnce(fd: FormData): Promise<AuthState> {
  const p = signInSchema.safeParse(fields(fd));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'invalidCredentials');
  const supabase = await client();
  if (!supabase) return fail('unavailable');

  const { error } = await supabase.auth.signInWithPassword({ email: p.data.email, password: p.data.password });
  if (error) return authError(error);

  const member = await getMember();
  if (!member || member.status !== 'active') {
    await supabase.auth.signOut();
    return fail(member?.status === 'suspended' ? 'suspended' : 'pending');
  }
  if (isLocale(member.locale)) (await cookies()).set(LOCALE_COOKIE, member.locale, LOCALE_COOKIE_OPTIONS);
  redirect(safeNext(p.data.next) ?? homeFor(member.role));
}

export async function signOut(): Promise<void> {
  const supabase = await getSupabase();
  await supabase?.auth.signOut();
  redirect('/login');
}

/** Always answers "link sent" for a valid email so the form cannot be used to find out who has an account. */
export async function requestPasswordReset(_: AuthState, fd: FormData): Promise<AuthState> {
  const p = forgotSchema.safeParse(fields(fd));
  if (!p.success) return { status: 'error', error: p.error.issues[0]?.message ?? 'invalidEmail', email: String(fd.get('email') ?? '').slice(0, 200) };
  const supabase = await client();
  if (!supabase) return fail('unavailable');
  const { error } = await supabase.auth.resetPasswordForEmail(p.data.email, { redirectTo: `${await appOrigin()}/auth/confirm?next=/reset-password` });
  if (error && (error.status === 429 || error.code?.startsWith('over_'))) return { status: 'error', error: 'tooManyAttempts', email: p.data.email };
  return { status: 'ok', message: 'linkSent' };
}

/** Needs the short-lived session created by the recovery link (/auth/confirm). */
export async function updatePassword(_: AuthState, fd: FormData): Promise<AuthState> {
  const p = resetSchema.safeParse(fields(fd));
  if (!p.success) return fail(p.error.issues[0]?.message ?? 'passwordTooShort');
  const supabase = await client();
  if (!supabase) return fail('unavailable');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail('linkInvalid');
  const { error } = await supabase.auth.updateUser({ password: p.data.password });
  if (error) {
    if (error.code === 'same_password') return fail('samePassword');
    if (error.code === 'weak_password') return fail('passwordTooShort');
    return authError(error);
  }
  // Sign out other devices that may still hold the old password's sessions.
  await supabase.auth.signOut({ scope: 'others' });
  return { status: 'ok', message: 'passwordUpdated' };
}

/** Language switcher: remembered in a cookie and, when signed in, in profiles.locale (players may edit their own locale, RLS + guard trigger). */
export async function setLocale(fd: FormData): Promise<void> {
  const locale = fd.get('locale');
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, LOCALE_COOKIE_OPTIONS);
  const member = await getMember();
  if (member) await (await getSupabase())?.from('profiles').update({ locale }).eq('id', member.id);
}
