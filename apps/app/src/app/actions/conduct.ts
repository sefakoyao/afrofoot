'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth';
import { currentConduct } from '@/lib/conduct';
import { getSupabase } from '@/lib/supabase/server';

/**
 * The player agrees to the current Code of Conduct. Requires the "I have read and agree" box and the version they read
 * (so a version published meanwhile is not agreed to unseen). The database only accepts the member's own consent to the
 * current version (RLS, migration 0028); agreeing twice is harmless.
 */
export async function agreeToConduct(fd: FormData): Promise<void> {
  const member = await requireArea('me');
  if (fd.get('agree') !== 'on') redirect('/me/conduct?result=r_tick');
  const supabase = await getSupabase();
  if (!supabase) redirect('/me/conduct?result=r_error');
  const version = await currentConduct(supabase);
  if (!version || fd.get('version_id') !== version.id) redirect('/me/conduct?result=r_changed');
  const { error } = await supabase.from('conduct_consents').insert({ version_id: version.id, profile_id: member.id });
  if (error && error.code !== '23505') {
    console.error('[conduct] consent refused', { code: error.code, message: error.message });
    redirect('/me/conduct?result=r_error');
  }
  revalidatePath('/me', 'layout');
  revalidatePath('/admin', 'layout');
  revalidatePath('/coach', 'layout');
  redirect('/me/membership?result=r_agreed#conduct');
}
