'use server';

import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth';
import { playerProfileSchema } from '@/lib/schemas';
import { getSupabase } from '@/lib/supabase/server';

/** On error the submitted values come back, so the form shows them again (React resets a form after every action). */
export type PlayerProfileState = { status: 'idle' } | { status: 'ok' } | { status: 'error'; error: string; values?: Record<string, string> };

/**
 * Save the player's own sport and contact details. Runs as the player: RLS limits it to their own rows and
 * app.restrict_columns refuses anything but foot / height / weight on players (position stays with the coach).
 * Error values are keys under `pp.*`.
 */
export async function savePlayerProfile(_: PlayerProfileState, fd: FormData): Promise<PlayerProfileState> {
  const r = await save(fd);
  return r.status === 'error' ? { ...r, values: submitted(fd) } : r;
}

const FIELDS = ['preferred_foot', 'height_cm', 'weight_kg', 'phone', 'emergency_name', 'emergency_relation', 'emergency_phone'] as const;
const submitted = (fd: FormData) => Object.fromEntries(FIELDS.map((k) => [k, String(fd.get(k) ?? '').slice(0, 120)]));

async function save(fd: FormData): Promise<PlayerProfileState> {
  const member = await requireArea('me');
  const p = playerProfileSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { status: 'error', error: p.error.issues[0]?.message ?? 'e_failed' };
  const supabase = await getSupabase();
  if (!supabase) return { status: 'error', error: 'e_failed' };
  const { data: player } = await supabase.from('players').select('id').eq('profile_id', member.id).maybeSingle();
  if (!player) return { status: 'error', error: 'e_noPlayer' };

  const { preferred_foot, height_cm, weight_kg, ...contact } = p.data;
  const [a, b] = await Promise.all([
    supabase.from('players').update({ preferred_foot, height_cm, weight_kg }).eq('id', player.id),
    supabase.from('player_private').upsert({ player_id: player.id, ...contact }, { onConflict: 'player_id' }),
  ]);
  const error = a.error ?? b.error;
  if (error) {
    console.error('[player] profile save refused', { code: error.code, message: error.message });
    return { status: 'error', error: error.code === '23514' ? 'e_phone' : 'e_failed' };
  }
  revalidatePath('/me', 'layout');
  return { status: 'ok' };
}
