import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { CURRENCY, LOCALE_LABELS, isLocale } from '@afrofoot/i18n';
import { requireArea } from '@/lib/auth';
import { membershipUrl } from '@/lib/env';
import { dateFormats, isolate } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { loadPlayerSport, loadSeasonStats, loadTraining, type SeasonStats, type Training } from '@/lib/player';

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
  const [t, ta, ts, tp, tpos, fmt, rawLocale, supabase] = await Promise.all([
    getTranslations('me'), getTranslations('app'), getTranslations('status'), getTranslations('pp'), getTranslations('position'), dateFormats(), getLocale(), getSupabase(),
  ]);
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
  const money = new Intl.NumberFormat(LOCALE_LABELS[locale].intl, { style: 'currency', currency: CURRENCY });
  const eur = (cents: number) => money.format(cents / 100);

  const [{ data: summaryRows }, { data: paymentRows }] = supabase
    ? await Promise.all([supabase.rpc('my_payment_summary'), supabase.from('my_payments').select('*').order('due_on', { ascending: false, nullsFirst: false })])
    : [{ data: null }, { data: null }];
  const sport = supabase ? await loadPlayerSport(supabase, member.id) : null;
  const [stats, training]: [SeasonStats | null, Training | null] = supabase && sport
    ? await Promise.all([loadSeasonStats(supabase, sport.id), loadTraining(supabase, sport.id)]) : [null, null];
  const s = ((summaryRows as Summary[] | null) ?? [])[0];
  // My invoices: the invoice payments, newest first, with the months they cover (payment_lines, readable for own invoices only).
  const invoices = ((paymentRows as Payment[] | null) ?? []).filter((p) => p.invoice_number);
  const { data: lineRows } = supabase && invoices.length
    ? await supabase.from('payment_lines').select('payment_id, line_date').in('payment_id', invoices.map((p) => p.id)) : { data: [] };
  const span = new Map<string, { from: string; to: string }>();
  for (const l of lineRows ?? []) {
    if (!l.line_date) continue;
    const cur = span.get(l.payment_id);
    span.set(l.payment_id, { from: !cur || l.line_date < cur.from ? l.line_date : cur.from, to: !cur || l.line_date > cur.to ? l.line_date : cur.to });
  }
  const monthYear = new Intl.DateTimeFormat(LOCALE_LABELS[isLocale(rawLocale) ? rawLocale : 'en'].intl, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const period = (id: string) => { const x = span.get(id); if (!x) return null; const a = monthYear.format(day(x.from)), b = monthYear.format(day(x.to)); return a === b ? a : `${a} – ${b}`; };
  const payments = (paymentRows as Payment[] | null) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const exempt = s?.exempt_until && s.exempt_until >= today ? s.exempt_until : null;
  const blockDate = s?.policy_enabled && !exempt && s.sign_in_blocked_from ? s.sign_in_blocked_from : null;
  const payHref = membershipUrl(locale);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <section className="rounded-card border border-line bg-raised p-6">
        <h1 className="font-display text-2xl font-extrabold">{ta('welcome', { name: isolate(member.firstName || member.email) })}</h1>
        <p className="mt-1 text-muted">{t('team')}: <span className="font-semibold text-fg">{s?.team_name ?? t('noTeam')}</span>
          {sport?.position ? <> · {tpos(sport.position)}</> : null}{sport?.shirt ? <> · <bdi dir="ltr">#{sport.shirt}</bdi></> : null}</p>
      </section>

      {stats ? (
        <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="season-h">
          <h2 id="season-h" className="font-display text-xl font-extrabold">{t('seasonTitle')}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([['played', stats.played], ['goals', stats.goals], ['assists', stats.assists], ['minutes', stats.minutes]] as const).map(([k, v]) => (
              <div key={k} className="rounded-card bg-surface p-4" data-stat={k}><dt className="text-sm text-muted">{t(`st_${k}`)}</dt><dd className="font-display text-3xl font-black">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-muted" data-stat="discipline">
            {t('cards', { yellow: stats.yellow, red: stats.red })}{sport?.position === 'goalkeeper' ? ` · ${t('cleanSheets', { count: stats.cleanSheets })}` : ''}
          </p>
          <h3 className="mt-5 text-xs font-bold uppercase tracking-widest text-muted">{t('lastMatches')}</h3>
          {stats.last.length === 0 ? <p className="mt-2 text-muted">{t('noMatches')}</p> : (
            <ul className="mt-2 divide-y divide-line">
              {stats.last.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2" data-match={m.opponent}>
                  <span><span className="text-muted">{fmt.date.format(new Date(m.kickoffAt))}</span> · <bdi className="font-semibold">{m.opponent}</bdi>
                    {' '}<span className="text-muted">({t(m.homeAway === 'away' ? 'away' : 'home')})</span></span>
                  <span className="flex items-center gap-3 text-sm">
                    {m.goalsFor !== null && m.goalsAgainst !== null ? <span dir="ltr" className={`rounded-full px-2 font-bold ${m.goalsFor > m.goalsAgainst ? 'bg-accent/20 text-pitch' : m.goalsFor < m.goalsAgainst ? 'bg-danger/10 text-danger' : 'bg-line'}`}>{m.goalsFor}–{m.goalsAgainst}</span> : null}
                    <span>{t('lineStats', { minutes: m.minutes, goals: m.goals, assists: m.assists })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {training ? (
        <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="training-h">
          <h2 id="training-h" className="font-display text-xl font-extrabold">{t('trainingTitle')}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-card bg-accent/10 p-4" data-training="attended"><dt className="text-sm text-muted">{t('tr_attended')}</dt><dd className="font-display text-3xl font-black">{training.attended}</dd></div>
            <div className={`rounded-card p-4 ${training.missed ? 'bg-danger/10' : 'bg-surface'}`} data-training="missed"><dt className="text-sm text-muted">{t('tr_missed')}</dt><dd className="font-display text-3xl font-black">{training.missed}</dd></div>
            <div className="rounded-card bg-surface p-4" data-training="excused"><dt className="text-sm text-muted">{t('tr_excused')}</dt><dd className="font-display text-3xl font-black">{training.excused}</dd></div>
            <div className="rounded-card bg-surface p-4" data-training="rate"><dt className="text-sm text-muted">{t('tr_rate')}</dt><dd className="font-display text-3xl font-black">{training.rate === null ? '–' : `${training.rate}%`}</dd></div>
          </dl>
          {training.late ? <p className="mt-3 text-sm text-muted">{t('tr_late', { count: training.late })}</p> : null}
          {training.rate === null ? <p className="mt-3 text-muted">{t('tr_none')}</p> : null}
        </section>
      ) : null}

      {sport ? (
        <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="pp-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="pp-h" className="font-display text-xl font-extrabold">{tp('title')}</h2>
            <Link href="/me/profile" className="inline-flex min-h-10 items-center rounded-full border-2 border-fg px-4 font-bold hover:bg-fg hover:text-raised">{tp('edit')}</Link>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">{tp('position')}</dt><dd className="font-semibold">{sport.position ? tpos(sport.position) : '–'}</dd></div>
            <div><dt className="text-muted">{tp('foot')}</dt><dd className="font-semibold">{sport.preferredFoot ? tp(`foot_${sport.preferredFoot}`) : '–'}</dd></div>
            <div><dt className="text-muted">{tp('phone')}</dt><dd className="font-semibold">{sport.phone ? <bdi dir="ltr">{sport.phone}</bdi> : <span className="text-danger">{tp('missing')}</span>}</dd></div>
            <div><dt className="text-muted">{tp('emergencyTitle')}</dt><dd className="font-semibold">{sport.emergencyName
              ? <><bdi>{sport.emergencyName}</bdi>{sport.emergencyRelation ? <> ({sport.emergencyRelation})</> : null}{sport.emergencyPhone ? <> · <bdi dir="ltr">{sport.emergencyPhone}</bdi></> : null}</>
              : <span className="text-danger">{tp('missing')}</span>}</dd></div>
          </dl>
        </section>
      ) : null}

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

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="inv-h">
        <h2 id="inv-h" className="font-display text-xl font-extrabold">{t('myInvoices')}</h2>
        {invoices.length === 0 ? <p className="mt-2 text-muted">{t('noInvoices')}</p> : (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {invoices.map((p) => {
              const st = p.display_status === 'overdue' ? 'overdue' : p.display_status === 'paid' ? 'paid' : 'open';
              const per = period(p.id);
              return (
                <li key={p.id} data-my-invoice={p.invoice_number} className={`grid gap-2 rounded-card border-2 p-4 ${st === 'overdue' ? 'border-danger/40 bg-danger/5' : st === 'paid' ? 'border-line' : 'border-accent/50'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-muted">{t('invoiceNo')} <span dir="ltr" className="font-semibold text-fg">{p.invoice_number}</span></p>
                      {per ? <p className="font-semibold">{per}</p> : null}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[st === 'open' ? 'pending' : st] ?? ''}`}>{st === 'overdue' ? t('st_overdue') : st === 'paid' ? ts('paid') : t('st_open')}</span>
                  </div>
                  <p className="font-display text-2xl font-black">{eur(p.amount_cents)}</p>
                  <p className="text-sm text-muted">{st === 'paid' ? t('paidOn', { date: p.paid_at ? fmt.date.format(new Date(p.paid_at)) : '–' }) : t('dueOn', { date: p.due_on ? fmt.date.format(day(p.due_on)) : '–' })}</p>
                  <a href={`/invoices/${p.id}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">{t('openPdf')}</a>
                </li>
              );
            })}
          </ul>
        )}
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
                      <span className="flex flex-wrap justify-end gap-3">
                        {p.invoice_number ? <a href={`/invoices/${p.id}`} target="_blank" rel="noopener" data-invoice={p.invoice_number} className="font-semibold text-pitch underline">{t('invoicePdf')}</a> : null}
                        {p.checkout_url && p.display_status !== 'paid' && /^https:\/\//.test(p.checkout_url)
                          ? <a href={p.checkout_url} rel="noopener noreferrer" className="font-semibold text-pitch underline">{t('payNow')}</a> : null}
                      </span>
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
