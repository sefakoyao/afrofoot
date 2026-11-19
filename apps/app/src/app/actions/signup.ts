'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isLocale } from '@afrofoot/i18n';
import type { AuthError } from '@supabase/supabase-js';
import { getMember, homeFor } from '@/lib/auth';
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS } from '@/lib/locale';
import { safeNext } from '@/lib/paths';
import { checkAnswer, honeypotFilled, newChallenge, type Challenge } from '@/lib/robot-check';
import { phoneSignUpSchema, signInPhone, signUpSchema, smsCode } from '@/lib/schemas';
import { getSupabase } from '@/lib/supabase/server';
import { supabaseTarget } from '@/lib/env';
import { isFeeBlock } from '@/lib/supabase/middleware';

/**
 * Creating an account in the member app (email and password, or a phone number with a code by text message) and signing
 * in with a phone number. Every new account is a pending player until an admin approves it (handle_new_user, 0035); the
 * fee block (0022) applies here too. Sign-up forms carry the football robot check (lib/robot-check.ts) and a honeypot.
 * Messages are keys under auth.*; answers never reveal whether an email address or phone number already has an account.
 */
export type SignUpState =
  | { status: 'idle'; challenge?: Challenge | null }
  | { status: 'error'; error: string; challenge?: Challenge | null; values?: Record<string, string> }
  | { status: 'sent' }
  | { status: 'code'; phone: string; mode: Mode; error?: string }
  | { status: 'done'; message: string }
  | { status: 'blocked' };
type Mode = 'signup' | 'signin';

const fields = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
/** What the person typed (never the password), so a failed attempt does not empty the form. */
const keep = (fd: FormData) => Object.fromEntries(['first_name', 'last_name', 'email', 'phone'].map((k) => [k, String(fd.get(k) ?? '').slice(0, 200)]));
const retry = (error: string, fd: FormData): SignUpState => ({ status: 'error', error, challenge: newChallenge(), values: keep(fd) });

async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3001';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Robot check and honeypot. 'pass' | an error key | 'silent' (robot: answer as if all went well, do nothing). */
function robot(fd: FormData): 'pass' | 'silent' | string {
  if (honeypotFilled(fd)) return 'silent';
  const r = checkAnswer(fd.get('robot_token'), fd.get('robot_answer'));
  if (r === 'ok') return 'pass';
  if (r === 'tooFast') return 'robotTooFast';
  return r === 'expired' ? 'robotExpired' : r === 'invalid' && !fd.get('robot_answer') ? 'robotMissing' : 'robotWrong';
}

/** Phone numbers can appear in provider messages ("The 'To' number +358… is not valid"): never write them to the logs. */
const redact = (m: string | undefined) => (m ?? '').replace(/\+\d[\d ()-]{5,}\d|\b\d{9,}\b/g, '[number]').slice(0, 300);

/**
 * Maps a Supabase Auth error to a message key, and always writes Supabase's own code and message to the server log
 * (Vercel → Logs), so a refusal such as an SMS provider set up wrongly can be traced without reproducing it.
 */
function authFailure(e: AuthError, where: string): string {
  console.error(`[signup] ${where}`, { status: e.status, code: e.code, message: redact(e.message), ...supabaseTarget() });
  if (e.status === 429 || e.code?.startsWith('over_')) return 'tooManyAttempts';
  if (e.code === 'weak_password') return 'passwordTooShort';
  if (e.code === 'phone_provider_disabled' || e.code === 'sms_send_failed') return 'smsUnavailable';
  if (e.code === 'signup_disabled') return 'signUpClosed';
  return 'signUpUnavailable';
}

