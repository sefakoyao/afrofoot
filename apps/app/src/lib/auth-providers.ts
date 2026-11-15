import 'server-only';
import { supabaseEnv } from '@/lib/env';

/** Sign-in providers the app offers besides email and password. Each needs its keys in Supabase (docs/RUNNING.md §3h). */
export const SOCIAL_PROVIDERS = ['google', 'facebook'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export const isSocialProvider = (v: unknown): v is SocialProvider => (SOCIAL_PROVIDERS as readonly unknown[]).includes(v);

/**
 * The providers switched on in Supabase (Authentication → Sign In / Providers), read from Supabase Auth's public
 * settings and cached for 5 minutes. A button only shows once its provider is set up, so nobody meets a broken button.
 */
export async function enabledProviders(): Promise<SocialProvider[]> {
  const env = supabaseEnv();
  if (!env) return [];
  try {
    const r = await fetch(`${env.url}/auth/v1/settings`, { headers: { apikey: env.anonKey }, next: { revalidate: 300 } });
    if (!r.ok) return [];
    const s = (await r.json()) as { external?: Record<string, boolean> };
    return SOCIAL_PROVIDERS.filter((p) => s.external?.[p] === true);
  } catch {
    return [];
  }
}
