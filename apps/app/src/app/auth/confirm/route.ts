import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/server';
import { isFeeBlock } from '@/lib/supabase/middleware';
import { logSignin } from '@/lib/signin-log';

const OTP_TYPES: readonly EmailOtpType[] = ['recovery', 'signup', 'invite', 'magiclink', 'email_change', 'email'];
const NEXT_ALLOWED = ['/reset-password', '/'] as const;

/**
 * Landing route for links in Supabase Auth emails. Accepts both forms:
 *  - `?token_hash=…&type=recovery` (email template pointing here; works on any device), and
 *  - `?code=…` (default template, PKCE; works in the browser that asked for the link), and
 *  - neither (default template, link sent without PKCE: session in the #fragment) → /auth/hash.
 * A recovery link opens /reset-password with a short session; anything else goes to the app home.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const type = q.get('type') as EmailOtpType | null;
  const wanted = q.get('next');
  const next = (NEXT_ALLOWED as readonly string[]).includes(wanted ?? '') ? wanted! : type === 'recovery' ? '/reset-password' : '/';
  const to = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));

  const supabase = await getSupabase();
  if (!supabase) return to('/login?reason=unavailable');

  const tokenHash = q.get('token_hash');
  const code = q.get('code');
  // Default email template + a link sent without PKCE: the session comes in the URL fragment, which only the browser
  // sees. The redirect keeps the fragment, and /auth/hash hands the session to the server.
  if (!tokenHash && !code && !q.get('error') && !q.get('error_description')) return to(`/auth/hash?next=${encodeURIComponent(next)}`);
  const { error } = tokenHash && type && OTP_TYPES.includes(type)
    ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    : code ? await supabase.auth.exchangeCodeForSession(code) : { error: { message: 'missing token' } };

  if (!error) { await logSignin(supabase, null, 'link', 'ok'); return to(next); }
  if (isFeeBlock(error)) return to('/login?reason=blocked');
  return to(next === '/reset-password' ? '/reset-password?error=link' : '/login?reason=link');
}
