import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Sign-in log (migration 0051): what admins see in Admin → Sign-in help. Passwords are never passed here. */
export type SigninMethod = 'password' | 'google' | 'facebook' | 'link' | 'reset';
export type SigninOutcome = 'ok' | 'wrong_password' | 'not_confirmed' | 'pending' | 'suspended' | 'fee_blocked' | 'rate_limited' | 'error'
  | 'reset_sent' | 'reset_failed' | 'reset_rate_limited';

/**
 * Best effort: a failure to log never stops a sign-in. `ok` needs the signed-in client (it is logged for that account
 * only); the other outcomes need the email that was typed and work without a session.
 */
export async function logSignin(db: SupabaseClient | null, email: string | null, method: SigninMethod, outcome: SigninOutcome, detail?: string | null): Promise<void> {
  if (!db) return;
  try {
    const { error } = await db.rpc('log_signin', { p_email: email ?? '', p_method: method, p_outcome: outcome, p_detail: detail ?? null });
    if (error) console.error('[signin-log] not written', { outcome, code: error.code });
  } catch (e) {
    console.error('[signin-log] not written', { outcome, error: e instanceof Error ? e.message : 'unknown' });
  }
}

/** A short, non-secret description of an Auth error for the log (status and code only). */
export const errorDetail = (e: { status?: number; code?: string } | null | undefined) => (e ? [e.status, e.code].filter(Boolean).join(' ') || 'unknown' : null);
