/**
 * Which kind of Supabase key this is, without verifying it: legacy keys are JWTs whose payload names the role
 * ("anon" or "service_role"); new keys start with sb_publishable_ or sb_secret_. Only a service key can read the settings.
 */
export function keyKind(key: string): 'service' | 'public' | 'unknown' {
  if (key.startsWith('sb_secret_')) return 'service';
  if (key.startsWith('sb_publishable_')) return 'public';
  const part = key.split('.')[1];
  if (!part) return 'unknown';
  try {
    const role = (JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { role?: string }).role;
    return role === 'service_role' ? 'service' : role === 'anon' ? 'public' : 'unknown';
  } catch { return 'unknown'; }
}
