import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The club's Code of Conduct (migration 0028): the current version and who agreed to it. Read as the signed-in user (RLS). */
export interface ConductVersion { id: string; version: string; title: string; label: string | null; pdfPath: string | null; body: string }

export async function currentConduct(db: SupabaseClient): Promise<ConductVersion | null> {
  const { data } = await db.from('conduct_versions').select('id, version, title, published_label, pdf_path, body').eq('is_current', true).maybeSingle();
  return data ? { id: data.id, version: data.version, title: data.title, label: data.published_label, pdfPath: data.pdf_path, body: data.body } : null;
}

/** The member's own status: the current version and when they agreed to it (null = not yet). */
export async function loadConductStatus(db: SupabaseClient, profileId: string): Promise<{ version: ConductVersion | null; agreedAt: string | null }> {
  const version = await currentConduct(db);
  if (!version) return { version: null, agreedAt: null };
  const { data } = await db.from('conduct_consents').select('consented_at').eq('version_id', version.id).eq('profile_id', profileId).maybeSingle();
  return { version, agreedAt: data?.consented_at ?? null };
}

/**
 * Of the given profiles, those that have NOT agreed to the current version. Admins can read every consent; coaches only those of
 * their own team's players (RLS), so call it with the profiles the caller is allowed to see. Empty when no version is published.
 */
export async function missingConsent(db: SupabaseClient, profileIds: string[]): Promise<Set<string>> {
  if (!profileIds.length) return new Set();
  const version = await currentConduct(db);
  if (!version) return new Set();
  const { data } = await db.from('conduct_consents').select('profile_id').eq('version_id', version.id).in('profile_id', profileIds);
  const agreed = new Set((data ?? []).map((r) => r.profile_id));
  return new Set(profileIds.filter((id) => !agreed.has(id)));
}
