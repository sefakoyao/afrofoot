'use server';

import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/**
 * The player's own photo (storage bucket player-photos, folder = their account id; migration 0009 own-folder policy,
 * players.photo_path check in migration 0032). The browser shrinks the picture to 512 px JPEG before sending it.
 * Coaches of the player's teams can view it (migration 0032). Results are keys under pp.*.
 */
export type PhotoState = { status: 'idle' | 'ok' | 'removed' } | { status: 'error'; error: string };
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX = 900 * 1024;

export async function savePlayerPhoto(_: PhotoState, fd: FormData): Promise<PhotoState> {
  const member = await requireArea('me');
  const supabase = await getSupabase();
  if (!supabase) return { status: 'error', error: 'e_failed' };
  const { data: player } = await supabase.from('players').select('id, photo_path').eq('profile_id', member.id).maybeSingle();
  if (!player) return { status: 'error', error: 'e_noPlayer' };
  const old = player.photo_path as string | null;

  if (fd.get('op') === 'remove') {
    const { error } = await supabase.from('players').update({ photo_path: null }).eq('id', player.id);
    if (error) return { status: 'error', error: 'e_failed' };
    if (old) await supabase.storage.from('player-photos').remove([old]);
    revalidatePath('/me', 'layout'); revalidatePath('/coach', 'layout'); revalidatePath('/account');
    return { status: 'removed' };
  }

  const file = fd.get('photo');
  if (!(file instanceof File) || file.size === 0) return { status: 'error', error: 'e_photoMissing' };
  if (!TYPES.includes(file.type)) return { status: 'error', error: 'e_photoType' };
  if (file.size > MAX) return { status: 'error', error: 'e_photoSize' };
  const path = `${member.id}/photo-${Date.now()}.${file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'}`;
  const up = await supabase.storage.from('player-photos').upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) { console.error('[photo] upload refused', { message: up.error.message }); return { status: 'error', error: 'e_failed' }; }
  const { error } = await supabase.from('players').update({ photo_path: path }).eq('id', player.id);
  if (error) { await supabase.storage.from('player-photos').remove([path]); console.error('[photo] save refused', { code: error.code }); return { status: 'error', error: 'e_failed' }; }
  if (old && old !== path) await supabase.storage.from('player-photos').remove([old]);
  revalidatePath('/me', 'layout'); revalidatePath('/coach', 'layout'); revalidatePath('/account');
  return { status: 'ok' };
}
