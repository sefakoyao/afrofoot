'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMember } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

export type BirthState = { status: 'idle' } | { status: 'ok' } | { status: 'error'; error: 'range' | 'already' | 'noPlayer' | 'notReady' | 'failed' };

/** 1940-01-01 to 5 years ago (Helsinki): the same range as the database (app.birth_date_ok, migration 0073). */
const birthDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date());
  return !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && d >= '1940-01-01' && d <= `${Number(today.slice(0, 4)) - 5}${today.slice(4)}`;
});

/**
 * A player saves their own birth date, once (only while none is saved). Runs as the player: RLS limits it to their own
 * row and the database (guard_birth_date) refuses a change once one is saved; an admin corrects it after that.
 */
export async function setMyBirthDate(_: BirthState, fd: FormData): Promise<BirthState> {
  const member = await requireMember('/me');
  const p = birthDate.safeParse(String(fd.get('date_of_birth') ?? ''));
  if (!p.success) return { status: 'error', error: 'range' };
  const supabase = await getSupabase();
  if (!supabase) return { status: 'error', error: 'failed' };
  const { data: me } = await supabase.from('players').select('id, date_of_birth').eq('profile_id', member.id).maybeSingle();
  if (!me) return { status: 'error', error: 'noPlayer' };
  if (me.date_of_birth) return { status: 'error', error: 'already' };
  const { data, error } = await supabase.from('players').update({ date_of_birth: p.data }).eq('id', me.id).is('date_of_birth', null).select('id');
  if (error) {
    // "already saved" only when the database says so (guard_birth_date); any other refusal means the database is not
    // ready for it yet (migration 0073 not installed: the generic column rule refuses) — never blame the player
    console.error('[birth] save refused', { code: error.code, message: error.message });
    return { status: 'error', error: error.code === '23514' ? 'range' : /already saved/i.test(error.message ?? '') ? 'already' : error.code === '42501' ? 'notReady' : 'failed' };
  }
  if (!data?.length) return { status: 'error', error: 'notReady' };
  revalidatePath('/', 'layout');
  return { status: 'ok' };
}
