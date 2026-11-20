'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/** Matchday poster: upload a background photo to the club's public images (public-media/posters/, admins only by RLS). */
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const back = (fd: FormData, result: string, bg?: string) => {
  const u = new URLSearchParams({ ...(/^[0-9a-f-]{36}$/.test(String(fd.get('match') ?? '')) ? { match: String(fd.get('match')) } : {}), format: String(fd.get('format') ?? 'portrait').slice(0, 10), ...(bg ? { bg } : {}), result });
  redirect(`/admin/content/poster?${u}`);
};

export async function uploadPosterPhoto(fd: FormData): Promise<void> {
  await requireArea('admin');
  const file = fd.get('photo');
  if (!(file instanceof File) || file.size === 0) back(fd, 'p_noFile');
  const f = file as File;
  if (!TYPES[f.type]) back(fd, 'p_type');
  if (f.size > 8 * 1024 * 1024) back(fd, 'p_size');
  const supabase = await getSupabase();
  if (!supabase) back(fd, 'p_error');
  const path = `posters/${randomUUID()}.${TYPES[f.type]}`;
  const { error } = await supabase!.storage.from('public-media').upload(path, f, { contentType: f.type, upsert: false });
  if (error) { console.error('[poster] upload refused', { message: error.message }); back(fd, 'p_error'); }
  back(fd, 'p_uploaded', `media:${path}`);
}

export async function removePosterPhoto(fd: FormData): Promise<void> {
  await requireArea('admin');
  const path = String(fd.get('path') ?? '');
  if (!/^posters\/[\w-]+\.(jpg|png|webp)$/.test(path)) back(fd, 'p_error');
  const supabase = await getSupabase();
  const { error } = await supabase!.storage.from('public-media').remove([path]);
  if (error) back(fd, 'p_error');
  back(fd, 'p_removed', 'team');
}
