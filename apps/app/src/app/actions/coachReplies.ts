'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/**
 * A coach answers I'm in / Maybe / Can't for one of their teams' events (coach_replies, migration 0072). The database
 * decides: only their own answer, only for a team they coach, only before the event starts (RLS + app.guard_coach_reply).
 * Returns a state for the buttons (no redirect, so the page keeps its place).
 */
export type CoachReplyState = { status: 'idle' | 'ok' | 'error'; answer?: 'yes' | 'maybe' | 'no'; key?: 'r_closed' | 'r_error' | 'r_notInstalled' };
const schema = z.object({ kind: z.enum(['practice', 'match', 'event']), event_id: z.string().uuid(), answer: z.enum(['yes', 'maybe', 'no']) });

export async function replyAsCoach(_prev: CoachReplyState, fd: FormData): Promise<CoachReplyState> {
  const member = await requireArea('coach');
  const p = schema.safeParse({ kind: fd.get('kind'), event_id: fd.get('event_id'), answer: fd.get('answer') });
  if (!p.success) return { status: 'error', key: 'r_error' };
  const supabase = await getSupabase();
  if (!supabase) return { status: 'error', key: 'r_error' };
  const { error } = await supabase.from('coach_replies')
    .upsert({ event_kind: p.data.kind, event_id: p.data.event_id, profile_id: member.id, availability: p.data.answer }, { onConflict: 'event_kind,event_id,profile_id' });
  if (error) {
    console.error('[coach reply] refused', { code: error.code, message: error.message });
    return { status: 'error', key: error.code === '42P01' ? 'r_notInstalled' : error.code === '23514' || error.code === '42501' ? 'r_closed' : 'r_error' };
  }
  revalidatePath('/coach', 'layout');
  return { status: 'ok', answer: p.data.answer };
}
