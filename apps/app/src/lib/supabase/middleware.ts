import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseEnv } from '../env';

type CookieList = { name: string; value: string; options: CookieOptions }[];

/**
 * Refreshes the Supabase session on every request and returns the verified user (getUser checks the token with Supabase Auth).
 * `blocked` is true when the token refresh was refused by the fee-block hook (migration 0022).
 */
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; user: User | null; blocked: boolean }> {
  let response = NextResponse.next({ request });
  const env = supabaseEnv();
  if (!env) return { response, user: null, blocked: false };
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: CookieList) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data, error } = await supabase.auth.getUser();
  return { response, user: data.user, blocked: isFeeBlock(error) };
}

/** The custom access token hook answers with this message when a player's fees are overdue. */
export const isFeeBlock = (e: { message?: string } | null | undefined): boolean => !!e?.message?.includes('membership_fees_overdue');
