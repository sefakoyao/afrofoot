import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { CURRENCY, LOCALE_LABELS, isLocale } from '@afrofoot/i18n';
import { requireArea } from '@/lib/auth';
import { membershipUrl } from '@/lib/env';
import { dateFormats, isolate } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';

type Summary = {
  team_name: string | null; paid_cents: number; owed_cents: number; overdue_cents: number; next_due_on: string | null;
  sign_in_blocked_from: string | null; exempt_until: string | null; grace_days: number | null; policy_enabled: boolean | null;
};
type Payment = { id: string; amount_cents: number; currency: string; due_on: string | null; paid_at: string | null; reference: string | null; invoice_number: string | null; checkout_url: string | null; display_status: string };

const BADGE: Record<string, string> = { paid: 'bg-accent/20 text-pitch', overdue: 'bg-danger/15 text-danger', pending: 'bg-line text-fg', failed: 'bg-danger/15 text-danger', refunded: 'bg-line text-muted' };
const day = (iso: string) => new Date(`${iso}T12:00:00Z`); // a date without time, shown in Helsinki time

/**
 * Player home: team, payment status and history (migration 0022: my_payment_summary, my_payments — both limited to the
 * signed-in player by the database), and a link to pay on the public Membership page.
 */
export default async function PlayerHome() {
  const member = await requireArea('me');
  const [t, ta, ts, fmt, rawLocale, supabase] = await Promise.all([
    getTranslations('me'), getTranslations('app'), getTranslations('status'), dateFormats(), getLocale(), getSupabase(),
  ]);
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
  const money = new Intl.NumberFormat(LOCALE_LABELS[locale].intl, { style: 'currency', currency: CURRENCY });
  const eur = (cents: number) => money.format(cents / 100);

  const [{ data: summaryRows }, { data: paymentRows }] = supabase
    ? await Promise.all([supabase.rpc('my_payment_summary'), supabase.from('my_payments').select('*').order('due_on', { ascending: false, nullsFirst: false })])
    : [{ data: null }, { data: null }];
  const s = ((summaryRows as Summary[] | null) ?? [])[0];
  const payments = (paymentRows as Payment[] | null) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const exempt = s?.exempt_until && s.exempt_until >= today ? s.exempt_until : null;
  const blockDate = s?.policy_enabled && !exempt && s.sign_in_blocked_from ? s.sign_in_blocked_from : null;
  const payHref = membershipUrl(locale);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <section className="rounded-card border border-line bg-raised p-6">
        <h1 className="font-display text-2xl font-extrabold">{ta('welcome', { name: isolate(member.firstName || member.email) })}</h1>
        <p className="mt-1 text-muted">{t('team')}: <span className="font-semibold text-fg">{s?.team_name ?? t('noTeam')}</span></p>
        <Link href="/account" className="mt-3 inline-flex text-sm font-semibold text-pitch underline underline-offset-2">{t('editProfile')}</Link>
      </section>

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="pay-h">
        <h2 id="pay-h" className="font-display text-xl font-extrabold">{t('paymentsTitle')}</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-card bg-accent/10 p-4"><dt className="text-sm text-muted">{t('paid')}</dt><dd className="font-display text-2xl font-black">{eur(s?.paid_cents ?? 0)}</dd></div>
          <div className="rounded-card bg-surface p-4"><dt className="text-sm text-muted">{t('owed')}</dt><dd className="font-display text-2xl font-black">{eur(s?.owed_cents ?? 0)}</dd></div>
          <div className={`rounded-card p-4 ${(s?.overdue_cents ?? 0) > 0 ? 'bg-danger/10' : 'bg-surface'}`}><dt className="text-sm text-muted">{t('overdue')}</dt><dd className={`font-display text-2xl font-black ${(s?.overdue_cents ?? 0) > 0 ? 'text-danger' : ''}`}>{eur(s?.overdue_cents ?? 0)}</dd></div>
        </dl>

        <div className="mt-4 grid gap-2">
          {(s?.owed_cents ?? 0) === 0 ? (
            <p role="status" className="rounded-card bg-accent/15 p-3 font-semibold text-pitch">{t('upToDate')}</p>
          ) : (s?.overdue_cents ?? 0) > 0 ? (
            <p role="alert" className="rounded-card bg-danger/10 p-3 font-semibold text-danger">
              {blockDate ? t('overdueWarn', { amount: eur(s!.overdue_cents), date: fmt.date.format(day(blockDate)) }) : t('overdueNoBlock', { amount: eur(s!.overdue_cents) })}
            </p>
          ) : (
            <p className="rounded-card bg-surface p-3 font-semibold">{t('owedNotice', { amount: eur(s!.owed_cents), date: s?.next_due_on ? fmt.date.format(day(s.next_due_on)) : '–' })}</p>
          )}
          {exempt ? <p className="text-sm text-muted">{t('exempt', { date: fmt.date.format(day(exempt)) })}</p> : null}
        </div>

        {(s?.owed_cents ?? 0) > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a href={payHref} className="inline-flex min-h-11 items-center rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">
              {t('payOptions')} <span aria-hidden className="ms-1 rtl-flip">→</span>
            </a>
            <p className="text-sm text-muted">{t('payHelp')}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="hist-h">
        <h2 id="hist-h" className="font-display text-lg font-extrabold">{t('historyTitle')}</h2>
        {payments.length === 0 ? <p className="mt-2 text-muted">{t('noPayments')}</p> : (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start">{t('colDue')}</th>
                  <th scope="col" className="px-3 py-2 text-end">{t('colAmount')}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t('colStatus')}</th>
                  <th scope="col" className="px-3 py-2 text-start">{t('colReference')}</th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">{t('payNow')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payments.map((p) => (
                  <tr key={p.id} data-payment={p.display_status}>
                    <td className="whitespace-nowrap px-3 py-2">{p.due_on ? fmt.date.format(day(p.due_on)) : '–'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-end font-semibold">{eur(p.amount_cents)}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[p.display_status] ?? ''}`}>{p.display_status === 'overdue' ? t('st_overdue') : ts(p.display_status)}</span></td>
                    <td className="px-3 py-2" dir="ltr"><bdi>{p.reference ?? p.invoice_number ?? '–'}</bdi></td>
                    <td className="px-3 py-2 text-end">
                      {p.checkout_url && p.display_status !== 'paid' && /^https:\/\//.test(p.checkout_url)
                        ? <a href={p.checkout_url} rel="noopener noreferrer" className="font-semibold text-pitch underline">{t('payNow')}</a> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
