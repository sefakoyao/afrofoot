'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
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
/** The relation: a code from the list, or (for "Other") what the player wrote. */
const relationOf = (fd: FormData) => { const pick = String(fd.get('emergency_relation') ?? ''); return pick === 'other' ? String(fd.get('emergency_relation_other') ?? '').trim() : pick; };
const submitted = (fd: FormData) => ({ ...Object.fromEntries(FIELDS.map((k) => [k, String(fd.get(k) ?? '').slice(0, 120)])), emergency_relation: relationOf(fd).slice(0, 60) || (fd.get('emergency_relation') === 'other' ? 'other' : '') });

async function save(fd: FormData): Promise<PlayerProfileState> {
  const member = await requireArea('me');
  const p = playerProfileSchema.safeParse({ ...Object.fromEntries(fd), emergency_relation: relationOf(fd) });
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
  revalidatePath('/me', 'layout'); revalidatePath('/account');
  return { status: 'ok' };
}

/** Back to the profile page the member used: /account or /me/profile (the same page, components/profile/ProfileView). */
const profileBack = (fd: FormData) => (fd.get('back') === '/account' ? '/account' : '/me/profile');

/**
 * The player's own opt-out from the squad on the club website (players.website_hidden, view public_squad, migration
 * 0042): the squad comes from Palloliitto's public player list, and a player can remove themselves at any time.
 * Runs as the player: RLS limits it to their own row and app.restrict_columns allows this column.
 */
export async function setWebsiteListing(fd: FormData): Promise<void> {
  const member = await requireArea('me');
  const show = fd.get('show') === 'on';
  const supabase = await getSupabase();
  if (supabase) {
    const { error } = await supabase.from('players').update({ website_hidden: !show }).eq('profile_id', member.id);
    if (error) console.error('[player] website listing refused', { code: error.code, message: error.message });
  }
  revalidatePath('/me/profile'); revalidatePath('/account');
  redirect(`${profileBack(fd)}?website=saved#website`);
}

/** The member's own choice to get reply reminders by email (profiles.reminder_emails, migration 0048). */
export async function setReminderEmails(fd: FormData): Promise<void> {
  const member = await requireArea('me');
  const on = fd.get('on') === 'on';
  const supabase = await getSupabase();
  if (supabase) {
    const { error } = await supabase.from('profiles').update({ reminder_emails: on }).eq('id', member.id);
    if (error) console.error('[player] reminder setting refused', { code: error.code, message: error.message });
  }
  revalidatePath('/me/profile'); revalidatePath('/account');
  redirect(`${profileBack(fd)}?reminders=saved#reminders`);
}
