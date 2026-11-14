import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { HOME_BY_ROLE, canEnter, isRole, type Area, type Role } from '@afrofoot/db';
import { getSupabase } from './supabase/server';

export interface Member { id: string; email: string; firstName: string; lastName: string; role: Role; status: 'pending' | 'active' | 'suspended'; locale: string }

/**
 * The signed-in user's profile, read through RLS (profiles_self_read). Role comes from the database, never from the token or user metadata.
 * Cached per request so layouts and pages share one lookup.
 */
export const getMember = cache(async (): Promise<Member | null> => {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('id, email, first_name, last_name, role, status, locale').eq('id', user.id).maybeSingle();
  if (!data || !isRole(data.role)) return null;
  return { id: data.id, email: data.email, firstName: data.first_name, lastName: data.last_name, role: data.role, status: data.status, locale: data.locale };
});

export const homeFor = (role: Role): string => HOME_BY_ROLE[role];

/** Signed in with an active account, or off to /login (with the reason when the account is pending or suspended). */
export async function requireMember(next?: string): Promise<Member> {
  const m = await getMember();
  if (!m) redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  if (m.status !== 'active') redirect(`/login?reason=${m.status}`);
  return m;
}

/** Guard for an area layout: other roles are sent to their own home page. The database still enforces every read and write (RLS). */
export async function requireArea(area: Area): Promise<Member> {
  const m = await requireMember(`/${area}`);
  if (!canEnter(m.role, area)) redirect(homeFor(m.role));
  return m;
}
