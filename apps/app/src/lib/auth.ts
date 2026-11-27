import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { HOME_BY_ROLE, canEnter, isAdminRole, isRole, type Area, type Role } from '@afrofoot/db';
import { getSupabase } from './supabase/server';

export interface Member {
  id: string; email: string; firstName: string; lastName: string; role: Role; status: 'pending' | 'active' | 'suspended'; locale: string; phone: string | null;
  /** The session's assurance level: "aal2" once the sign-in was confirmed with the authenticator code (migration 0075). */
  aal: 'aal1' | 'aal2';
}

/**
 * The signed-in user's profile, read through RLS (profiles_self_read). Role comes from the database, never from the token or user metadata.
 * Cached per request so layouts and pages share one lookup.
 */
export const getMember = cache(async (): Promise<Member | null> => {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('id, email, first_name, last_name, role, status, locale, phone').eq('id', user.id).maybeSingle();
  if (error || !data || !isRole(data.role)) {
    // Signed in with Supabase Auth but the profile cannot be read: log why (no personal data beyond the user id).
    console.error('[auth] profile not readable', { userId: user.id, code: error?.code, message: error?.message, hint: error?.hint, found: !!data });
    return null;
  }
  // the second step (admins only need it; read from the session's token, no extra request)
  const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { id: data.id, email: data.email ?? '', firstName: data.first_name, lastName: data.last_name, role: data.role, status: data.status, locale: data.locale, phone: data.phone ?? null,
    aal: level?.currentLevel === 'aal2' ? 'aal2' : 'aal1' };
});

/**
 * An admin whose sign-in was confirmed with the authenticator code (migration 0075). Code that checks the role itself
 * (rather than leaving it to the database) uses this, so an admin signed in with the password alone gets no admin rights.
 */
export const isVerifiedAdmin = (m: Pick<Member, 'role' | 'aal'>): boolean => isAdminRole(m.role) && m.aal === 'aal2';

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
  // admins confirm the sign-in with their authenticator app first (set it up the first time)
  if (area === 'admin' && m.aal !== 'aal2') redirect(`/mfa?next=/${area}`);
  return m;
}
