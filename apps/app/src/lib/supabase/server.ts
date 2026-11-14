import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { supabaseEnv } from '../env';

type CookieList = { name: string; value: string; options: CookieOptions }[];

/**
 * Supabase client acting as the signed-in user (anon key + session cookies), so RLS applies to every query.
 * Server components cannot write cookies; the middleware refreshes the session for them. Server actions and route handlers can.
 */
export async function getSupabase(): Promise<SupabaseClient | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const store = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: CookieList) => {
        try { for (const { name, value, options } of list) store.set(name, value, options); }
        catch { /* called from a server component: the middleware already refreshed the cookies */ }
      },
    },
  });
}
