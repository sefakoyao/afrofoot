'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { buildContract } from '@/lib/auto-contracts';
import { defaultEnd, hasBlanks, maxEnd } from '@/lib/contracts';
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
  const row = await buildContract(supabase, { playerId: v.player_id, teamSeasonId: v.team_season_id, years: v.years, startsOn: v.starts_on, endsOn: ends });
  if (!row) go('/admin/contracts', 'r_noPlayer', '#new-h');
  const { data, error } = await supabase.from('player_contracts').insert(row).select('id').single();
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
  id: uuid, op: z.enum(['send', 'countersign', 'cancel', 'delete', 'terminate', 'refill']),
  terminated_on: z.union([z.literal(''), isoDate]), reason: z.string().trim().max(500, 'r_reason'),
});

export async function contractStep(fd: FormData): Promise<void> {
  const { supabase } = await adminDb();
  const parsed = opSchema.safeParse({ id: fd.get('id'), op: fd.get('op'), terminated_on: fd.get('terminated_on') ?? '', reason: fd.get('reason') ?? '' });
  if (!parsed.success) go('/admin/contracts', 'r_invalid');
  const { id, op, terminated_on, reason } = parsed.data;
  const back = `/admin/contracts/${id}`;
  const { data: c } = await supabase.from('player_contracts').select('status, body, starts_on, ends_on, years, player_id, team_season_id').eq('id', id).maybeSingle();
  if (!c) go('/admin/contracts', 'r_gone');
  // 0037: a draft made before the team's objectives or the fee lines were written picks them up again from the template
  if (op === 'refill') {
    if (c.status !== 'draft') go(back, 'r_gone');
    const row = await buildContract(supabase, { playerId: c.player_id, teamSeasonId: c.team_season_id, years: c.years, startsOn: c.starts_on, endsOn: c.ends_on });
    if (!row) go(back, 'r_error');
    const { error } = await supabase.from('player_contracts').update({ body: row.body }).eq('id', id).eq('status', 'draft');
    if (error) go(back, errKey(error));
    refresh();
    go(back, hasBlanks(row.body) ? 'r_refilledBlanks' : 'r_refilled');
  }
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
/**
 * The player signs. 0068: under 18 (the birth date decides; without one, the player's answer), a parent or guardian
 * signs too: name, relation, phone with country code, optional email, and their own typed name. The database
 * (sign_contract) checks the same and stores it with the signature.
 */
const guardianSchema = z.object({
  guardian_name: z.string().trim().min(2, 'r_guardianName').max(120, 'r_guardianName'),
  guardian_relation: z.enum(['mother', 'father', 'guardian'], { message: 'r_guardianRelation' }),
  guardian_phone: z.string().trim().refine((v) => /^\+[1-9][0-9]{6,14}$/.test(v.replace(/[ ()-]/g, '')), 'r_guardianPhone'),
  guardian_email: z.union([z.literal(''), z.string().trim().email('r_guardianEmail').max(200, 'r_guardianEmail')]),
  guardian_sign: z.string().trim().min(2, 'r_guardianSign').max(120, 'r_guardianSign'),
}).refine((g) => g.guardian_sign.replace(/\s+/g, ' ').toLowerCase() === g.guardian_name.replace(/\s+/g, ' ').toLowerCase(), { message: 'r_guardianSign' });

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
  // under 18? the birth date decides; when it is not known, the player's own answer on the form
  const { data: known } = await supabase.rpc('my_minor_status');
  const said = fd.get('minor');
  const minor = known === true || (known === null && said === 'yes');
  if (known === null && said !== 'yes' && said !== 'no') go(back, 'r_minorAnswer');
  let g: z.infer<typeof guardianSchema> | null = null;
  if (minor) {
    const p = guardianSchema.safeParse(Object.fromEntries(['guardian_name', 'guardian_relation', 'guardian_phone', 'guardian_email', 'guardian_sign'].map((k) => [k, fd.get(k) ?? ''])));
    if (!p.success) go(back, p.error.issues[0]?.message?.startsWith('r_') ? p.error.issues[0].message : 'r_guardianName');
    g = p.data;
    if (g.guardian_name.replace(/\s+/g, ' ').toLowerCase() === name.data.replace(/\s+/g, ' ').toLowerCase()) go(back, 'r_guardianSelf');
  }
  const { error } = await supabase.rpc('sign_contract', {
    p_id: id, p_name: name.data, p_minor: known === null ? minor : null,
    p_guardian_name: g?.guardian_name ?? null, p_guardian_relation: g?.guardian_relation ?? null, p_guardian_phone: g?.guardian_phone ?? null,
    p_guardian_email: g?.guardian_email || null, p_guardian_sign: g?.guardian_sign ?? null,
  });
  if (error) go(back, /birth date/i.test(error.message ?? '') ? 'r_birth' : /guardian/i.test(error.message ?? '') ? 'r_guardian' : errKey(error));
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

// ---------- automatic contracts (migration 0037) ----------
const list = z.string().transform((v) => v.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 15).join('\n')).pipe(z.string().max(1000, 'r_invalid'));
const settingsSchema = z.object({
  auto: z.enum(['send', 'draft', 'off']),
  years: z.coerce.number().int().min(1, 'r_invalid').max(3, 'r_invalid'),
  team_fee: z.string().trim().max(200, 'r_invalid'),
  included: list, not_included: list,
  // 0052: '' (the countersigning admin's own name) or 2–120 characters; title up to 80 (DB: club_signed_name 2–160, title 1–80)
  signatory_name: z.union([z.literal(''), z.string().trim().min(2, 'r_invalid').max(120, 'r_invalid')]),
  signatory_title: z.string().trim().max(80, 'r_invalid'),
});

/** What happens when a player joins a team, the contract length, and the fee lines printed in every contract. */
export async function saveContractSettings(fd: FormData): Promise<void> {
  const { supabase } = await adminDb();
  const p = settingsSchema.safeParse(Object.fromEntries(['auto', 'years', 'team_fee', 'included', 'not_included', 'signatory_name', 'signatory_title'].map((k) => [k, String(fd.get(k) ?? '').trim()])));
  if (!p.success) go('/admin/contracts', 'r_invalid', '#auto-h');
  // keep the 0037 fields (used by the earlier template) while saving the amateur agreement's fields
  const { data: old } = await supabase.from('site_settings').select('value').eq('key', 'contracts').maybeSingle();
  const { error } = await supabase.from('site_settings').upsert({ key: 'contracts', value: { ...((old?.value as object | null) ?? {}), ...p.data }, is_public: false });
  if (error) { console.error('[contracts] settings refused', { code: error.code, message: error.message }); go('/admin/contracts', 'r_error', '#auto-h'); }
  refresh();
  go('/admin/contracts', 'r_settingsSaved', '#auto-h');
}
