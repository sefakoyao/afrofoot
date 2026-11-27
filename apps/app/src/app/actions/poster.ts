'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { staffWith } from '@/lib/permissions';
import { UPLOAD_KINDS, UPLOAD_PATH, type UploadKind } from '@/lib/poster';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Matchday poster: upload an image to the club's public images (public-media/posters/<kind>/; admins, and coaches with
 * the "posters" right, 0070, by RLS):
 * a background photo, a sponsor logo ("Presented by") or a featured player photo. JPG or PNG (the poster renderer reads both).
 */
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };
// keep the poster's other choices (passed along as "keep", a query string) and set the new image where it belongs
const PARAM: Record<UploadKind, string> = { bg: 'bg', sponsor: 'sponsor', player: 'photo' };
const ANNOUNCE_KEEP = ['kind', 'format', 'date', 'start', 'end', 'place', 'address', 'who', 'bring', 'signup', 'msg', 'bg', 'tone', 'fx', 'strength', 'shade', 'ball'];
const back = (fd: FormData, result: string, set?: [string, string], area: 'admin' | 'coach' = fd.get('area') === 'coach' ? 'coach' : 'admin') => {
  const keep = new URLSearchParams(String(fd.get('keep') ?? '').slice(0, 1500));
  if (fd.get('page') === 'announce') {   // the tryout poster (Player announcement): its typed lines may contain spaces
    const u = new URLSearchParams();
    for (const k of ANNOUNCE_KEEP) { const v = keep.get(k); if (v && v.length <= 160 && !/[\u0000-\u001f]/.test(v)) u.set(k, v); }
    if (set) u.set('bg', set[1]);
    u.set('result', result);
    redirect(`/admin/content/announce?${u}#tryout-photo`);
  }
  const u = new URLSearchParams();
  for (const k of ['match', 'layout', 'format', 'bg', 'title', 'sponsor', 'photo', 'fx', 'strength', 'shade']) { const v = keep.get(k); if (v && /^[\w:./-]{1,120}$/.test(v)) u.set(k, v); }
  if (set) u.set(set[0], set[1]);
  u.set('result', result);
  redirect(`${area === 'coach' ? '/coach/poster' : '/admin/content/poster'}?${u}`);
};

export async function uploadPosterPhoto(fd: FormData): Promise<void> {
  const who = await staffWith('posters');
  if (!who) back(fd, 'p_error');
  const file = fd.get('photo');
  if (!(file instanceof File) || file.size === 0) back(fd, 'p_noFile');
  const f = file as File;
  if (!TYPES[f.type]) back(fd, 'p_type');
  if (f.size > 8 * 1024 * 1024) back(fd, 'p_size');
  const supabase = await getSupabase();
  if (!supabase) back(fd, 'p_error');
  const kind = (UPLOAD_KINDS as readonly string[]).includes(String(fd.get('kind'))) ? (String(fd.get('kind')) as UploadKind) : 'bg';
  const path = `posters/${kind}/${randomUUID()}.${TYPES[f.type]}`;
  const { error } = await supabase!.storage.from('public-media').upload(path, f, { contentType: f.type, upsert: false });
  // a storage refusal has its own message (e.g. the public-media bucket or its rules are not set up in this project)
  if (error) { console.error('[poster] upload refused', { message: error.message }); back(fd, 'p_storage'); }
  back(fd, 'p_uploaded', [PARAM[kind], `media:${path}`]);
}

export async function removePosterPhoto(fd: FormData): Promise<void> {
  const who = await staffWith('posters');
  if (!who) back(fd, 'p_error');
  const path = String(fd.get('path') ?? '');
  if (!UPLOAD_PATH.test(path)) back(fd, 'p_error');
  const supabase = await getSupabase();
  const { error } = await supabase!.storage.from('public-media').remove([path]);
  if (error) back(fd, 'p_error');
  back(fd, 'p_removed');
}
