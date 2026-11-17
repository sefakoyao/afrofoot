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

/**
 * Safe facts about a key for error messages, never the key itself: its form, the role and project named inside a legacy
 * JWT key (both are public: the project id is in the Supabase URL), its length, and whether it has spaces or line
 * breaks around it, compared with the project of the Supabase URL.
 */
export function keyFacts(key: string, supabaseUrl: string): string {
  const urlRef = (() => { try { return new URL(supabaseUrl).hostname.split('.')[0] ?? '?'; } catch { return '?'; } })();
  const facts: string[] = [`${key.length} characters`];
  if (key !== key.trim()) facts.push('has spaces or line breaks around it');
  if (/^["']|["']$/.test(key.trim())) facts.push('is wrapped in quotes');
  const k = key.trim().replace(/^["']|["']$/g, '');
  if (k.startsWith('sb_secret_')) facts.push('a new-style secret key');
  else if (k.startsWith('sb_publishable_')) facts.push('a publishable (public) key');
  else {
    const parts = k.split('.');
    if (parts.length !== 3) facts.push('not a Supabase API key (no JWT form: is it the JWT Secret?)');
    else {
      try {
        const p = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8')) as { role?: string; ref?: string };
        facts.push(`role ${p.role ?? '?'}`);
        facts.push(p.ref ? (p.ref === urlRef ? `same project as the URL (${urlRef})` : `project ${p.ref}, but the URL is project ${urlRef}`) : 'no project in the key');
      } catch { facts.push('unreadable JWT'); }
    }
  }
  return facts.join(', ');
}
