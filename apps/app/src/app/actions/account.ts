'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireMember } from '@/lib/auth';
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS } from '@/lib/locale';
import { profileSchema } from '@/lib/schemas';
import { getSupabase } from '@/lib/supabase/server';

export type ProfileState = { status: 'idle' } | { status: 'ok' } | { status: 'error'; error: string };

/**
 * Save the signed-in member's own name, phone and language. RLS (profiles_self_update) limits the row to their own;
 * the guard_profiles trigger stops any change to role, status or email. Error values are keys under `account.*`.
 */
export async function updateProfile(_: ProfileState, fd: FormData): Promise<ProfileState> {
  const member = await requireMember('/account');
  const p = profileSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { status: 'error', error: p.error.issues[0]?.message ?? 'e_failed' };
  const supabase = await getSupabase();
  if (!supabase) return { status: 'error', error: 'e_failed' };
  const { error } = await supabase.from('profiles').update(p.data).eq('id', member.id);
  if (error) {
    console.error('[account] profile update refused', { code: error.code, message: error.message });
    return { status: 'error', error: error.code === '23514' ? 'e_phone' : 'e_failed' };
  }
  (await cookies()).set(LOCALE_COOKIE, p.data.locale, LOCALE_COOKIE_OPTIONS);
  revalidatePath('/', 'layout');
  return { status: 'ok' };
}
