'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { BALANCE_ROWS } from '@/lib/finance';
import { ibanValid } from '@/lib/invoice/barcode';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Admin → Invoices: billing details, membership plans, memberships (who is invoiced automatically) and invoices.
 * Runs as the signed-in admin under RLS (admin_all); the audit trigger records every change. Results: ?result=<key under inv.*>.
 */

const uuid = z.string().uuid();

function back(fd: FormData, result: string): never {
  const raw = String(fd.get('back') ?? '');
  const url = new URL(raw.startsWith('/admin/invoices') ? raw : '/admin/invoices', 'http://x');
  url.searchParams.set('result', result);
  redirect(url.pathname + url.search + (raw.includes('#') ? raw.slice(raw.indexOf('#')) : ''));
}

async function admin(fd: FormData) {
  const member = await requireArea('admin');
  const supabase = await getSupabase();
  if (!supabase) back(fd, 'r_error');
  return { member, supabase };
}

function fail(fd: FormData, where: string, error: { code?: string; message?: string }): never {
  console.error(`[invoices] ${where} refused`, { code: error.code, message: error.message });
  back(fd, error.code === '23505' ? 'r_duplicate' : error.code === '42501' ? 'r_notAllowed' : 'r_error');
}

const done = (fd: FormData, result: string): never => { revalidatePath('/admin', 'layout'); revalidatePath('/me', 'layout'); back(fd, result); };

// ---------- billing details ----------

const text = (max: number, key: string) => z.string().trim().max(max, key);
const billingSchema = z.object({
  legal_name: text(120, 'r_billing').min(2, 'r_billing'),
  street: text(120, 'r_billing').min(2, 'r_billing'),
  postal_city: text(80, 'r_billing').min(2, 'r_billing'),
  business_id: text(20, 'r_businessId').refine((v) => v === '' || /^\d{7}-\d$/.test(v), 'r_businessId'),
  iban: z.string().trim().transform((v) => v.replace(/\s+/g, '').toUpperCase()).refine(ibanValid, 'r_iban'),
  bic: z.string().trim().toUpperCase().refine((v) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v), 'r_bic'),
  bank: text(60, 'r_billing'),
  email: z.string().trim().max(200, 'r_email').refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'r_email'),
  phone: text(30, 'r_billing'),
  website: text(120, 'r_billing'),
  contact_person: text(120, 'r_billing'),
  payment_terms_days: z.coerce.number().int().min(0, 'r_terms').max(120, 'r_terms'),
  lead_days: z.coerce.number().int().min(0, 'r_lead').max(60, 'r_lead'),
  late_interest: z.string().trim().refine((v) => /^\d{1,2}(\.\d{1,2})?$/.test(v) && Number(v) <= 30, 'r_interest').transform((v) => Number(v).toFixed(2)),
  // 0036: invoice a player only once the contract is signed and the Code of Conduct agreed (checkbox: absent = off)
  require_consents: z.literal('on').optional().transform((v) => v === 'on'),
});

export async function saveBilling(fd: FormData): Promise<void> {
  const p = billingSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, p.error.issues[0]?.message ?? 'r_invalid');
  const { supabase } = await admin(fd);
  const { error } = await supabase.from('site_settings').upsert({ key: 'billing', value: p.data, is_public: true });
  if (error) fail(fd, 'save billing', error);
  done(fd, 'r_billingSaved');
}

// ---------- plans ----------

const planSchema = z.object({
  name: z.string().trim().min(2, 'r_planName').max(80, 'r_planName'),
  price: z.string().trim().transform((v) => v.replace(',', '.')).refine((v) => /^\d{1,5}(\.\d{1,2})?$/.test(v), 'r_price').transform((v) => Math.round(Number(v) * 100)),
  period: z.enum(['month', 'quarter', 'year', 'season', 'one_off']),
});

export async function createPlan(fd: FormData): Promise<void> {
  const p = planSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, p.error.issues[0]?.message ?? 'r_invalid');
  const { supabase } = await admin(fd);
  const { error } = await supabase.from('membership_plans').insert({ name: p.data.name, amount_cents: p.data.price, period: p.data.period });
  if (error) fail(fd, 'create plan', error);
  done(fd, 'r_planCreated');
}

export async function setPlanActive(fd: FormData): Promise<void> {
  const p = z.object({ plan_id: uuid, active: z.enum(['true', 'false']) }).safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, 'r_invalid');
  const { supabase } = await admin(fd);
  const { error } = await supabase.from('membership_plans').update({ active: p.data.active === 'true' }).eq('id', p.data.plan_id);
  if (error) fail(fd, 'plan active', error);
  done(fd, 'r_saved');
}

