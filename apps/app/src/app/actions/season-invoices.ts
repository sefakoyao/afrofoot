'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Admin → Finance → Past seasons (migration 0063): bill chosen players for a season afterwards, and mark several of those
 * invoices paid at once. The database checks the same limits (create_season_invoices, mark_invoices_paid).
 */
const uuid = z.string().uuid();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'p_month').transform((v) => `${v}-01`);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'p_date');
// euros as typed (20 or 20,50), as cents: 0.01–1000
const euros = z.string().trim().transform((v) => v.replace(',', '.')).refine((v) => /^\d{1,4}(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 1000, 'p_fee').transform((v) => Math.round(Number(v) * 100));

function back(season: string, result: string, extra: Record<string, string> = {}): never {
  const u = new URLSearchParams({ ...(/^[0-9a-f-]{36}$/.test(season) ? { season } : {}), result, ...extra });
  redirect(`/admin/finance/past?${u}#${result.startsWith('p_paid') || result === 'p_marked' ? 'list' : 'bill'}`);
}
async function db(season: string) {
  await requireArea('admin');
  const supabase = await getSupabase();
  if (!supabase) back(season, 'p_error');
  return supabase;
}
const refresh = () => { revalidatePath('/admin', 'layout'); revalidatePath('/me', 'layout'); };

export async function createSeasonInvoices(fd: FormData): Promise<void> {
  const season = String(fd.get('season_id') ?? '');
  const p = z.object({
    season_id: uuid, from: month, to: month, fee: euros, issue: date, due: date,
    description: z.string().trim().min(3, 'p_description').max(60, 'p_description'),
    players: z.array(uuid).min(1, 'p_players').max(300, 'p_players'),
  }).safeParse({ season_id: season, from: fd.get('from'), to: fd.get('to'), fee: String(fd.get('fee') ?? ''), issue: fd.get('issue'), due: fd.get('due'), description: String(fd.get('description') ?? ''), players: fd.getAll('players') });
  if (!p.success) back(season, p.error.issues[0]?.message ?? 'p_invalid');
  if (p.data.to < p.data.from) back(season, 'p_order');
  const supabase = await db(season);
  const { data, error } = await supabase.rpc('create_season_invoices', {
    p_season: p.data.season_id, p_from: p.data.from, p_to: p.data.to, p_monthly_cents: p.data.fee, p_players: p.data.players,
    p_due: p.data.due, p_issue: p.data.issue, p_description: p.data.description,
  });
  if (error) {
    console.error('[season invoices] create refused', { code: error.code, message: error.message });
    back(season, error.code === '22023' ? (/24 months/.test(error.message) ? 'p_tooLong' : /invoice date/.test(error.message) ? 'p_issueDate' : /due date/.test(error.message) ? 'p_dueDate' : 'p_invalid') : error.code === '42501' ? 'p_notAllowed' : 'p_error');
  }
  const r = ((data ?? []) as { created: number; skipped: number }[])[0] ?? { created: 0, skipped: 0 };
  refresh();
  back(season, 'p_created', { n: String(r.created), skipped: String(r.skipped) });
}

export async function markSeasonInvoicesPaid(fd: FormData): Promise<void> {
  const season = String(fd.get('season_id') ?? '');
  const p = z.object({ ids: z.array(uuid).min(1, 'p_paidNone').max(300, 'p_invalid'), paid_on: date }).safeParse({ ids: fd.getAll('ids'), paid_on: fd.get('paid_on') });
  if (!p.success) back(season, p.error.issues[0]?.message === 'p_paidNone' ? 'p_paidNone' : 'p_invalid');
  const supabase = await db(season);
  const { data, error } = await supabase.rpc('mark_invoices_paid', { p_payments: p.data.ids, p_paid_on: p.data.paid_on });
  if (error) {
    console.error('[season invoices] mark paid refused', { code: error.code, message: error.message });
    back(season, error.code === '22023' ? 'p_paidDate' : 'p_error');
  }
  refresh();
  back(season, 'p_marked', { n: String(data ?? 0) });
}
