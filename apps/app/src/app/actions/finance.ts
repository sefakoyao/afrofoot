'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { COST_CATEGORIES } from '@/lib/finance';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Admin → Finance: the season budget per cost category and the expenses (migration 0054). Checks mirror the tables:
 * amounts EUR 0–100 000 (budget) and EUR 0.01–100 000 (expense), descriptions up to 200 characters. RLS: admins only.
 */
const uuid = z.string().uuid();
/** "1200", "1 200", "1200,50" → cents */
const cents = (min: number) => z.string().transform((v) => v.replace(/[\s ]/g, ''))
  .pipe(z.string().regex(/^\d{1,6}([.,]\d{1,2})?$/, 'r_amount')).transform((v) => Math.round(Number(v.replace(',', '.')) * 100))
  .pipe(z.number().int().min(min, 'r_amount').max(10000000, 'r_amount'));

function back(path: string, result: string, season?: string): never {
  const url = new URL(path, 'http://x');
  if (season) url.searchParams.set('season', season);
  url.searchParams.set('result', result);
  redirect(url.pathname + url.search);
}
async function db(path: string) {
  await requireArea('admin');
  const supabase = await getSupabase();
  if (!supabase) back(path, 'r_error');
  return supabase;
}

/** The six budget lines of a season at once; an empty field means no budget for that category. */
export async function saveBudget(fd: FormData): Promise<void> {
  const season = uuid.safeParse(fd.get('season_id'));
  if (!season.success) back('/admin/finance', 'r_invalid');
  const rows: { season_id: string; category: string; amount_cents: number }[] = [];
  const empty: string[] = [];
  for (const c of COST_CATEGORIES) {
    const raw = String(fd.get(`budget_${c}`) ?? '').trim();
    if (!raw) { empty.push(c); continue; }
    const p = cents(0).safeParse(raw);
    if (!p.success) back('/admin/finance', 'r_amount', season.data);
    rows.push({ season_id: season.data, category: c, amount_cents: p.data });
  }
  const supabase = await db('/admin/finance');
  if (rows.length) {
    const { error } = await supabase.from('season_budgets').upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    if (error) { console.error('[finance] budget refused', { code: error.code }); back('/admin/finance', 'r_error', season.data); }
  }
  if (empty.length) await supabase.from('season_budgets').delete().eq('season_id', season.data).in('category', empty);
  revalidatePath('/admin/finance');
  back('/admin/finance', 'r_budgetSaved', season.data);
}

const expenseSchema = z.object({
  season_id: uuid,
  category: z.enum(COST_CATEGORIES),
  amount: cents(1),
  incurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'r_date'),
  description: z.string().trim().max(200, 'r_text'),
});

export async function addExpense(fd: FormData): Promise<void> {
  const p = expenseSchema.safeParse(Object.fromEntries(['season_id', 'category', 'amount', 'incurred_on', 'description'].map((k) => [k, String(fd.get(k) ?? '')])));
  const season = String(fd.get('season_id') ?? '');
  if (!p.success) back('/admin/finance/expenses', p.error.issues[0]?.message?.startsWith('r_') ? p.error.issues[0].message : 'r_invalid', uuid.safeParse(season).success ? season : undefined);
  const v = p.data;
  const me = await requireArea('admin');
  const supabase = await db('/admin/finance/expenses');
  const { error } = await supabase.from('expenses').insert({
    season_id: v.season_id, category: v.category, amount_cents: v.amount, incurred_on: v.incurred_on, description: v.description || null, recorded_by: me.id,
  });
  if (error) { console.error('[finance] expense refused', { code: error.code }); back('/admin/finance/expenses', 'r_error', v.season_id); }
  revalidatePath('/admin/finance', 'layout');
  back('/admin/finance/expenses', 'r_expenseAdded', v.season_id);
}

export async function deleteExpense(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('id'));
  const season = String(fd.get('season_id') ?? '');
  if (!id.success) back('/admin/finance/expenses', 'r_invalid');
  const supabase = await db('/admin/finance/expenses');
  const { data, error } = await supabase.from('expenses').delete().eq('id', id.data).select('id');
  if (error || !data?.length) back('/admin/finance/expenses', 'r_error', uuid.safeParse(season).success ? season : undefined);
  revalidatePath('/admin/finance', 'layout');
  back('/admin/finance/expenses', 'r_expenseDeleted', uuid.safeParse(season).success ? season : undefined);
}