// ---------- memberships ----------

const membershipSchema = z.object({
  player_id: uuid, plan_id: uuid,
  first_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'r_date'),
  auto: z.literal('on').optional(),
});

/** Puts a player on a plan for the current season. With automatic invoices on, the nightly job invoices from `first_on`. */
export async function addMembership(fd: FormData): Promise<void> {
  const p = membershipSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, p.error.issues[0]?.message ?? 'r_invalid');
  const { supabase } = await admin(fd);
  const { data: season } = await supabase.from('seasons').select('id').eq('is_current', true).maybeSingle();
  if (!season) back(fd, 'r_noSeason');
  const { data: plan } = await supabase.from('membership_plans').select('id, active').eq('id', p.data.plan_id).maybeSingle();
  if (!plan?.active) back(fd, 'r_invalid');
  const { error } = await supabase.from('memberships').insert({
    player_id: p.data.player_id, plan_id: p.data.plan_id, season_id: season.id, status: 'active',
    starts_on: p.data.first_on, auto_renew: !!p.data.auto, next_due_on: p.data.first_on,
  });
  if (error) fail(fd, 'add membership', error);
  done(fd, 'r_membershipAdded');
}

/** Stop or resume automatic invoices for one membership. */
export async function setAutoRenew(fd: FormData): Promise<void> {
  const p = z.object({ membership_id: uuid, auto: z.enum(['true', 'false']) }).safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, 'r_invalid');
  const { supabase } = await admin(fd);
  const { error } = await supabase.from('memberships').update({ auto_renew: p.data.auto === 'true' }).eq('id', p.data.membership_id);
  if (error) fail(fd, 'auto renew', error);
  done(fd, p.data.auto === 'true' ? 'r_autoOn' : 'r_autoOff');
}

// ---------- invoices ----------

/** "Mark paid": records everything still owed on the invoice as paid today (public.record_invoice_payment, 0056). */
export async function markPaid(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('payment_id'));
  if (!id.success) back(fd, 'r_invalid');
  const { supabase } = await admin(fd);
  const { error } = await supabase.rpc('record_invoice_payment', { p_payment: id.data });
  if (error) { if (error.code === '23514') back(fd, 'r_pastDuePaid'); fail(fd, 'mark paid', error); }
  done(fd, 'r_markedPaid');
}

const receiptSchema = z.object({
  payment_id: uuid,
  amount: z.string().trim().regex(/^\d{1,5}([.,]\d{1,2})?$/, 'r_partAmount').transform((v) => Math.round(Number(v.replace(',', '.')) * 100)).pipe(z.number().int().min(1, 'r_partAmount')),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'r_date'),
  note: z.string().trim().max(200, 'r_invalid'),
});

/** A part payment: what the player actually paid (e.g. EUR 10 of 20) and when. The rest stays owed. */
export async function recordPartPayment(fd: FormData): Promise<void> {
  const p = receiptSchema.safeParse({ payment_id: fd.get('payment_id'), amount: String(fd.get('amount') ?? ''), paid_on: String(fd.get('paid_on') ?? ''), note: String(fd.get('note') ?? '') });
  if (!p.success) back(fd, p.error.issues[0]?.message?.startsWith('r_') ? p.error.issues[0].message : 'r_invalid');
  const { supabase } = await admin(fd);
  const { data, error } = await supabase.rpc('record_invoice_payment', { p_payment: p.data.payment_id, p_amount: p.data.amount, p_paid_on: p.data.paid_on, p_note: p.data.note || null });
  if (error) {
    if (error.code === '23514') back(fd, 'r_pastDuePaid');
    if (error.code === '22023') back(fd, error.message.includes('date') ? 'r_partDate' : 'r_partAmount');
    fail(fd, 'part payment', error);
  }
  done(fd, (data as { paid?: boolean } | null)?.paid ? 'r_markedPaid' : 'r_partRecorded');
}

/** Deletes a payment recorded by mistake; a paid invoice opens again. */
export async function deleteReceipt(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('receipt_id'));
  if (!id.success) back(fd, 'r_invalid');
  const { supabase } = await admin(fd);
  const { error } = await supabase.rpc('delete_invoice_receipt', { p_receipt: id.data });
  if (error) fail(fd, 'delete receipt', error);
  done(fd, 'r_receiptDeleted');
}

