import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { addExpense, deleteExpense } from '@/app/actions/finance';
import { ResultBanner } from '@/components/ResultBanner';
import { SeasonPicker } from '@/components/admin/SeasonPicker';
import { requireArea } from '@/lib/auth';
import { dateFormats } from '@/lib/format';
import { COST_CATEGORIES, moneyFormat, pickSeason, type CostCategory } from '@/lib/finance';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('fin'))('expTitle') };
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const input = 'min-h-10 w-full rounded-control border border-line bg-raised px-3';
type Expense = { id: string; category: CostCategory; amount_cents: number; incurred_on: string; description: string | null };

/** Admin → Finance → Expenses (migration 0054): record what the club spends, per category, for a season. */
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, locale, fmt, supabase] = await Promise.all([getTranslations('fin'), getLocale(), dateFormats(), getSupabase()]);
  if (!supabase) return null;
  const eur = moneyFormat(locale);
  const { seasons, season } = await pickSeason(supabase, one(sp.season));
  if (!season) return <p className="rounded-card bg-raised p-6 text-muted">{t('noSeason')}</p>;
  const cat = COST_CATEGORIES.find((c) => c === one(sp.category));
  let query = supabase.from('expenses').select('id, category, amount_cents, incurred_on, description').eq('season_id', season.id).order('incurred_on', { ascending: false }).limit(500);
  if (cat) query = query.eq('category', cat);
  const { data } = await query;
  const rows = (data ?? []) as Expense[];
  const today = helsinkiToday();
  const defaultDay = today >= season.starts_on && today <= season.ends_on ? today : season.ends_on < today ? season.ends_on : season.starts_on;
  const href = (c?: string) => `/admin/finance/expenses?${new URLSearchParams({ season: season.id, ...(c ? { category: c } : {}) })}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">{t('expTitle')}</h1>
          <p className="mt-1 max-w-3xl text-muted">{t('expLead')}</p>
        </div>
        <SeasonPicker seasons={seasons} current={season.id} label={t('season')} action="/admin/finance/expenses" />
      </header>
      <ResultBanner ns="fin" result={sp.result} />

      <section className="rounded-card border-2 border-accent bg-raised p-6" aria-labelledby="add-h">
        <h2 id="add-h" className="font-display text-lg font-extrabold">{t('expAdd', { season: season.name })}</h2>
        <form action={addExpense} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1fr_2fr_auto] lg:items-end" data-expense-form>
          <input type="hidden" name="season_id" value={season.id} />
          <label className="grid gap-1 text-sm font-semibold">{t('e_date')}<input type="date" name="incurred_on" required defaultValue={defaultDay} className={input} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('e_category')}
            <select name="category" required defaultValue={cat ?? ''} className={input}><option value="" disabled>{t('choose')}</option>{COST_CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat_${c}`)}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">{t('e_amount')}<input name="amount" required inputMode="decimal" placeholder="0,00" className={`${input} text-end`} data-expense-amount /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('e_description')}<input name="description" maxLength={200} placeholder={t('e_descriptionEg')} className={input} /></label>
          <button className="min-h-10 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">{t('e_add')}</button>
        </form>
      </section>

      <section className="rounded-card border border-line bg-raised p-4 sm:p-6" aria-labelledby="list-h">
        <h2 id="list-h" className="font-display text-lg font-extrabold">{t('expList')}</h2>
        <nav className="mt-3 flex flex-wrap gap-2" aria-label={t('e_category')}>
          {[undefined, ...COST_CATEGORIES].map((c) => (
            <a key={c ?? 'all'} href={href(c)} aria-current={c === cat ? 'page' : undefined} data-exp-filter={c ?? 'all'}
              className={`inline-flex min-h-9 items-center rounded-full border-2 px-3 text-sm font-semibold ${c === cat ? 'border-accent bg-accent text-on-accent' : 'border-line hover:border-accent'}`}>{c ? t(`cat_${c}`) : t('all')}</a>
          ))}
        </nav>
        {rows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm" data-expenses>
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr><th scope="col" className="px-2 py-2 text-start">{t('e_date')}</th><th scope="col" className="px-2 py-2 text-start">{t('e_category')}</th><th scope="col" className="px-2 py-2 text-start">{t('e_description')}</th><th scope="col" className="px-2 py-2 text-end">{t('e_amount')}</th><th scope="col"><span className="sr-only">{t('b_actions')}</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((e) => (
                  <tr key={e.id} data-expense={e.category}>
                    <td className="whitespace-nowrap px-2 py-2">{fmt.date.format(new Date(`${e.incurred_on}T12:00:00Z`))}</td>
                    <td className="px-2 py-2">{t(`cat_${e.category}`)}</td>
                    <td className="px-2 py-2" dir="auto">{e.description ?? '–'}</td>
                    <td className="px-2 py-2 text-end tabular-nums">{eur(e.amount_cents)}</td>
                    <td className="px-2 py-2 text-end">
                      <form action={deleteExpense}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="season_id" value={season.id} />
                        <button className="min-h-8 rounded-full border border-danger px-3 text-xs font-bold text-danger hover:bg-danger/10" data-delete-expense>{t('e_delete')}</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line font-bold">
                <tr data-exp-sum><th scope="row" colSpan={3} className="px-2 py-2 text-start">{t('total')}</th><td className="px-2 py-2 text-end tabular-nums">{eur(rows.reduce((a, e) => a + e.amount_cents, 0))}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        ) : <p className="mt-3 text-muted" data-exp-empty>{t('expNone')}</p>}
      </section>
    </div>
  );
}
