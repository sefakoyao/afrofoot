import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseEnv } from '../env';
import { IDLE_COOKIE, idleCookieOptions, idleMinutes } from '../idle';

type CookieList = { name: string; value: string; options: CookieOptions }[];

/**
 * Refreshes the Supabase session on every request and returns the verified user (getUser checks the token with Supabase Auth).
 * `blocked` is true when the token refresh was refused by the fee-block hook (migration 0022).
 * `idle` is true when the session was signed out here because nothing happened for longer than the limit (lib/idle.ts).
 */
export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; user: User | null; blocked: boolean; idle: boolean }> {
  let response = NextResponse.next({ request });
  const env = supabaseEnv();
  if (!env) return { response, user: null, blocked: false, idle: false };
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
  const user = data.user;
  if (!user) return { response, user: null, blocked: isFeeBlock(error), idle: false };

  // inactivity: the last activity the browser reported; a sign-in newer than it starts the clock again
  const now = Date.now();
  const last = Number(request.cookies.get(IDLE_COOKIE)?.value) || 0;
  const signedIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0;
  const secure = request.nextUrl.protocol === 'https:';
  if (!last || last < signedIn) {
    response.cookies.set(IDLE_COOKIE, String(now), idleCookieOptions(secure)); // first request of a session (or after this release)
  } else if (now - last > idleMinutes() * 60_000) {
    await supabase.auth.signOut({ scope: 'local' }); // clears the session cookies through setAll above
    response.cookies.set(IDLE_COOKIE, '', { ...idleCookieOptions(secure), maxAge: 0 });
    return { response, user: null, blocked: false, idle: true };
  }
  return { response, user, blocked: false, idle: false };
}

/** The custom access token hook answers with this message when a player's fees are overdue. */
export const isFeeBlock = (e: { message?: string } | null | undefined): boolean => !!e?.message?.includes('membership_fees_overdue');
