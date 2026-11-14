/**
 * Reads a variable at RUNTIME. A computed key stops Next.js from inlining the value at build time
 * (it only replaces literal `process.env.NEXT_PUBLIC_X`), so settings added on Vercel work even when the
 * build did not see them. Supabase is only used on the server and in middleware, never in the browser.
 */
const read = (name: string): string | undefined => {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
};
const first = (...names: string[]) => names.map(read).find(Boolean);

const URL_NAMES = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'];
const KEY_NAMES = ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY'];

/** Supabase connection for the member app. Returns null when the variables are not set (build or preview without a database). */
export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = first(...URL_NAMES)?.replace(/\/+$/, '');
  const anonKey = first(...KEY_NAMES);
  return url && anonKey ? { url, anonKey } : null;
}

/** For logs only: which settings are missing, and in which Vercel environment. Never includes values. */
export const supabaseEnvReport = () => ({
  url: first(...URL_NAMES) ? 'set' : `missing (${URL_NAMES[0]})`,
  key: first(...KEY_NAMES) ? 'set' : `missing (${KEY_NAMES[0]})`,
  vercelEnv: read('VERCEL_ENV') ?? 'local',
});

/**
 * For error logs only: which Supabase project and which kind of key the app uses. The publishable/anon key is
 * public by design, so its first characters are safe to log; a secret key is never expected here and is not shown.
 */
export function supabaseTarget(): Record<string, string> {
  const env = supabaseEnv();
  if (!env) return { configured: 'no' };
  const k = env.anonKey;
  const kind = k.startsWith('sb_publishable_') ? 'publishable' : k.startsWith('sb_secret_') ? 'SECRET (wrong key type)' : k.split('.').length === 3 ? 'legacy JWT' : 'unknown format';
  let project = env.url;
  try { project = new URL(env.url).host; } catch { project = `invalid URL (${env.url.slice(0, 40)})`; }
  return { project, keyKind: kind, keyStart: kind.startsWith('SECRET') ? '(hidden)' : `${k.slice(0, 20)}…`, keyLength: String(k.length) };
}

/** Public website, used for the Membership page link shown to fee-blocked players. */
export const webUrl = (): string => (read('NEXT_PUBLIC_WEB_URL') || 'https://www.afrofoot.club').replace(/\/+$/, '');