/** Email and password: Supabase sends a confirmation link (to /auth/confirm); the account then waits for approval. */
export async function signUpWithEmail(_: SignUpState, fd: FormData): Promise<SignUpState> {
  const r = robot(fd);
  if (r === 'silent') return { status: 'sent' };
  if (r !== 'pass') return retry(r, fd);
  const p = signUpSchema.safeParse(fields(fd));
  if (!p.success) return retry(p.error.issues[0]?.message ?? 'unavailable', fd);
  const supabase = await getSupabase();
  if (!supabase) return retry('signUpUnavailable', fd);
  const { data, error } = await supabase.auth.signUp({
    email: p.data.email, password: p.data.password,
    options: { emailRedirectTo: `${await appOrigin()}/auth/confirm`, data: { first_name: p.data.first_name, last_name: p.data.last_name } },
  });
  if (error && error.code !== 'user_already_exists' && error.code !== 'email_exists') return retry(authFailure(error, 'email sign-up refused'), fd);
  if (data?.session) await supabase.auth.signOut(); // projects without email confirmation: still pending, no session
  return { status: 'sent' };
}

/** Step 1 of the phone form: send the code. Sign-up creates the account (pending); sign-in only works for existing ones. */
export async function sendPhoneCode(_: SignUpState, fd: FormData): Promise<SignUpState> {
  const mode: Mode = fd.get('mode') === 'signup' ? 'signup' : 'signin';
  let phone: string, data: Record<string, string> | undefined;
  if (mode === 'signup') {
    const r = robot(fd);
    if (r === 'silent') return { status: 'code', phone: String(fd.get('phone') ?? '').slice(0, 20), mode };
    if (r !== 'pass') return retry(r, fd);
    const p = phoneSignUpSchema.safeParse(fields(fd));
    if (!p.success) return retry(p.error.issues[0]?.message ?? 'invalidPhone', fd);
    phone = p.data.phone; data = { first_name: p.data.first_name, last_name: p.data.last_name };
  } else {
    const p = signInPhone.safeParse(fd.get('phone') ?? '');
    if (!p.success) return { status: 'error', error: 'invalidPhone', values: keep(fd) };
    phone = p.data;
  }
  const supabase = await getSupabase();
  if (!supabase) return { status: 'error', error: 'unavailable', values: keep(fd) };
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: mode === 'signup', data } });
  // Unknown number on sign-in: answer as if a code was sent, so the form does not tell who has an account.
  if (error && !(mode === 'signin' && (error.code === 'otp_disabled' || error.code === 'signup_disabled' || error.status === 422))) {
    const key = authFailure(error, 'send code refused');
    return mode === 'signup' ? retry(key, fd) : { status: 'error', error: key, values: keep(fd) };
  }
  return { status: 'code', phone, mode };
}

/** Step 2: check the code. Active members go to their home page; new accounts are told they wait for approval. */
export async function verifyPhoneCode(prev: SignUpState, fd: FormData): Promise<SignUpState> {
  const mode: Mode = fd.get('mode') === 'signup' ? 'signup' : 'signin';
  const phone = signInPhone.safeParse(fd.get('phone') ?? '');
  const code = smsCode.safeParse(fd.get('code') ?? '');
  if (!phone.success) return { status: 'error', error: 'invalidPhone' };
  if (!code.success) return { status: 'code', phone: phone.data, mode, error: 'codeInvalid' };
  const supabase = await getSupabase();
  if (!supabase) return { status: 'code', phone: phone.data, mode, error: 'unavailable' };
  const { error } = await supabase.auth.verifyOtp({ phone: phone.data, token: code.data, type: 'sms' });
  if (error) {
    if (isFeeBlock(error)) return { status: 'blocked' };
    if (error.status === 429 || error.code?.startsWith('over_')) return { status: 'code', phone: phone.data, mode, error: 'tooManyAttempts' };
    return { status: 'code', phone: phone.data, mode, error: 'codeInvalid' };
  }
  const member = await getMember();
  if (!member || member.status !== 'active') {
    await supabase.auth.signOut();
    if (member?.status === 'suspended') return { status: 'error', error: 'suspended' };
    return { status: 'done', message: mode === 'signup' ? 'accountCreated' : 'pending' };
  }
  if (isLocale(member.locale)) (await cookies()).set(LOCALE_COOKIE, member.locale, LOCALE_COOKIE_OPTIONS);
  redirect(safeNext(fd.get('next')) ?? homeFor(member.role));
}

/** "New pictures" on the robot check: a fresh signed challenge (no form data, nothing stored). */
export async function freshRobotChallenge(): Promise<Challenge | null> {
  return newChallenge();
}
