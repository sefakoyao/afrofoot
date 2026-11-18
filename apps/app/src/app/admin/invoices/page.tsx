import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { CURRENCY, LOCALE_LABELS, isLocale } from '@afrofoot/i18n';
import { addMembership, addPastDue, createBalanceInvoices, createPlan, deleteReceipt, markPaid, recordPartPayment, removePastDue, runInvoicingNow, saveBilling, setAutoRenew, setPlanActive } from '@/app/actions/invoices';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { dateFormats } from '@/lib/format';
import { formatIban, ibanValid } from '@/lib/invoice/barcode';
import { BALANCE_ROWS } from '@/lib/finance';
import { loadBilling } from '@/lib/invoice/data';
import { INVOICE_STATUSES, effectiveStatus, listInvoices, parseFilters } from '@/lib/invoice/list';
import { getSupabase } from '@/lib/supabase/server';
import { addDays, helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('inv'))('title') };
}

const PERIODS = ['month', 'quarter', 'year', 'season', 'one_off'] as const;
const input = 'min-h-10 w-full rounded-control border border-line bg-raised px-3';
const btn = 'min-h-10 rounded-full bg-accent px-5 font-bold text-on-accent hover:brightness-110';
const BADGE: Record<string, string> = { paid: 'bg-accent/20 text-pitch', pending: 'bg-line', failed: 'bg-danger/10 text-danger', refunded: 'bg-line text-muted', overdue: 'bg-danger/10 text-danger' };

type MembershipRow = { id: string; status: string; auto_renew: boolean; next_due_on: string | null; players: { first_name: string; last_name: string }; membership_plans: { name: string; amount_cents: number; period: string } };

