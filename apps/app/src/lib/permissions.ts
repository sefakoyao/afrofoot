import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isCoachRole } from '@afrofoot/db';
import { getMember, type Member, isVerifiedAdmin } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Coach permissions (migration 0070): rights an administrator ticks per coach on Admin → People → Coach permissions.
 * The database decides (RLS, app.coach_may); these helpers only decide what to show and where to send the coach back.
 */
export const PERMISSIONS = ['contracts', 'fees', 'opponents', 'posters'] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** The rights of one coach (their own, or any coach's for an admin). Empty when the table is not installed. */
export async function permissionsOf(db: SupabaseClient, profileId: string): Promise<Set<Permission>> {
  const { data } = await db.from('coach_permissions').select('permission').eq('profile_id', profileId);
  return new Set(((data ?? []) as { permission: Permission }[]).map((r) => r.permission));
}

/**
 * For actions shared by admins and coaches with a right: the signed-in member, the database client and which area to
 * return to; null when the member is neither an admin nor a coach holding the right.
 */
export async function staffWith(permission: Permission): Promise<{ member: Member; supabase: SupabaseClient; area: 'admin' | 'coach' } | null> {
  const [member, supabase] = await Promise.all([getMember(), getSupabase()]);
  if (!member || member.status !== 'active' || !supabase) return null;
  if (isVerifiedAdmin(member)) return { member, supabase, area: 'admin' };
  if (isCoachRole(member.role) && (await permissionsOf(supabase, member.id)).has(permission)) return { member, supabase, area: 'coach' };
  return null;
}
