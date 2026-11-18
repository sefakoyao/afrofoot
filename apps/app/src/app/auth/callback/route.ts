import { NextResponse, type NextRequest } from 'next/server';
import { isLocale } from '@afrofoot/i18n';
import { getMember, homeFor } from '@/lib/auth';
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS } from '@/lib/locale';
import { safeNext } from '@/lib/paths';
import { getSupabase } from '@/lib/supabase/server';
import { mailer } from '@/lib/supabase/mailer';
import { isFeeBlock } from '@/lib/supabase/middleware';
import { logSignin } from '@/lib/signin-log';

/**
 * Return address after "Continue with Google / Facebook" (and any other PKCE sign-in): exchanges the one-time code for
 * a session, then applies the same rules as the password sign-in. New accounts are pending players until an admin
 * approves them; suspended accounts and players blocked for overdue fees (migration 0022) are signed out again.
 * An existing account with the same verified email is the same member (Supabase links the identities).
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const to = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));
  const oauthError = q.get('error');
  if (oauthError) {
    const text = `${q.get('error_description') ?? ''}`.toLowerCase();
    if (oauthError === 'access_denied' && !text.includes('membership_fees_overdue')) return to('/login?reason=oauthCancelled');
    if (text.includes('email')) return to('/login?reason=oauthNoEmail');
    if (text.includes('membership_fees_overdue')) return to('/login?reason=blocked');
    console.error('[auth] provider returned an error', { error: oauthError, description: q.get('error_description')?.slice(0, 200) });
    return to('/login?reason=oauthFailed');
  }
  const code = q.get('code');
  if (!code) return to('/login?reason=oauthFailed');

  const supabase = await getSupabase();
  if (!supabase) return to('/login?reason=unavailable');
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    if (isFeeBlock(error)) return to('/login?reason=blocked');
    console.error('[auth] code exchange failed', { status: error.status, code: error.code });
    return to('/login?reason=oauthFailed');
  }

  const member = await getMember();
  const { data: { user } } = await supabase.auth.getUser();
  const provider = user?.app_metadata?.provider === 'facebook' ? 'facebook' : 'google';
  if (!member) { await supabase.auth.signOut(); return to('/login?reason=unavailable'); }
  if (member.status !== 'active') {
    await supabase.auth.signOut();
    await logSignin(mailer(), user?.email ?? null, provider, member.status === 'suspended' ? 'suspended' : 'pending');
    return to(`/login?reason=${member.status === 'suspended' ? 'suspended' : 'pending'}`);
  }
  await logSignin(supabase, null, provider, 'ok');
  const res = to(safeNext(q.get('next')) ?? homeFor(member.role));
  if (isLocale(member.locale)) res.cookies.set(LOCALE_COOKIE, member.locale, LOCALE_COOKIE_OPTIONS);
  return res;
}
