import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isPublicPath } from '@/lib/paths';

/**
 * Keeps the Supabase session fresh and sends signed-out visitors to /login. Roles are checked in the area layouts
 * (they need the profile from the database); RLS is the final authority on data.
 */
export async function middleware(request: NextRequest) {
  const { response, user, blocked } = await updateSession(request);
  const { pathname, search } = request.nextUrl;
  if (user || isPublicPath(pathname)) return response;

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  if (blocked) url.searchParams.set('reason', 'blocked');
  else if (pathname !== '/') url.searchParams.set('next', pathname + search);
  const redirect = NextResponse.redirect(url);
  for (const c of response.cookies.getAll()) redirect.cookies.set(c); // keep cookie changes from the refresh (e.g. a cleared session)
  return redirect;
}

export const config = {
  // Everything except Next internals and files with an extension (images, fonts).
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
};
