'use server';

import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { mailer } from '@/lib/supabase/mailer';
import { redirect } from 'next/navigation';
import { isLocale } from '@afrofoot/i18n';
import type { AuthError } from '@supabase/supabase-js';
import { getMember, homeFor } from '@/lib/auth';
import type { AuthState } from '@/lib/formState';
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS } from '@/lib/locale';
import { safeNext } from '@/lib/paths';
import { forgotSchema, resetSchema, signInSchema } from '@/lib/schemas';
import { getSupabase } from '@/lib/supabase/server';
import { supabaseEnvReport, supabaseTarget } from '@/lib/env';
import { isFeeBlock } from '@/lib/supabase/middleware';
import { isSocialProvider } from '@/lib/auth-providers';
import { IDLE_COOKIE } from '@/lib/idle';
import { errorDetail, logSignin, type SigninOutcome } from '@/lib/signin-log';

const fields = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
const fail = (error: string): AuthState => ({ status: 'error', error });

/** Null when NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY were not set when the app was built. */
async function client() {
  const supabase = await getSupabase();
  if (!supabase) console.error('[auth] Supabase is not configured', supabaseEnvReport());
  return supabase;
}

/** Map Supabase Auth errors to message keys without revealing whether an account exists. */
function authError(e: AuthError): AuthState {
  if (isFeeBlock(e)) return { status: 'blocked' };
  if (e.status === 429 || e.code === 'over_request_rate_limit' || e.code === 'over_email_send_rate_limit') return fail('tooManyAttempts');
  if (e.code === 'email_not_confirmed') return fail('emailNotConfirmed');
  if (e.code === 'invalid_credentials' || e.status === 400) return fail('invalidCredentials');
  // Unexpected: log the cause for the Vercel runtime logs (no email, password or key).
  console.error('[auth] Supabase Auth error', { status: e.status, code: e.code, message: e.message, ...supabaseTarget() });
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

/** The sign-in log's outcome for a failed password sign-in (same order as authError). */
function outcomeOf(e: AuthError): SigninOutcome {
  if (isFeeBlock(e)) return 'fee_blocked';
  if (e.status === 429 || e.code === 'over_request_rate_limit' || e.code === 'over_email_send_rate_limit') return 'rate_limited';
  if (e.code === 'email_not_confirmed') return 'not_confirmed';
  if (e.code === 'invalid_credentials' || e.status === 400) return 'wrong_password';
  return 'error';
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
  if (error) {
    const outcome = outcomeOf(error);
    await logSignin(mailer(), p.data.email, 'password', outcome, outcome === 'error' ? errorDetail(error) : null);
    return authError(error);
  }

  const member = await getMember();
  if (!member) { await supabase.auth.signOut(); await logSignin(mailer(), p.data.email, 'password', 'error', 'profile unreadable'); return fail('unavailable'); } // profile unreadable: logged in getMember
  if (member.status !== 'active') {
    await supabase.auth.signOut();
    await logSignin(mailer(), p.data.email, 'password', member.status === 'suspended' ? 'suspended' : 'pending');
    return fail(member.status === 'suspended' ? 'suspended' : 'pending');
  }
  await logSignin(supabase, null, 'password', 'ok');
  if (isLocale(member.locale)) (await cookies()).set(LOCALE_COOKIE, member.locale, LOCALE_COOKIE_OPTIONS);
  redirect(safeNext(p.data.next) ?? homeFor(member.role));
}

/**
 * "Continue with Google / Facebook": asks Supabase for the provider's sign-in page (PKCE; the code verifier is kept in
 * a cookie) and sends the browser there. The provider returns to /auth/callback, which finishes the sign-in and applies
 * the same checks as the password sign-in (pending, suspended, fee block).
 */
export async function signInWithProvider(fd: FormData): Promise<void> {
  const provider = fd.get('provider');
  if (!isSocialProvider(provider)) redirect('/login?reason=oauthFailed');
  const supabase = await client();
  if (!supabase) redirect('/login?reason=unavailable');
  const next = safeNext(fd.get('next'));
  const callback = `${await appOrigin()}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    // Supabase asks Google and Facebook for the email address by default; the club needs it to match existing members.
    options: { redirectTo: callback, skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    console.error('[auth] provider sign-in could not start', { provider, status: error?.status, code: error?.code, message: error?.message, ...supabaseTarget() });
    redirect('/login?reason=oauthFailed');
  }
  redirect(data.url);
}

/** Called by components/IdleGuard when nobody used the app for the inactivity limit (lib/idle.ts). */
export async function signOutForInactivity(): Promise<void> {
  const supabase = await getSupabase();
  await supabase?.auth.signOut({ scope: 'local' });
  (await cookies()).delete(IDLE_COOKIE);
  redirect('/login?reason=idle');
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
  // sent without PKCE, so the link also opens on another device than the one that asked (e.g. the email app on a phone)
  const mail = mailer();
  if (!mail) return fail('unavailable');
  const { error } = await mail.auth.resetPasswordForEmail(p.data.email, { redirectTo: `${await appOrigin()}/auth/confirm?next=/reset-password` });
  if (error && (error.status === 429 || error.code?.startsWith('over_'))) {
    await logSignin(mail, p.data.email, 'reset', 'reset_rate_limited', errorDetail(error));
    return { status: 'error', error: 'tooManyAttempts', email: p.data.email };
  }
  // Supabase could not send the email (e.g. its built-in mail server refuses addresses outside the project team when no
  // custom SMTP is set): the member still sees "link sent" (no account probing), the admin sees it in the sign-in log.
  if (error) console.error('[auth] reset email not sent', { status: error.status, code: error.code, message: error.message?.slice(0, 120), ...supabaseTarget() });
  await logSignin(mail, p.data.email, 'reset', error ? 'reset_failed' : 'reset_sent', error ? `${errorDetail(error)} ${error.message ?? ''}`.trim() : null);
  return { status: 'ok', message: 'linkSent' };
}

/**
 * An email link opened with Supabase's default template ends with the session in the URL fragment (#access_token=…),
 * which only the browser sees: /auth/hash hands it over here, and it is stored like any sign-in (cookies).
 */
export async function adoptLinkSession(accessToken: string, refreshToken: string): Promise<{ ok: boolean; blocked?: boolean }> {
  const tokens = z.object({ a: z.string().min(20).max(4000), r: z.string().min(6).max(400) }).safeParse({ a: accessToken, r: refreshToken });
  if (!tokens.success) return { ok: false };
  const supabase = await client();
  if (!supabase) return { ok: false };
  const { error } = await supabase.auth.setSession({ access_token: tokens.data.a, refresh_token: tokens.data.r });
  if (!error) await logSignin(supabase, null, 'link', 'ok');
  return error ? { ok: false, blocked: isFeeBlock(error) } : { ok: true };
}

/** Needs the short-lived session created by the recovery link (/auth/confirm or /auth/hash). */
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
