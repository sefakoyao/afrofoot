import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseEnv } from '@/lib/env';

/**
 * A database client with the service role, for the scheduled content job only (app/api/content/scan, protected by
 * CRON_SECRET). It bypasses Row Level Security, so nothing else may use it. Null when SUPABASE_SERVICE_ROLE_KEY is not set.
 */
export function serviceClient(): SupabaseClient | null {
  const env = supabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!env || !key) return null;
  return createClient(env.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
