import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseEnv } from '../env';

/**
 * A Supabase client without a session, cookies or PKCE, only for asking Supabase Auth to send emails (password reset,
 * confirmation). Its links carry no code tied to the sender's browser, so they open on the member's phone too:
 * with the recommended email template through /auth/confirm (token_hash), with the default template through /auth/hash.
 * It never touches the session of whoever triggered it (e.g. an admin sending a link for a member).
 */
export function mailer(): SupabaseClient | null {
  const env = supabaseEnv();
  return env ? createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'implicit' } }) : null;
}
