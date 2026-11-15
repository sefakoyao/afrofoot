'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { defaultEnd, fillTemplate, hasBlanks, maxEnd } from '@/lib/contracts';
import { loadBilling } from '@/lib/invoice/data';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Player contracts (migration 0030). Admin steps run as the admin (RLS admin_all; app.guard_contract enforces the status
 * flow, the locked text and who signs). Players sign or decline through sign_contract / decline_contract.
 * Results: ?result=<key under contract.*>. The zod rules mirror the database checks.
 */
const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'r_dates');
const years = z.coerce.number().int().min(1, 'r_invalid').max(3, 'r_invalid');
const body = z.string().transform((v) => v.replace(/\r\n/g, '\n').trim()).pipe(z.string().min(50, 'r_invalid').max(40000, 'r_invalid'));

function go(path: string, result: string, hash = ''): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}result=${result}${hash}`);
}
const refresh = () => { revalidatePath('/admin', 'layout'); revalidatePath('/me', 'layout'); };
const datesOk = (starts: string, ends: string, y: number) => ends > starts && ends <= maxEnd(starts, y);

/** Database refusal → result key. */
function errKey(e: { code?: string; message?: string }): string {
  if (e.code === '23505') return 'r_overlap';
  if (e.code === '42501') return 'r_notAllowed';
  if (e.code === '23514') return /blank/i.test(e.message ?? '') ? 'r_blanks' : /name/i.test(e.message ?? '') ? 'r_name' : 'r_dates';
  if (e.code === 'P0002') return 'r_gone';
  return 'r_error';
}

async function adminDb() {
  const member = await requireArea('admin');
  const supabase = await getSupabase();
  if (!supabase) go('/admin/contracts', 'r_error');
  return { member, supabase };
}

// ---------- admin ----------
const createSchema = z.object({
  player_id: uuid, team_season_id: z.union([z.literal(''), uuid]).transform((v) => v || null),
  years, starts_on: isoDate, ends_on: z.union([z.literal(''), isoDate]),
});

export async function createContract(fd: FormData): Promise<void> {
  const { supabase } = await adminDb();
  const parsed = createSchema.safeParse(Object.fromEntries(['player_id', 'team_season_id', 'years', 'starts_on', 'ends_on'].map((k) => [k, fd.get(k) ?? ''])));
  if (!parsed.success) go('/admin/contracts', parsed.error.issues[0]?.message === 'r_dates' ? 'r_dates' : 'r_invalid', '#new-h');
  const v = parsed.data;
  const ends = v.ends_on || defaultEnd(v.starts_on, v.years);
  if (!datesOk(v.starts_on, ends, v.years)) go('/admin/contracts', 'r_dates', '#new-h');
  const [{ data: player }, { data: tpl }, ts, billing] = await Promise.all([
    supabase.from('players').select('first_name, last_name').eq('id', v.player_id).maybeSingle(),
    supabase.from('contract_templates').select('body').eq('is_default', true).maybeSingle(),
    v.team_season_id ? supabase.from('team_seasons').select('teams!inner(name)').eq('id', v.team_season_id).maybeSingle() : Promise.resolve({ data: null }),
    loadBilling(supabase),
  ]);
  if (!player) go('/admin/contracts', 'r_noPlayer', '#new-h');
  if (!tpl) go('/admin/contracts', 'r_error', '#new-h');
  const team = (ts.data?.teams as unknown as { name: string } | undefined)?.name ?? '';
  const startYear = v.starts_on.slice(0, 4), endYear = ends.slice(0, 4);
  const text = fillTemplate(tpl.body, { club: billing.legal_name || 'the club', team, player: `${player.first_name} ${player.last_name}`, starts: v.starts_on, ends, years: v.years });
  const { data, error } = await supabase.from('player_contracts').insert({
    player_id: v.player_id, team_season_id: v.team_season_id, years: v.years, starts_on: v.starts_on, ends_on: ends, body: text,
    title: `Player contract ${startYear === endYear ? startYear : `${startYear}–${endYear}`}`,
  }).select('id').single();
  if (error || !data) { console.error('[contracts] create refused', { code: error?.code, message: error?.message }); go('/admin/contracts', error ? errKey(error) : 'r_error', '#new-h'); }
  refresh();
  go(`/admin/contracts/${data.id}`, 'r_created');
}

const saveSchema = z.object({ id: uuid, title: z.string().trim().min(3, 'r_invalid').max(160, 'r_invalid'), years, starts_on: isoDate, ends_on: isoDate, body });

export async function saveContract(fd: FormData): Promise<void> {
  const { supabase } = await adminDb();
  const id = String(fd.get('id') ?? '');
  const back = uuid.safeParse(id).success ? `/admin/contracts/${id}` : '/admin/contracts';
  const parsed = saveSchema.safeParse(Object.fromEntries(['id', 'title', 'years', 'starts_on', 'ends_on', 'body'].map((k) => [k, fd.get(k) ?? ''])));
  if (!parsed.success) go(back, parsed.error.issues[0]?.message === 'r_dates' ? 'r_dates' : 'r_invalid');
  const v = parsed.data;
  if (!datesOk(v.starts_on, v.ends_on, v.years)) go(back, 'r_dates');
  const { data, error } = await supabase.from('player_contracts').update({ title: v.title, years: v.years, starts_on: v.starts_on, ends_on: v.ends_on, body: v.body })
    .eq('id', v.id).eq('status', 'draft').select('id');
  if (error) go(back, errKey(error));
  if (!data?.length) go(back, 'r_gone');
  refresh();
  go(back, 'r_saved');
}

const opSchema = z.object({
  id: uuid, op: z.enum(['send', 'countersign', 'cancel', 'delete', 'terminate']),
  terminated_on: z.union([z.literal(''), isoDate]), reason: z.string().trim().max(500, 'r_reason'),
});

export async function contractStep(fd: FormData): Promise<void> {
  const { supabase } = await adminDb();
  const parsed = opSchema.safeParse({ id: fd.get('id'), op: fd.get('op'), terminated_on: fd.get('terminated_on') ?? '', reason: fd.get('reason') ?? '' });
  if (!parsed.success) go('/admin/contracts', 'r_invalid');
  const { id, op, terminated_on, reason } = parsed.data;
  const back = `/admin/contracts/${id}`;
  const { data: c } = await supabase.from('player_contracts').select('status, body, starts_on').eq('id', id).maybeSingle();
  if (!c) go('/admin/contracts', 'r_gone');
  if (op === 'send' && hasBlanks(c.body)) go(back, 'r_blanks');
  if (op === 'terminate' && (!terminated_on || terminated_on < c.starts_on)) go(back, 'r_dates');
  if (op === 'terminate' && !reason) go(back, 'r_reason');
  const q = supabase.from('player_contracts');
  const { data, error } = op === 'delete'
    ? await q.delete().eq('id', id).eq('status', 'draft').select('id')
    : await q.update(
      op === 'send' ? { status: 'sent' } : op === 'countersign' ? { status: 'active' } : op === 'cancel' ? { status: 'cancelled' }
        : { status: 'terminated', terminated_on, termination_reason: reason },
    ).eq('id', id).eq('status', op === 'send' ? 'draft' : op === 'countersign' ? 'player_signed' : op === 'terminate' ? 'active' : c.status).select('id');
  if (error) { console.error('[contracts] step refused', { op, code: error.code, message: error.message }); go(back, errKey(error)); }
  if (!data?.length) go(back, 'r_gone');
  refresh();
  if (op === 'delete') go('/admin/contracts', 'r_deleted');
  go(back, { send: 'r_sent', countersign: 'r_countersigned', cancel: 'r_cancelled', terminate: 'r_terminated' }[op]);
}

export async function saveTemplate(fd: FormData): Promise<void> {
  const { supabase } = await adminDb();
  const parsed = body.safeParse(fd.get('body') ?? '');
  if (!parsed.success) go('/admin/contracts', 'r_invalid', '#tpl-h');
  const { data, error } = await supabase.from('contract_templates').update({ body: parsed.data }).eq('is_default', true).select('id');
  if (error || !data?.length) go('/admin/contracts', 'r_error', '#tpl-h');
  go('/admin/contracts', 'r_templateSaved', '#tpl-h');
}

// ---------- player ----------
export async function signContract(fd: FormData): Promise<void> {
  await requireArea('me');
  const id = String(fd.get('id') ?? '');
  if (!uuid.safeParse(id).success) go('/me/membership', 'r_gone', '#contract');
  const back = `/me/contract/${id}`;
  if (fd.get('agree') !== 'on') go(back, 'r_tick');
  const name = z.string().trim().min(2).max(160).safeParse(fd.get('name') ?? '');
  if (!name.success) go(back, 'r_name');
  const supabase = await getSupabase();
  if (!supabase) go(back, 'r_error');
  const { error } = await supabase.rpc('sign_contract', { p_id: id, p_name: name.data });
  if (error) go(back, errKey(error));
  refresh();
  go('/me/membership', 'r_signed', '#contract');
}

export async function declineContract(fd: FormData): Promise<void> {
  await requireArea('me');
  const id = String(fd.get('id') ?? '');
  if (!uuid.safeParse(id).success) go('/me/membership', 'r_gone', '#contract');
  const reason = z.string().trim().max(500).safeParse(fd.get('reason') ?? '');
  if (!reason.success) go(`/me/contract/${id}`, 'r_reason');
  const supabase = await getSupabase();
  if (!supabase) go(`/me/contract/${id}`, 'r_error');
  const { error } = await supabase.rpc('decline_contract', { p_id: id, p_reason: reason.data });
  if (error) go(`/me/contract/${id}`, errKey(error));
  refresh();
  go('/me/membership', 'r_declined', '#contract');
}
