/**
 * Sign-out after inactivity. The limit is NEXT_PUBLIC_SESSION_IDLE_MINUTES (5–720, default 60), the same in the
 * browser (warning and sign-out) and on the server (middleware). Activity = the person tapping, typing or scrolling;
 * background refreshes do not count. The browser tells the server at most once a minute (POST /api/alive), which
 * stores the time in an httpOnly cookie; the middleware signs out a session whose last activity is older than the limit.
 */
export const IDLE_COOKIE = 'af_active';
export const WARN_BEFORE_MS = 2 * 60 * 1000;
export function idleMinutes(): number {
  const n = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES);
  return Number.isFinite(n) && n >= 5 && n <= 720 ? Math.round(n) : 60;
}
export const idleCookieOptions = (secure: boolean) => ({ httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: 7 * 24 * 3600 });
