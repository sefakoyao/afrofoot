import { NextResponse, type NextRequest } from 'next/server';
import { IDLE_COOKIE, idleCookieOptions } from '@/lib/idle';
import { getSupabase } from '@/lib/supabase/server';

/**
 * The browser reports that the person is using the app (at most once a minute, components/IdleGuard). The middleware
 * has already checked the session, including the inactivity limit; this only moves the "last activity" time on.
 */
export async function POST(request: NextRequest) {
  const supabase = await getSupabase();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!data.user) return new NextResponse(null, { status: 401 });
  const res = new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(IDLE_COOKIE, String(Date.now()), idleCookieOptions(request.nextUrl.protocol === 'https:'));
  return res;
}
