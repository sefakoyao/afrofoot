'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMember } from '@/lib/auth';
import { analyseSquad, type Analysis } from '@/lib/squad-ai';
import { getSupabase } from '@/lib/supabase/server';

export type SaveState = { status: 'idle' } | { status: 'ok'; at: string } | { status: 'error'; error: string };
export type AnalysisState = { status: 'idle' } | { status: 'ok'; analysis: Analysis } | { status: 'error'; error: string };

const key = z.string().regex(/^(p|tryout|enrolment):[0-9a-f-]{36}$/);
const payload = z.object({
  team: z.string().uuid(), year: z.number().int().min(2020).max(2100), formation: z.string().min(1).max(20), notes: z.string().max(2000),
  slots: z.array(z.object({ slot: z.number().int().min(1).max(11), depth: z.number().int().min(1).max(3), key })).max(33),
  statuses: z.array(z.object({ key: z.string().regex(/^p:[0-9a-f-]{36}$/), status: z.enum(['confirmed', 'likely', 'unsure', 'leaving']), note: z.string().max(300) })).max(200),
});

/** Save the whole plan (public.save_squad_plan checks the person may plan this team and every value). */
export async function saveSquadPlan(_: SaveState, fd: FormData): Promise<SaveState> {
  await requireMember('/admin');
  let raw: unknown;
  try { raw = JSON.parse(String(fd.get('plan') ?? '')); } catch { return { status: 'error', error: 'invalid' }; }
  const p = payload.safeParse(raw);
  if (!p.success) return { status: 'error', error: 'invalid' };
  const supabase = await getSupabase();
  if (!supabase) return { status: 'error', error: 'failed' };
  const slots = p.data.slots.map((s) => {
    const [kind, id] = s.key.split(':') as [string, string];
    return kind === 'p' ? { slot: s.slot, depth: s.depth, player_id: id } : { slot: s.slot, depth: s.depth, applicant_kind: kind, applicant_id: id };
  });
  const statuses = p.data.statuses.map((s) => ({ player_id: s.key.slice(2), status: s.status, note: s.note }));
  const { error } = await supabase.rpc('save_squad_plan', { p_team: p.data.team, p_year: p.data.year, p_formation: p.data.formation, p_slots: slots, p_statuses: statuses, p_notes: p.data.notes });
  if (error) {
    console.error('[squad] save refused', { code: error.code, message: error.message });
    return { status: 'error', error: error.code === '42501' ? 'notAllowed' : error.code === '42P01' || error.code === 'PGRST202' ? 'notInstalled' : 'failed' };
  }
  revalidatePath('/admin/squad'); revalidatePath('/coach/squad');
  return { status: 'ok', at: new Date().toISOString() };
}

const facts = z.object({
  year: z.number().int(), formation: z.string().max(20),
  places: z.array(z.object({ place: z.number().int(), role: z.string().max(2), starter: z.string().max(5).nullable(), backups: z.array(z.string().max(5)).max(2) })).max(11),
  players: z.array(z.object({ code: z.string().max(5), position: z.string().max(2).nullable(), second: z.string().max(2).nullable(), age: z.number().int().nullable(),
    outlook: z.string().max(10), attendance: z.number().int().nullable(), games: z.number().int(), goals: z.number().int(), applicant: z.boolean() })).max(300),
});

/** "Analyse the squad": numbers and codes only (see lib/squad-ai.ts); the person must be able to plan the team. */
export async function analysePlan(_: AnalysisState, fd: FormData): Promise<AnalysisState> {
  await requireMember('/admin');
  const team = z.string().uuid().safeParse(fd.get('team'));
  let raw: unknown;
  try { raw = JSON.parse(String(fd.get('facts') ?? '')); } catch { return { status: 'error', error: 'invalid' }; }
  const f = facts.safeParse(raw);
  if (!team.success || !f.success) return { status: 'error', error: 'invalid' };
  const supabase = await getSupabase();
  const { data: may } = supabase ? await supabase.rpc('can_plan_team', { p_team: team.data }) : { data: false };
  if (may !== true) return { status: 'error', error: 'notAllowed' };
  const r = await analyseSquad(f.data);
  return 'analysis' in r ? { status: 'ok', analysis: r.analysis } : { status: 'error', error: r.error };
}