/** Same as the nightly job, on demand (public.run_invoice_generation checks the admin role again). */
export async function runInvoicingNow(fd: FormData): Promise<void> {
  const { supabase } = await admin(fd);
  const { data, error } = await supabase.rpc('run_invoice_generation');
  if (error) fail(fd, 'run invoicing', error);
  revalidatePath('/admin', 'layout'); revalidatePath('/me', 'layout');
  const url = new URL('/admin/invoices', 'http://x');
  url.searchParams.set('result', 'r_ran'); url.searchParams.set('n', String(Number(data) || 0));
  redirect(url.pathname + url.search);
}

// ---------- past-due amounts (migration 0053) ----------

/** "60", "60.5", "60,50" → cents; EUR 0.01–5000 like the database function. */
const euros = z.string().trim().regex(/^\d{1,4}([.,]\d{1,2})?$/, 'r_pastDueAmount')
  .transform((v) => Math.round(Number(v.replace(',', '.')) * 100)).pipe(z.number().int().min(1, 'r_pastDueAmount').max(500000, 'r_pastDueAmount'));
const pastDueSchema = z.object({
  payment_id: uuid,
  description: z.string().trim().min(3, 'r_pastDueText').max(200, 'r_pastDueText'),
  amount: euros,
});

/** Adds an amount still owed from an earlier season to an unpaid invoice, as its own line (public.add_past_due). */
export async function addPastDue(fd: FormData): Promise<void> {
  const p = pastDueSchema.safeParse({ payment_id: fd.get('payment_id'), description: fd.get('description') ?? '', amount: fd.get('amount') ?? '' });
  if (!p.success) back(fd, p.error.issues[0]?.message?.startsWith('r_') ? p.error.issues[0].message : 'r_invalid');
  const { supabase } = await admin(fd);
  const { error } = await supabase.rpc('add_past_due', { p_payment: p.data.payment_id, p_description: p.data.description, p_amount_cents: p.data.amount });
  if (error) { if (error.code === '23514') back(fd, 'r_pastDuePaid'); fail(fd, 'add past due', error); }
  done(fd, 'r_pastDueAdded');
}

/** Removes a past-due line again while the invoice is unpaid (public.remove_past_due). */
export async function removePastDue(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('line_id'));
  if (!id.success) back(fd, 'r_invalid');
  const { supabase } = await admin(fd);
  const { error } = await supabase.rpc('remove_past_due', { p_line: id.data });
  if (error) { if (error.code === '23514') back(fd, 'r_pastDuePaid'); fail(fd, 'remove past due', error); }
  done(fd, 'r_pastDueRemoved');
}

// ---------- balance invoices (migration 0055) ----------

const balanceItem = z.object({ season_id: z.union([z.literal(''), uuid]), description: z.string().trim(), amount: z.string().trim() });

/**
 * One invoice per filled row for one player (public.create_balance_invoices): e.g. "Balance 2024" and "Player licence 2026"
 * become two invoices with their own number, reference and PDF. Rows with neither text nor amount are skipped.
 */
export async function createBalanceInvoices(fd: FormData): Promise<void> {
  const player = uuid.safeParse(fd.get('player_id'));
  const due = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(fd.get('due_on'));
  if (!player.success) back(fd, 'r_balancePlayer');
  if (!due.success) back(fd, 'r_date');
  const items: { season_id: string | null; description: string; amount_cents: number }[] = [];
  for (let i = 0; i < BALANCE_ROWS; i++) {
    const r = balanceItem.safeParse({ season_id: String(fd.get(`season_${i}`) ?? ''), description: String(fd.get(`description_${i}`) ?? ''), amount: String(fd.get(`amount_${i}`) ?? '') });
    if (!r.success) back(fd, 'r_invalid');
    if (!r.data.description && !r.data.amount) continue;
    if (r.data.description.length < 3 || r.data.description.length > 200) back(fd, 'r_pastDueText');
    const cents = euros.safeParse(r.data.amount);
    if (!cents.success) back(fd, 'r_pastDueAmount');
    items.push({ season_id: r.data.season_id || null, description: r.data.description, amount_cents: cents.data });
  }
  if (!items.length) back(fd, 'r_balanceEmpty');
  const { supabase } = await admin(fd);
  const { data, error } = await supabase.rpc('create_balance_invoices', { p_player: player.data, p_due: due.data, p_items: items });
  if (error) { if (error.code === '22023') back(fd, 'r_invalid'); fail(fd, 'balance invoices', error); }
  revalidatePath('/admin', 'layout'); revalidatePath('/me', 'layout');
  const url = new URL('/admin/invoices', 'http://x');
  url.searchParams.set('player', player.data); url.searchParams.set('result', 'r_balanceCreated'); url.searchParams.set('n', String((data as string[] | null)?.length ?? items.length));
  redirect(url.pathname + url.search + '#list-h');
}
