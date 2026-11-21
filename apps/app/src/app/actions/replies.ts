'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/**
 * The player signs in ("yes") or out ("no") of one of their events from the Calendar tab, with an optional note for the coach.
 * The database only lets players change their own row, only before the event starts and while it is scheduled, and sets the
 * answer time itself (RLS + app.guard_event_reply, migration 0029). Returns a state for the form (no redirect, so the
 * calendar keeps its scroll position); message keys are under me.*.
 */
export type ReplyState = { status: 'idle' | 'ok' | 'error'; key?: string; answer?: 'yes' | 'no' | 'maybe'; note?: string | null };

const schema = z.object({
  event_id: z.string().uuid(),
  kind: z.enum(['practice', 'game', 'friendly']),
  answer: z.enum(['yes', 'no', 'maybe']),
  note: z.string().trim().max(300).transform((v) => v || null),
});

export async function replyToEvent(_prev: ReplyState, fd: FormData): Promise<ReplyState> {
  await requireArea('me');
  const parsed = schema.safeParse({ event_id: fd.get('event_id'), kind: fd.get('kind'), answer: fd.get('answer'), note: fd.get('note') ?? '' });
  if (!parsed.success) return { status: 'error', key: 'r_replyInvalid' };
  const v = parsed.data;
  const supabase = await getSupabase();
  if (!supabase) return { status: 'error', key: 'r_replyError' };
  const q = v.kind === 'practice'
    ? supabase.from('session_attendance').update({ availability: v.answer, note: v.note }).eq('session_id', v.event_id)
    : supabase.from('match_availability').update({ availability: v.answer, note: v.note }).eq('match_id', v.event_id);
  // RLS limits the update to the player's own row; .select() tells us whether there was one.
  const { data, error } = await q.select('id');
  if (error) {
    if (error.code === '23514') return { status: 'error', key: 'r_replyClosed' };
    console.error('[replies] refused', { code: error.code, message: error.message });
    return { status: 'error', key: 'r_replyError' };
  }
  if (!data?.length) return { status: 'error', key: 'r_replyNotInvited' };
  revalidatePath('/me', 'layout');
  revalidatePath('/coach', 'layout');
  return { status: 'ok', key: v.answer === 'yes' ? 'r_signedIn' : v.answer === 'maybe' ? 'r_maybe' : 'r_signedOut', answer: v.answer, note: v.note };
}
