import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Anonymous (public) Supabase client for the public site. Server-side only.
 * Row Level Security decides what it may do: insert into the public request tables, read published content.
 * Returns null when the environment variables are not set (local preview without a database).
 */
export function getPublicClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
