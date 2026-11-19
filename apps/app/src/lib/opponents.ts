import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The club's opponents to pick from when booking a game (migration 0061; coaches and admins can read them), A–Z. */
export async function loadOpponents(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from('opponents').select('name').eq('active', true);
  return ((data ?? []) as { name: string }[]).map((o) => o.name).sort((a, b) => a.localeCompare(b, 'fi', { sensitivity: 'base', numeric: true }));
}