/** Admin → Invoices. The nightly job (pg_cron, migration 0027) issues the invoices; this page sets it up and follows it. */
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, fmt, rawLocale, supabase] = await Promise.all([getTranslations('inv'), dateFormats(), getLocale(), getSupabase()]);
  if (!supabase) return null;
  const tag = isLocale(rawLocale) ? LOCALE_LABELS[rawLocale].intl : 'en-GB';
  const money = new Intl.NumberFormat(tag, { style: 'currency', currency: CURRENCY });
  const eur = (c: number) => money.format(c / 100);
  const day = (iso: string | null) => (iso ? fmt.date.format(new Date(`${iso}T12:00:00Z`)) : '–');
  const today = helsinkiToday();

  const filters = parseFilters(sp);
  const balanceFor = typeof sp.for === 'string' && /^[0-9a-f-]{36}$/.test(sp.for) ? sp.for : '';
  const [billing, list, { data: memberships }, { data: plans }, { data: players }, { data: season }] = await Promise.all([
    loadBilling(supabase),
    listInvoices(supabase, filters, today),
    supabase.from('memberships').select('id, status, auto_renew, next_due_on, players!inner(first_name, last_name), membership_plans!inner(name, amount_cents, period), seasons!inner(is_current)').eq('seasons.is_current', true).order('next_due_on', { nullsFirst: false }),
    supabase.from('membership_plans').select('id, name, amount_cents, period, active').order('active', { ascending: false }).order('name'),
    supabase.from('players').select('id, first_name, last_name').order('last_name'),
    supabase.from('seasons').select('name').eq('is_current', true).maybeSingle(),
  ]);
  // 0053: past-due lines of the invoices on this page, and the previous season's name for the default description
  const ids = list.rows.map((r) => r.id);
  const [{ data: pastRows }, { data: seasonRows }] = await Promise.all([
    ids.length ? supabase.from('payment_lines').select('id, payment_id, description, unit_price_cents, kind').in('kind', ['past_due', 'balance']).in('payment_id', ids).order('position') : Promise.resolve({ data: [] }),
    supabase.from('seasons').select('id, name, starts_on, is_current').order('starts_on', { ascending: false }).limit(20),
  ]);
  // 0056: payments received on the invoices of this page
  const { data: receiptRows } = ids.length ? await supabase.from('payment_receipts').select('id, payment_id, amount_cents, paid_on, note').in('payment_id', ids).order('paid_on') : { data: [] };
  const receipts = new Map<string, { id: string; cents: number; on: string; note: string | null }[]>();
  for (const r of (receiptRows ?? []) as { id: string; payment_id: string; amount_cents: number; paid_on: string; note: string | null }[]) {
    receipts.set(r.payment_id, [...(receipts.get(r.payment_id) ?? []), { id: r.id, cents: r.amount_cents, on: r.paid_on, note: r.note }]);
  }
  const pastDue = new Map<string, { id: string; description: string; cents: number }[]>();
  const balanceTitle = new Map<string, string>();
  for (const l of (pastRows ?? []) as { id: string; payment_id: string; description: string; unit_price_cents: number; kind: string }[]) {
    if (l.kind === 'balance') { if (!balanceTitle.has(l.payment_id)) balanceTitle.set(l.payment_id, l.description); continue; }
    pastDue.set(l.payment_id, [...(pastDue.get(l.payment_id) ?? []), { id: l.id, description: l.description, cents: l.unit_price_cents }]);
  }
  const seasonList = (seasonRows ?? []) as { id: string; name: string; starts_on: string; is_current: boolean }[];
  const cur = seasonList.findIndex((x) => x.is_current);
  const previousSeason = cur >= 0 ? seasonList[cur + 1]?.name : undefined;
  const pastDueDefault = previousSeason ? t('pastDueDefault', { season: previousSeason }) : t('pastDueDefaultNoSeason');
  const ready = ibanValid(billing.iban) && !!billing.legal_name;
  // 0036: due memberships waiting for the player's contract signature or Code of Conduct consent
  const { data: holdRows } = await supabase.rpc('invoice_holds');
  const holds = (holdRows ?? []) as { membership_id: string; player_id: string; player_name: string; next_due_on: string; missing: ('conduct' | 'contract')[] }[];
  const firstOfNextMonth = (() => { const [y, m] = today.split('-').map(Number) as [number, number]; return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); })();
  const result = typeof sp.result === 'string' ? sp.result : '';
  const playerName = filters.player ? (players ?? []).find((p) => p.id === filters.player) : null;
  /** Address of the list with the current filters, changed by `over` (page resets unless given). */
  const listUrl = (over: Record<string, string | number> = {}) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: filters.q, status: filters.status, month: filters.month, player: filters.player, ...over })) if (v !== '' && v !== undefined) u.set(k, String(v));
    return `/admin/invoices${u.size ? `?${u}` : ''}`;
  };
  const back = `${listUrl(filters.page > 1 ? { page: filters.page } : {})}#list-h`;
  const filtered = !!(filters.q || filters.status || filters.month || filters.player);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 text-muted">{t('lead')}</p>
      </header>
      {result === 'r_ran' ? <p role="status" className="rounded-card bg-accent/15 p-3 font-semibold text-pitch">{t('r_ran', { count: Number(sp.n) || 0 })}</p> : <ResultBanner ns="inv" result={sp.result} />}

      {/* 1. status */}
      <section className={`rounded-card border-2 p-6 ${ready ? 'border-line bg-raised' : 'border-danger/40 bg-danger/5'}`} aria-labelledby="auto-h">
        <h2 id="auto-h" className="font-display text-xl font-extrabold">{t('autoTitle')}</h2>
        {ready ? <p className="mt-1">{t('autoReady', { lead: billing.lead_days, terms: billing.payment_terms_days })}</p>
          : <p role="alert" className="mt-1 font-semibold text-danger">{t('autoNotReady')}</p>}
        <form action={runInvoicingNow} className="mt-3">
          <button className={btn} disabled={!ready}>{t('runNow')}</button>
        </form>
        <p className="mt-2 text-xs text-muted">{t('runNowNote')}</p>
        {billing.require_consents ? <p className="mt-2 text-sm">{t('holdRule')}</p> : null}
        {holds.length ? (
          <div className="mt-4 rounded-card border-2 border-danger/30 bg-danger/5 p-4" data-holds>
            <h3 className="font-display font-extrabold">{t('holdsTitle', { count: holds.length })}</h3>
            <p className="text-sm text-muted">{t('holdsLead')}</p>
            <ul className="mt-2 divide-y divide-line">
              {holds.map((h) => (
                <li key={h.membership_id} className="flex flex-wrap items-center gap-2 py-2 text-sm" data-hold={h.player_name}>
                  <bdi className="font-semibold">{h.player_name}</bdi>
                  <span className="text-muted">{t('holdDue', { date: day(h.next_due_on) })}</span>
                  {h.missing.map((m) => <span key={m} className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger" data-missing={m}>{t(`holdMissing_${m}`)}</span>)}
                  {h.missing.includes('contract') ? <a href={`/admin/contracts?player=${h.player_id}`} className="font-semibold text-pitch underline underline-offset-2">{t('holdOpenContracts')}</a> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* 2. invoices: search, filters, totals, paging */}
      {/* 0055: balance invoices typed in by hand, one invoice per row */}
      <section id="balance" className="scroll-mt-4 rounded-card border border-line bg-raised p-6" aria-labelledby="bal-h" data-balance-invoices>
        <details open={!!balanceFor || undefined}>
          <summary className="cursor-pointer list-none">
            <h2 id="bal-h" className="inline font-display text-xl font-extrabold">+ {t('balTitle')}</h2>
            <p className="mt-1 text-sm text-muted">{t('balLead')}</p>
          </summary>
          <form action={createBalanceInvoices} className="mt-4 grid gap-4" data-balance-form>
            <input type="hidden" name="back" value="/admin/invoices#balance" />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">{t('balPlayer')}
                <select name="player_id" required defaultValue={balanceFor} className={input} data-balance-player>
                  <option value="" disabled>{t('choose')}</option>
                  {(players ?? []).map((p) => <option key={p.id} value={p.id}>{p.last_name} {p.first_name}</option>)}
                </select></label>
              <label className="grid gap-1 text-sm font-semibold">{t('balDue')}
                <input type="date" name="due_on" required defaultValue={addDays(today, billing.payment_terms_days || 14)} className={input} /></label>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-semibold">{t('balItems')}</legend>
              <div className="hidden grid-cols-[10rem_minmax(0,1fr)_8rem] gap-2 text-xs font-bold uppercase tracking-wide text-muted sm:grid" aria-hidden>
                <span>{t('balSeason')}</span><span>{t('balDescription')}</span><span className="text-end">{t('pastDueAmount')}</span>
              </div>
              {Array.from({ length: BALANCE_ROWS }, (_, i) => (
                <div key={i} className="grid gap-2 rounded-control bg-surface p-2 sm:grid-cols-[10rem_minmax(0,1fr)_8rem] sm:bg-transparent sm:p-0" data-balance-row={i}>
                  <label className="grid gap-1 text-xs font-semibold sm:block"><span className="sm:sr-only">{t('balSeason')} {i + 1}</span>
                    <select name={`season_${i}`} defaultValue="" className={input}><option value="">{t('balNoSeason')}</option>{seasonList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                  <label className="grid gap-1 text-xs font-semibold sm:block"><span className="sm:sr-only">{t('balDescription')} {i + 1}</span>
                    <input name={`description_${i}`} maxLength={200} lang="en" dir="ltr" placeholder={i === 0 ? t('balEg1') : i === 1 ? t('balEg2') : ''} className={input} /></label>
                  <label className="grid gap-1 text-xs font-semibold sm:block"><span className="sm:sr-only">{t('pastDueAmount')} {i + 1}</span>
                    <input name={`amount_${i}`} inputMode="decimal" placeholder="0,00" className={`${input} text-end`} /></label>
                </div>
              ))}
            </fieldset>
            <p className="text-xs text-muted">{t('balHint')}</p>
            <button className={`${btn} justify-self-start`}>{t('balCreate')}</button>
          </form>
        </details>
      </section>

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="list-h">
        <h2 id="list-h" className="scroll-mt-4 font-display text-xl font-extrabold">{playerName ? t('invoicesOf', { name: `${playerName.first_name} ${playerName.last_name}` }) : t('invoices')}</h2>
        <form role="search" action="/admin/invoices#list-h" className="mt-3 grid gap-3 rounded-card bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end">
          {filters.player ? <input type="hidden" name="player" value={filters.player} /> : null}
          <label className="grid gap-1 text-sm font-semibold">{t('search')}<input name="q" type="search" defaultValue={filters.q} maxLength={60} placeholder={t('searchEg')} className={input} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('colStatus')}
            <select name="status" defaultValue={filters.status} className={input}><option value="">{t('all')}</option>{INVOICE_STATUSES.map((s) => <option key={s} value={s}>{t(`st_${s === 'open' ? 'pending' : s}` as 'st_paid')}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">{t('month')}<input name="month" type="month" defaultValue={filters.month} className={input} /></label>
          <div className="flex gap-2">
            <button className={btn}>{t('filter')}</button>
            {filtered ? <a href="/admin/invoices#list-h" className="inline-flex min-h-10 items-center rounded-full border border-line px-4 font-semibold hover:border-accent">{t('clear')}</a> : null}
          </div>
        </form>

        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm" data-totals>
          {(['open', 'overdue', 'paid'] as const).map((s) => (
            <div key={s} className={`rounded-card p-3 ${s === 'overdue' && list.totals.overdue.n ? 'bg-danger/10' : s === 'paid' ? 'bg-accent/10' : 'bg-surface'}`} data-total={s}>
              <dt className="text-muted">{t(`st_${s === 'open' ? 'pending' : s}` as 'st_paid')} ({list.totals[s].n})</dt>
              <dd className="font-display text-lg font-black">{eur(list.totals[s].cents)}</dd>
            </div>
          ))}
        </dl>

        {list.rows.length === 0 ? <p className="mt-3 text-muted">{filtered ? t('noMatch') : t('noInvoices')}</p> : (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>{['colNumber', 'colPlayer', 'colIssued', 'colAmount', 'colDue', 'colStatus'].map((k) => <th key={k} scope="col" className="px-2 py-2 text-start">{t(k as 'colNumber')}</th>)}<th scope="col" className="px-2 py-2"><span className="sr-only">{t('colActions')}</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.rows.map((r) => {
                  const st = effectiveStatus(r.status, r.dueOn, today);
                  return (
                    <tr key={r.id} data-invoice={r.invoiceNumber}>
                      <td className="px-2 py-2 font-semibold" dir="ltr">{r.invoiceNumber}</td>
                      <td className="px-2 py-2"><a href={listUrl({ player: r.playerId }) + '#list-h'} className="underline-offset-2 hover:underline"><bdi>{r.playerName}</bdi></a>
                        {balanceTitle.get(r.id) ? <span className="block text-xs text-muted" data-balance-title><bdi>{balanceTitle.get(r.id)}</bdi></span> : null}</td>
                      <td className="whitespace-nowrap px-2 py-2">{fmt.date.format(new Date(r.issuedAt))}</td>
                      <td className="whitespace-nowrap px-2 py-2">{eur(r.amountCents)}
                        {r.status !== 'paid' && r.paidCents > 0 ? <span className="block text-xs font-semibold text-pitch" data-part-paid>{t('partPaidOf', { paid: eur(r.paidCents), left: eur(r.amountCents - r.paidCents) })}</span> : null}
                        {pastDue.get(r.id)?.length ? <span className="block text-xs text-muted" data-past-due-total>{t('pastDueIncl', { amount: eur(pastDue.get(r.id)!.reduce((a, l) => a + l.cents, 0)) })}</span> : null}</td>
                      <td className="whitespace-nowrap px-2 py-2">{day(r.dueOn)}</td>
                      <td className="px-2 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[st === 'open' ? 'pending' : st] ?? ''}`} data-status-badge={st}>{t(`st_${st === 'open' ? 'pending' : st}` as 'st_paid')}</span>
                        {st !== 'paid' && r.paidCents > 0 ? <span className="mt-1 block w-fit rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-pitch" data-part-badge>{t('st_partial')}</span> : null}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          <a href={`/invoices/${r.id}`} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center rounded-full border border-line px-3 font-semibold hover:border-accent">PDF</a>
                          {r.status === 'pending' || r.status === 'failed' ? (
                            <details className="group relative" data-past-due={r.invoiceNumber}>
                              <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-line px-3 font-semibold hover:border-accent">{t('pastDue')}</summary>
                              <div className="mt-2 grid w-72 max-w-[80vw] gap-3 rounded-card border border-line bg-raised p-3 text-start shadow-sm">
                                <p className="text-xs text-muted">{t('pastDueLead')}</p>
                                {pastDue.get(r.id)?.map((l) => (
                                  <form key={l.id} action={removePastDue} className="flex items-center gap-2 rounded-control bg-surface p-2" data-past-due-line>
                                    <input type="hidden" name="line_id" value={l.id} /><input type="hidden" name="back" value={back} />
                                    <span className="min-w-0 flex-1"><bdi>{l.description}</bdi> · <span className="font-semibold">{eur(l.cents)}</span></span>
                                    <button className="min-h-8 rounded-full border border-danger px-3 text-xs font-bold text-danger hover:bg-danger/10" data-remove-past-due>{t('pastDueRemove')}</button>
                                  </form>
                                ))}
                                <form action={addPastDue} className="grid gap-2" data-past-due-form>
                                  <input type="hidden" name="payment_id" value={r.id} /><input type="hidden" name="back" value={back} />
                                  <label className="grid gap-1 text-xs font-semibold">{t('pastDueText')}
                                    <input name="description" required minLength={3} maxLength={200} defaultValue={pastDueDefault} lang="en" dir="ltr" className={input} /></label>
                                  <label className="grid gap-1 text-xs font-semibold">{t('pastDueAmount')}
                                    <input name="amount" required inputMode="decimal" pattern="\d{1,4}([.,]\d{1,2})?" placeholder="60,00" className={input} data-past-due-amount /></label>
                                  <button className={btn}>{t('pastDueAdd')}</button>
                                </form>
                              </div>
                            </details>
                          ) : null}
                          {r.status === 'pending' || r.status === 'failed' ? (
                            <form action={markPaid}><input type="hidden" name="payment_id" value={r.id} /><input type="hidden" name="back" value={back} />
                              <button className="min-h-9 rounded-full bg-accent px-3 font-bold text-on-accent hover:brightness-110" data-mark-paid>{r.paidCents > 0 ? t('markPaidRest', { amount: eur(r.amountCents - r.paidCents) }) : t('markPaid')}</button></form>
                          ) : null}
                          {r.status === 'pending' || r.status === 'failed' || receipts.get(r.id)?.length ? (
                            <details className="w-full" data-payments={r.invoiceNumber}>
                              <summary className="ms-auto inline-flex min-h-9 cursor-pointer list-none items-center rounded-full border border-line px-3 font-semibold hover:border-accent">{t('payments', { count: receipts.get(r.id)?.length ?? 0 })}</summary>
                              <div className="ms-auto mt-2 grid w-72 max-w-[80vw] gap-3 rounded-card border border-line bg-raised p-3 text-start shadow-sm">
                                {receipts.get(r.id)?.map((x) => (
                                  <form key={x.id} action={deleteReceipt} className="flex items-center gap-2 rounded-control bg-surface p-2 text-xs" data-receipt>
                                    <input type="hidden" name="receipt_id" value={x.id} /><input type="hidden" name="back" value={back} />
                                    <span className="min-w-0 flex-1"><span className="font-bold">{eur(x.cents)}</span> · {day(x.on)}{x.note ? <> · <bdi>{x.note}</bdi></> : null}</span>
                                    <button className="min-h-8 rounded-full border border-danger px-2 font-bold text-danger hover:bg-danger/10" data-delete-receipt>{t('pastDueRemove')}</button>
                                  </form>
                                ))}
                                {r.status === 'pending' || r.status === 'failed' ? (
                                  <form action={recordPartPayment} className="grid gap-2" data-part-form>
                                    <input type="hidden" name="payment_id" value={r.id} /><input type="hidden" name="back" value={back} />
                                    <p className="text-xs text-muted">{t('partLead', { left: eur(r.amountCents - r.paidCents) })}</p>
                                    <label className="grid gap-1 text-xs font-semibold">{t('partAmount')}
                                      <input name="amount" required inputMode="decimal" placeholder="10,00" className={input} data-part-amount /></label>
                                    <label className="grid gap-1 text-xs font-semibold">{t('partDate')}
                                      <input name="paid_on" type="date" required max={today} defaultValue={today} className={input} /></label>
                                    <label className="grid gap-1 text-xs font-semibold">{t('partNote')}
                                      <input name="note" maxLength={200} placeholder={t('partNoteEg')} className={input} /></label>
                                    <button className={btn} data-part-save>{t('partSave')}</button>
                                  </form>
                                ) : null}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted" data-count>{t('found', { count: list.count })}</span>
          {list.pages > 1 ? (
            <nav className="flex items-center gap-2" aria-label={t('pageOf', { page: filters.page, pages: list.pages })}>
              {filters.page > 1 ? <a href={listUrl({ page: filters.page - 1 }) + '#list-h'} className="rounded-full border border-line px-4 py-1.5 font-semibold hover:border-accent">{t('prev')}</a> : null}
              <span className="text-muted">{t('pageOf', { page: filters.page, pages: list.pages })}</span>
              {filters.page < list.pages ? <a href={listUrl({ page: filters.page + 1 }) + '#list-h'} className="rounded-full border border-line px-4 py-1.5 font-semibold hover:border-accent">{t('next')}</a> : null}
            </nav>
          ) : null}
        </div>
      </section>

      {/* 3. memberships */}
      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="mem-h">
        <h2 id="mem-h" className="font-display text-xl font-extrabold">{t('memberships', { season: season?.name ?? '–' })}</h2>
        <p className="mt-1 text-sm text-muted">{t('membershipsLead')}</p>
        {(memberships ?? []).length === 0 ? <p className="mt-2 text-muted">{t('noMemberships')}</p> : (
          <ul className="mt-3 divide-y divide-line">
            {(memberships as unknown as MembershipRow[]).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-membership={`${m.players.first_name} ${m.players.last_name}`}>
                <span><bdi className="font-semibold">{m.players.first_name} {m.players.last_name}</bdi> · {m.membership_plans.name} ({eur(m.membership_plans.amount_cents)} / {t(`per_${m.membership_plans.period}` as 'per_month')})
                  <span className="block text-sm text-muted">{m.auto_renew ? t('nextInvoice', { date: day(m.next_due_on) }) : t('autoOffLabel')}</span></span>
                <form action={setAutoRenew}>
                  <input type="hidden" name="membership_id" value={m.id} /><input type="hidden" name="auto" value={m.auto_renew ? 'false' : 'true'} /><input type="hidden" name="back" value="/admin/invoices" />
                  <button className={m.auto_renew ? 'min-h-9 rounded-full border border-danger px-3 font-bold text-danger hover:bg-danger/10' : 'min-h-9 rounded-full border-2 border-fg px-3 font-bold'}>{m.auto_renew ? t('stopAuto') : t('startAuto')}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addMembership} className="mt-4 grid gap-3 rounded-card bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_auto] lg:items-end">
          <input type="hidden" name="back" value="/admin/invoices" />
          <label className="grid gap-1 text-sm font-semibold">{t('player')}
            <select name="player_id" required defaultValue="" className={input}><option value="" disabled>{t('choose')}</option>{(players ?? []).map((p) => <option key={p.id} value={p.id}>{p.last_name} {p.first_name}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">{t('plan')}
            <select name="plan_id" required defaultValue="" className={input}><option value="" disabled>{t('choose')}</option>
              {(plans ?? []).filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name} · {eur(p.amount_cents)} / {t(`per_${p.period}` as 'per_month')}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">{t('firstInvoice')}<input name="first_on" type="date" required defaultValue={firstOfNextMonth} min={addDays(today, -366)} className={input} /></label>
          <button className={btn}>{t('add')}</button>
          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4"><input type="checkbox" name="auto" defaultChecked className="size-4 accent-[rgb(var(--accent))]" />{t('autoCheckbox')}</label>
        </form>
      </section>

      {/* 4a. plans */}
      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="plans-h">
        <h2 id="plans-h" className="font-display text-xl font-extrabold">{t('plans')}</h2>
        <ul className="mt-3 divide-y divide-line">
          {(plans ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-plan={p.name}>
              <span className={p.active ? '' : 'text-muted line-through'}><span className="font-semibold">{p.name}</span> · {eur(p.amount_cents)} / {t(`per_${p.period}` as 'per_month')}</span>
              <form action={setPlanActive}><input type="hidden" name="plan_id" value={p.id} /><input type="hidden" name="active" value={p.active ? 'false' : 'true'} /><input type="hidden" name="back" value="/admin/invoices" />
                <button className="min-h-9 rounded-full border border-line px-3 font-semibold hover:border-accent">{p.active ? t('deactivate') : t('activate')}</button></form>
            </li>
          ))}
        </ul>
        <form action={createPlan} className="mt-4 grid gap-3 rounded-card bg-surface p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="back" value="/admin/invoices" />
          <label className="grid gap-1 text-sm font-semibold">{t('planName')}<input name="name" required minLength={2} maxLength={80} placeholder={t('planNameEg')} className={input} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('price')}<input name="price" required inputMode="decimal" placeholder="20.00" className={input} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('period')}
            <select name="period" defaultValue="month" className={input}>{PERIODS.map((p) => <option key={p} value={p}>{t(`per_${p}`)}</option>)}</select></label>
          <button className={btn}>{t('add')}</button>
        </form>
      </section>

      {/* 4b. billing details */}
      <details className="rounded-card border border-line bg-raised p-6" open={!ready}>
        <summary className="cursor-pointer font-display text-xl font-extrabold">{t('billingTitle')}</summary>
        <p className="mt-1 text-sm text-muted">{t('billingLead')}</p>
        <form action={saveBilling} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="back" value="/admin/invoices" />
          {([['legal_name', 120, true], ['business_id', 20, false], ['street', 120, true], ['postal_city', 80, true], ['iban', 40, true], ['bic', 11, true], ['bank', 60, false],
            ['email', 200, false], ['phone', 30, false], ['website', 120, false], ['contact_person', 120, false]] as const).map(([k, max, req]) => (
            <label key={k} className="grid gap-1 text-sm font-semibold">{t(`b_${k}` as 'b_iban')}{req ? ' *' : ''}
              <input name={k} required={req} maxLength={max} dir={k === 'iban' || k === 'bic' || k === 'email' || k === 'website' || k === 'phone' ? 'ltr' : undefined}
                defaultValue={k === 'iban' && billing.iban ? formatIban(billing.iban) : String(billing[k as keyof typeof billing] ?? '')} className={input} /></label>
          ))}
          <label className="grid gap-1 text-sm font-semibold">{t('b_payment_terms_days')}<input name="payment_terms_days" type="number" min={0} max={120} required defaultValue={billing.payment_terms_days} className={input} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('b_lead_days')}<input name="lead_days" type="number" min={0} max={60} required defaultValue={billing.lead_days} className={input} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('b_late_interest')}<input name="late_interest" inputMode="decimal" required defaultValue={billing.late_interest} className={input} /></label>
          <label className="flex items-start gap-3 rounded-card bg-surface p-3 text-sm sm:col-span-2">
            <input type="checkbox" name="require_consents" defaultChecked={billing.require_consents} className="mt-0.5 size-5 accent-accent" data-require-consents />
            <span><span className="font-semibold">{t('b_require_consents')}</span><span className="block text-xs text-muted">{t('b_require_consents_hint')}</span></span>
          </label>
          <button className={`${btn} sm:col-span-2 sm:justify-self-start`}>{t('save')}</button>
        </form>
        <p className="mt-2 text-xs text-muted">{t('billingPublic')}</p>
      </details>
    </div>
  );
}
