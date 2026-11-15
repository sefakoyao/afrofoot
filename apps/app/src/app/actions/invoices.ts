'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
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

/** Record that an invoice was paid (for example after checking the bank account). */
export async function markPaid(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('payment_id'));
  if (!id.success) back(fd, 'r_invalid');
  const { member, supabase } = await admin(fd);
  const { data, error } = await supabase.from('payments').update({ status: 'paid', paid_at: new Date().toISOString(), recorded_by: member.id })
    .eq('id', id.data).in('status', ['pending', 'failed']).select('id');
  if (error) fail(fd, 'mark paid', error);
  if (!data?.length) back(fd, 'r_invalid');
  done(fd, 'r_markedPaid');
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
