import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { CURRENCY, LOCALE_LABELS, isLocale } from '@afrofoot/i18n';
import { addMembership, createPlan, markPaid, runInvoicingNow, saveBilling, setAutoRenew, setPlanActive } from '@/app/actions/invoices';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { dateFormats } from '@/lib/format';
import { formatIban, ibanValid } from '@/lib/invoice/barcode';
import { loadBilling } from '@/lib/invoice/data';
import { getSupabase } from '@/lib/supabase/server';
import { addDays, helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('inv'))('title') };
}

const PERIODS = ['month', 'quarter', 'year', 'season', 'one_off'] as const;
const input = 'min-h-10 w-full rounded-control border border-line bg-raised px-3';
const btn = 'min-h-10 rounded-full bg-accent px-5 font-bold text-on-accent hover:brightness-110';
const BADGE: Record<string, string> = { paid: 'bg-accent/20 text-pitch', pending: 'bg-line', failed: 'bg-danger/10 text-danger', refunded: 'bg-line text-muted', overdue: 'bg-danger/10 text-danger' };

type InvoiceRow = { id: string; invoice_number: string; amount_cents: number; due_on: string | null; status: string; players: { first_name: string; last_name: string } | null };
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

  const [billing, { data: invoices }, { data: memberships }, { data: plans }, { data: players }, { data: season }] = await Promise.all([
    loadBilling(supabase),
    supabase.from('payments').select('id, invoice_number, amount_cents, due_on, status, players(first_name, last_name)').not('invoice_number', 'is', null).order('created_at', { ascending: false }).limit(40),
    supabase.from('memberships').select('id, status, auto_renew, next_due_on, players!inner(first_name, last_name), membership_plans!inner(name, amount_cents, period), seasons!inner(is_current)').eq('seasons.is_current', true).order('next_due_on', { nullsFirst: false }),
    supabase.from('membership_plans').select('id, name, amount_cents, period, active').order('active', { ascending: false }).order('name'),
    supabase.from('players').select('id, first_name, last_name').order('last_name'),
    supabase.from('seasons').select('name').eq('is_current', true).maybeSingle(),
  ]);
  const ready = ibanValid(billing.iban) && !!billing.legal_name;
  const firstOfNextMonth = (() => { const [y, m] = today.split('-').map(Number) as [number, number]; return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); })();
  const result = typeof sp.result === 'string' ? sp.result : '';
  const status = (r: InvoiceRow) => (r.status === 'pending' && r.due_on && r.due_on < today ? 'overdue' : r.status);

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
      </section>

      {/* 2. invoices */}
      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="list-h">
        <h2 id="list-h" className="font-display text-xl font-extrabold">{t('invoices')}</h2>
        {(invoices ?? []).length === 0 ? <p className="mt-2 text-muted">{t('noInvoices')}</p> : (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>{['colNumber', 'colPlayer', 'colAmount', 'colDue', 'colStatus'].map((k) => <th key={k} scope="col" className="px-2 py-2 text-start">{t(k as 'colNumber')}</th>)}<th scope="col" className="px-2 py-2"><span className="sr-only">{t('colActions')}</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(invoices as unknown as InvoiceRow[]).map((r) => (
                  <tr key={r.id} data-invoice={r.invoice_number}>
                    <td className="px-2 py-2 font-semibold" dir="ltr">{r.invoice_number}</td>
                    <td className="px-2 py-2"><bdi>{r.players ? `${r.players.first_name} ${r.players.last_name}` : '–'}</bdi></td>
                    <td className="whitespace-nowrap px-2 py-2">{eur(r.amount_cents)}</td>
                    <td className="whitespace-nowrap px-2 py-2">{day(r.due_on)}</td>
                    <td className="px-2 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[status(r)] ?? ''}`}>{t(`st_${status(r)}` as 'st_paid')}</span></td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <a href={`/invoices/${r.id}`} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center rounded-full border border-line px-3 font-semibold hover:border-accent">PDF</a>
                        {r.status === 'pending' || r.status === 'failed' ? (
                          <form action={markPaid}><input type="hidden" name="payment_id" value={r.id} /><input type="hidden" name="back" value="/admin/invoices" />
                            <button className="min-h-9 rounded-full bg-accent px-3 font-bold text-on-accent hover:brightness-110">{t('markPaid')}</button></form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
          <button className={`${btn} sm:col-span-2 sm:justify-self-start`}>{t('save')}</button>
        </form>
        <p className="mt-2 text-xs text-muted">{t('billingPublic')}</p>
      </details>
    </div>
  );
}
