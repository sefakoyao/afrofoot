/** Supabase connection for the member app. Returns null when the environment variables are not set (build or preview without a database). */
export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/** Public website, used for the Membership page link shown to fee-blocked players. */
export const webUrl = (): string => (process.env.NEXT_PUBLIC_WEB_URL || 'https://www.afrofoot.club').replace(/\/+$/, '');
