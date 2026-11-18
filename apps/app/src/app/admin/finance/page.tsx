import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { saveBudget } from '@/app/actions/finance';
import { ResultBanner } from '@/components/ResultBanner';
import { SeasonPicker } from '@/components/admin/SeasonPicker';
import { requireArea } from '@/lib/auth';
import { COST_CATEGORIES, moneyFormat, pickSeason, type CostCategory, type Projection } from '@/lib/finance';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('fin'))('title') };
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const input = 'min-h-10 w-full rounded-control border border-line bg-raised px-3 text-end tabular-nums';

/**
 * Admin → Finance → Overview (migration 0054), for one season:
 *  - income: projected from the player invoices (collected, outstanding, still to be invoiced by the nightly job), by month;
 *  - costs: the budget and the actual expenses per category (team fees, field booking, kits, league fees, licences, other);
 *  - the expected result (projected income − budgeted costs) and the result so far (collected − actual costs).
 */
export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, locale, supabase] = await Promise.all([getTranslations('fin'), getLocale(), getSupabase()]);
  if (!supabase) return null;
  const eur = moneyFormat(locale);
  const { seasons, season } = await pickSeason(supabase, one(sp.season));
  if (!season) return <p className="rounded-card bg-raised p-6 text-muted">{t('noSeason')}</p>;

  const [{ data: proj }, { data: budgetRows }, { data: expenseRows }] = await Promise.all([
    supabase.rpc('finance_projection', { p_season: season.id }),
    supabase.from('season_budgets').select('category, amount_cents').eq('season_id', season.id),
    supabase.from('expenses').select('category, amount_cents').eq('season_id', season.id),
  ]);
  const p = proj as Projection | null;
  const collected = Number(p?.collected ?? 0), outstanding = Number(p?.outstanding ?? 0), overdue = Number(p?.overdue ?? 0), scheduled = Number(p?.scheduled ?? 0);
  const projected = collected + outstanding + scheduled;
  const budget = Object.fromEntries(COST_CATEGORIES.map((c) => [c, 0])) as Record<CostCategory, number>;
  const hasBudget = new Set<string>();
  for (const b of (budgetRows ?? []) as { category: CostCategory; amount_cents: number }[]) { budget[b.category] = b.amount_cents; hasBudget.add(b.category); }
  const actual = Object.fromEntries(COST_CATEGORIES.map((c) => [c, 0])) as Record<CostCategory, number>;
  for (const e of (expenseRows ?? []) as { category: CostCategory; amount_cents: number }[]) actual[e.category] += e.amount_cents;
  const budgetTotal = COST_CATEGORIES.reduce((a, c) => a + budget[c], 0), actualTotal = COST_CATEGORIES.reduce((a, c) => a + actual[c], 0);
  const expected = projected - Math.max(budgetTotal, actualTotal), soFar = collected - actualTotal;
  const months = (p?.by_month ?? []).map((m) => ({ ...m, collected: Number(m.collected), outstanding: Number(m.outstanding), scheduled: Number(m.scheduled) }));
  const maxMonth = Math.max(1, ...months.map((m) => m.collected + m.outstanding + m.scheduled));
  const monthName = new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const sign = (c: number) => (c > 0 ? `+${eur(c)}` : eur(c));

  const Tile = ({ k, value, sub, tone = 'plain' }: { k: string; value: string; sub?: string; tone?: 'plain' | 'good' | 'bad' | 'hero' }) => (
    <div className={`rounded-card p-4 ${tone === 'hero' ? 'bg-ink-950 text-white' : tone === 'bad' ? 'bg-danger/10' : tone === 'good' ? 'bg-accent/10' : 'bg-surface'}`} data-tile={k}>
      <p className={`text-sm ${tone === 'hero' ? 'text-white/75' : 'text-muted'}`}>{t(`t_${k}` as 't_projected')}</p>
      <p className={`font-display text-2xl font-black tabular-nums ${tone === 'bad' ? 'text-danger' : ''}`} data-value>{value}</p>
      {sub ? <p className={`text-xs ${tone === 'hero' ? 'text-white/75' : 'text-muted'}`}>{sub}</p> : null}
    </div>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
        </div>
        <SeasonPicker seasons={seasons} current={season.id} label={t('season')} action="/admin/finance" />
      </header>
      <ResultBanner ns="fin" result={sp.result} />

      {/* ---------- income ---------- */}
      <section className="grid gap-4 rounded-card border border-line bg-raised p-6" aria-labelledby="inc-h" data-income>
        <div>
          <h2 id="inc-h" className="font-display text-xl font-extrabold">{t('incomeTitle', { season: season.name })}</h2>
          <p className="text-sm text-muted">{t('incomeLead')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile k="projected" value={eur(projected)} tone="hero" sub={t('t_projectedSub', { count: Number(p?.invoices ?? 0) + Number(p?.scheduled_count ?? 0) })} />
          <Tile k="collected" value={eur(collected)} tone="good" sub={t('t_collectedSub', { pct: pct(collected, projected) })} />
          <Tile k="outstanding" value={eur(outstanding)} tone={overdue ? 'bad' : 'plain'} sub={overdue ? t('t_overdueSub', { amount: eur(overdue) }) : t('t_noOverdue')} />
          <Tile k="scheduled" value={eur(scheduled)} sub={t('t_scheduledSub', { count: Number(p?.scheduled_count ?? 0) })} />
        </div>
        {/* one measure: share of the projection already collected */}
        <div data-collected-meter>
          <div className="flex justify-between text-sm"><span className="font-semibold">{t('collectedMeter')}</span><span className="tabular-nums">{pct(collected, projected)} %</span></div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-line" role="img" aria-label={t('collectedMeterAria', { collected: eur(collected), projected: eur(projected) })}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, pct(collected, projected))}%` }} />
          </div>
        </div>
        {months.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-months>
              <caption className="mb-2 text-start font-display font-bold">{t('byMonth')}</caption>
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>{['m_month', 'm_collected', 'm_outstanding', 'm_scheduled', 'm_total'].map((k) => <th key={k} scope="col" className={`px-2 py-2 ${k === 'm_month' ? 'text-start' : 'text-end'}`}>{t(k as 'm_month')}</th>)}<th scope="col" className="w-1/4 px-2 py-2"><span className="sr-only">{t('m_bar')}</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {months.map((m) => {
                  const total = m.collected + m.outstanding + m.scheduled;
                  return (
                    <tr key={m.month} data-month={m.month}>
                      <th scope="row" className="whitespace-nowrap px-2 py-2 text-start font-semibold">{monthName.format(new Date(`${m.month}-15T12:00:00Z`))}</th>
                      <td className="px-2 py-2 text-end tabular-nums">{m.collected ? eur(m.collected) : '–'}</td>
                      <td className="px-2 py-2 text-end tabular-nums">{m.outstanding ? eur(m.outstanding) : '–'}</td>
                      <td className="px-2 py-2 text-end tabular-nums">{m.scheduled ? eur(m.scheduled) : '–'}</td>
                      <td className="px-2 py-2 text-end font-semibold tabular-nums">{eur(total)}</td>
                      <td className="px-2 py-2" title={eur(total)}><div className="h-2 rounded-e bg-accent/70" style={{ width: `${Math.max(2, (total / maxMonth) * 100)}%` }} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted" data-no-income>{t('noIncome')}</p>}
      </section>

      {/* ---------- costs ---------- */}
      <section className="grid gap-4 rounded-card border border-line bg-raised p-6" aria-labelledby="cost-h" data-costs>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="cost-h" className="font-display text-xl font-extrabold">{t('costsTitle', { season: season.name })}</h2>
            <p className="text-sm text-muted">{t('costsLead')}</p>
          </div>
          <a href={`/admin/finance/expenses?season=${season.id}`} className="inline-flex min-h-10 items-center rounded-full border-2 border-fg px-4 text-sm font-bold hover:bg-fg hover:text-raised">{t('toExpenses')}</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-budget-table>
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>{['c_category', 'c_budget', 'c_actual', 'c_left'].map((k) => <th key={k} scope="col" className={`px-2 py-2 ${k === 'c_category' ? 'text-start' : 'text-end'}`}>{t(k as 'c_budget')}</th>)}<th scope="col" className="w-1/4 px-2 py-2 text-start">{t('c_used')}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {COST_CATEGORIES.map((c) => {
                const b = budget[c], a = actual[c], over = a > b && hasBudget.has(c), used = b ? pct(a, b) : 0;
                return (
                  <tr key={c} data-category={c} data-over={over || undefined}>
                    <th scope="row" className="px-2 py-2 text-start font-semibold">{t(`cat_${c}`)}</th>
                    <td className="px-2 py-2 text-end tabular-nums">{hasBudget.has(c) ? eur(b) : '–'}</td>
                    <td className="px-2 py-2 text-end tabular-nums">{a ? eur(a) : '–'}</td>
                    <td className={`px-2 py-2 text-end tabular-nums ${over ? 'font-bold text-danger' : ''}`}>{hasBudget.has(c) ? eur(b - a) : '–'}</td>
                    <td className="px-2 py-2">
                      {hasBudget.has(c) ? (
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-line" role="img" aria-label={t('usedAria', { pct: used })}>
                            <div className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${Math.min(100, used)}%` }} />
                          </div>
                          <span className={`w-20 text-xs tabular-nums ${over ? 'font-bold text-danger' : 'text-muted'}`}>{over ? t('overBudget') : `${used} %`}</span>
                        </div>
                      ) : <span className="text-xs text-muted">{t('noBudget')}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-line font-bold">
              <tr data-cost-total>
                <th scope="row" className="px-2 py-2 text-start">{t('total')}</th>
                <td className="px-2 py-2 text-end tabular-nums">{eur(budgetTotal)}</td>
                <td className="px-2 py-2 text-end tabular-nums">{eur(actualTotal)}</td>
                <td className={`px-2 py-2 text-end tabular-nums ${actualTotal > budgetTotal ? 'text-danger' : ''}`}>{eur(budgetTotal - actualTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <details className="rounded-card bg-surface p-4" data-budget-editor open={!budgetTotal || undefined}>
          <summary className="cursor-pointer font-semibold">{t('editBudget', { season: season.name })}</summary>
          <form action={saveBudget} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="season_id" value={season.id} />
            {COST_CATEGORIES.map((c) => (
              <label key={c} className="grid gap-1 text-sm font-semibold">{t(`cat_${c}`)}
                <input name={`budget_${c}`} inputMode="decimal" defaultValue={hasBudget.has(c) ? String(budget[c] / 100).replace('.', ',') : ''} placeholder="0" className={input} data-budget={c} /></label>
            ))}
            <p className="text-xs text-muted sm:col-span-2 lg:col-span-3">{t('budgetHint')}</p>
            <button className="min-h-10 justify-self-start rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">{t('saveBudget')}</button>
          </form>
        </details>
      </section>

      {/* ---------- result ---------- */}
      <section className="grid gap-3 rounded-card border border-line bg-raised p-6" aria-labelledby="res-h" data-result>
        <h2 id="res-h" className="font-display text-xl font-extrabold">{t('resultTitle')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Tile k="expected" value={sign(expected)} tone={expected < 0 ? 'bad' : 'good'} sub={t('t_expectedSub', { income: eur(projected), costs: eur(Math.max(budgetTotal, actualTotal)) })} />
          <Tile k="soFar" value={sign(soFar)} tone={soFar < 0 ? 'bad' : 'good'} sub={t('t_soFarSub', { income: eur(collected), costs: eur(actualTotal) })} />
        </div>
        <p className="text-xs text-muted">{t('resultNote')}</p>
      </section>
    </div>
  );
}
