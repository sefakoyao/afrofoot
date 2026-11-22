'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { canEnter } from '@afrofoot/db';
import { z } from 'zod';
import { getMember } from '@/lib/auth';
import { publishOne } from '@/lib/social/publish';
import { getSupabase } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';

/**
 * Admin → Website → Social media (migration 0071): switch automatic posting on or off per platform, and per post:
 * Post now, Retry (a failed post waits again), Cancel. The database decides who may (admins; RLS and app.guard_social_post).
 */
const PAGE = '/admin/content/social';
const uuid = z.string().uuid();
function go(result: string): never { redirect(`${PAGE}?result=${result}`); }

async function admin() {
  const member = await getMember();
  const supabase = await getSupabase();
  if (!member || member.status !== 'active' || !supabase || !canEnter(member.role, 'admin')) go('s_notAllowed');
  return supabase!;
}
function done(result: string): never { revalidatePath('/admin', 'layout'); go(result); }

export async function saveSocialSettings(fd: FormData): Promise<void> {
  const supabase = await admin();
  const value = { facebook: fd.get('facebook') === 'on', instagram: fd.get('instagram') === 'on' };
  const { error } = await supabase.from('site_settings').upsert({ key: 'social_posting', value, is_public: false });
  if (error) { console.error('[social] settings refused', { code: error.code, message: error.message }); go('s_error'); }
  done('s_settingsSaved');
}

export async function postNow(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) go('s_invalid');
  const supabase = await admin();
  // the person must see the post (RLS) and it must be a Facebook or Instagram post that is not sent yet
  const { data } = await supabase.from('social_posts').select('platform, status').eq('id', id.data!).maybeSingle();
  if (!data || !['facebook', 'instagram'].includes(data.platform) || !['waiting', 'scheduled', 'failed'].includes(data.status)) go('s_invalid');
  const db = serviceClient();
  if (!db) go('s_noService');
  const r = await publishOne(db!, id.data!);
  done(r === 'posted' ? 's_posted' : r === 'failed' ? 's_failed' : 's_busy');
}

export async function retryPost(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) go('s_invalid');
  const supabase = await admin();
  const { data, error } = await supabase.from('social_posts').update({ status: 'waiting', post_at: new Date().toISOString() }).eq('id', id.data!).eq('status', 'failed').select('id');
  if (error || !data?.length) go('s_invalid');
  done('s_retrying');
}

export async function cancelPost(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) go('s_invalid');
  const supabase = await admin();
  const { data, error } = await supabase.from('social_posts').update({ status: 'cancelled' }).eq('id', id.data!).in('status', ['waiting', 'scheduled', 'failed']).select('id');
  if (error || !data?.length) go('s_invalid');
  done('s_cancelled');
}
