/** Pages reachable without a session. Everything else needs a signed-in user (middleware) and the right role (area layouts). */
export const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/auth/confirm'] as const;
export const isPublicPath = (p: string): boolean => PUBLIC_PATHS.some((x) => p === x || p.startsWith(`${x}/`));

/** Only same-site absolute paths, never "//host" or "/\host", so ?next= cannot redirect off the site. */
export function safeNext(v: unknown): string | null {
  if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\') || v.length > 300) return null;
  return isPublicPath(v.split('?')[0] ?? v) ? null : v;
}
