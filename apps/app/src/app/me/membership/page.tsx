import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { CURRENCY, LOCALE_LABELS, isLocale } from '@afrofoot/i18n';
import { requireArea } from '@/lib/auth';
import { loadConductStatus } from '@/lib/conduct';
import { PayDetails } from '@/components/PayDetails';
import { ResultBanner } from '@/components/ResultBanner';
import { STATUS_BADGE, myContracts, shownStatus } from '@/lib/contracts';
import { loadBilling } from '@/lib/invoice/data';
import { dateFormats } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('me'))('tabMembership') };
}

type Summary = {
  team_name: string | null; paid_cents: number; owed_cents: number; overdue_cents: number; next_due_on: string | null;
  sign_in_blocked_from: string | null; exempt_until: string | null; grace_days: number | null; policy_enabled: boolean | null;
};
type Payment = { id: string; amount_cents: number; currency: string; due_on: string | null; paid_at: string | null; reference: string | null; invoice_number: string | null; checkout_url: string | null; display_status: string };

const BADGE: Record<string, string> = { paid: 'bg-accent/20 text-pitch', overdue: 'bg-danger/15 text-danger', pending: 'bg-line text-fg', failed: 'bg-danger/15 text-danger', refunded: 'bg-line text-muted' };
const day = (iso: string) => new Date(`${iso}T12:00:00Z`); // a date without time, shown in Helsinki time

/**
 * Membership tab: fees (my_payment_summary, my_payments — limited to the signed-in player by the database), invoices,
 * payment history, and the club's Code of Conduct with the player's consent (migration 0028).
 */
export default async function MembershipTab({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const agreed = sp.result === 'r_agreed';
  const member = await requireArea('me');
  const [t, tc, tk, ts, fmt, rawLocale, supabase] = await Promise.all([
    getTranslations('me'), getTranslations('conduct'), getTranslations('contract'), getTranslations('status'), dateFormats(), getLocale(), getSupabase(),
  ]);
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
  const money = new Intl.NumberFormat(LOCALE_LABELS[locale].intl, { style: 'currency', currency: CURRENCY });
  const eur = (cents: number) => money.format(cents / 100);

  const [{ data: summaryRows }, { data: paymentRows }] = supabase
    ? await Promise.all([supabase.rpc('my_payment_summary'), supabase.from('my_payments').select('*').order('due_on', { ascending: false, nullsFirst: false })])
    : [{ data: null }, { data: null }];
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
  // How to pay: bank details for every open payment that has a reference number (the club's account is public, migration 0027).
  const billing = supabase && (s?.owed_cents ?? 0) > 0 ? await loadBilling(supabase) : null;
  const openItems = payments.filter((p) => p.reference && ['pending', 'overdue', 'failed'].includes(p.display_status))
    .sort((a, b) => (a.due_on ?? '').localeCompare(b.due_on ?? ''))
    .map((p) => ({ id: p.id, invoiceNumber: p.invoice_number, reference: p.reference!, amountCents: p.amount_cents, dueOn: p.due_on, overdue: p.display_status === 'overdue' }));
  const conduct = supabase ? await loadConductStatus(supabase, member.id) : null;
  const contracts = supabase ? await myContracts(supabase) : [];
  const dd = (iso: string) => fmt.date.format(day(iso));
  // the player's current team(s) and their season goals; before migration 0037 there is no objectives column
  const { data: me } = supabase ? await supabase.from('players').select('id').eq('profile_id', member.id).maybeSingle() : { data: null };
  type TeamRow = { team_seasons: { id: string; division: string | null; objectives?: string | null; teams: { name: string }; seasons: { name: string; is_current: boolean } } };
  const teamQuery = (cols: string) => supabase!.from('team_players').select(`team_seasons!inner(${cols}, teams!inner(name), seasons!inner(name, is_current))`)
    .eq('player_id', me!.id).is('left_on', null).eq('team_seasons.seasons.is_current', true);
  const teamsFirst = supabase && me ? await teamQuery('id, division, objectives') : null;
  const teamRows = teamsFirst?.error && supabase && me ? (await teamQuery('id, division')).data : teamsFirst?.data;
  const myTeams = ((teamRows ?? []) as unknown as TeamRow[]).map((r) => ({ id: r.team_seasons.id, name: r.team_seasons.teams.name, division: r.team_seasons.division,
    season: r.team_seasons.seasons.name, objectives: r.team_seasons.objectives ?? null }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {agreed ? <p role="status" className="rounded-card bg-accent/15 p-3 font-semibold text-pitch">{tc('thanks')}</p> : null}
      <ResultBanner ns="contract" result={sp.result} />
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
            <a href="#how-to-pay" className="inline-flex min-h-11 items-center rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">
              {t('payOptions')} <span aria-hidden className="ms-1 inline-block rotate-90">→</span>
            </a>
            <p className="text-sm text-muted">{t('payHelp')}</p>
          </div>
        ) : null}
      </section>

      {billing ? (
        <section id="how-to-pay" className="rounded-card border border-line bg-raised p-6" aria-labelledby="howpay-h">
          <h2 id="howpay-h" className="font-display text-xl font-extrabold">{t('howToPay')}</h2>
          <p className="mb-4 mt-1 text-muted">{t('howToPayLead')}</p>
          <PayDetails billing={billing} items={openItems} />
        </section>
      ) : null}

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

      {/* 2. the season goals of the player's team(s), written by the club on the team page (migration 0037) */}
      {myTeams.length ? (
        <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="goals-h" id="team-goals" data-team-goals>
          <h2 id="goals-h" className="font-display text-xl font-extrabold">{t('teamGoalsTitle')}</h2>
          <ul className="mt-3 grid gap-3">
            {myTeams.map((x) => (
              <li key={x.id} className="rounded-card bg-surface p-4" data-team-goal={x.name}>
                <p className="font-display font-extrabold"><bdi>{x.name}</bdi>{x.division ? <span className="ms-2 text-sm font-normal text-muted">{x.division}</span> : null}
                  <span className="ms-2 text-sm font-normal text-muted">{x.season}</span></p>
                {x.objectives ? <p className="mt-1 whitespace-pre-line" lang="en" dir="ltr" style={{ textAlign: 'start' }}>{x.objectives}</p>
                  : <p className="mt-1 text-sm text-muted">{t('teamGoalsNone')}</p>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 3. signed documents: the player contract and the Code of Conduct */}
      {contracts.length || conduct?.version ? (
        <section className="grid gap-4" aria-labelledby="docs-h" id="documents" data-documents>
          <h2 id="docs-h" className="font-display text-xl font-extrabold">{t('documentsTitle')}</h2>
      {contracts.length ? (
        <section id="contract" aria-labelledby="ct-h" className={`rounded-card border-2 p-6 ${contracts.some((c) => c.status === 'sent') ? 'border-danger/40 bg-danger/5' : 'border-line bg-raised'}`}>
          <h3 id="ct-h" className="font-display text-xl font-extrabold">{tk('myContract')}</h3>
          <ul className="mt-3 grid gap-3">
            {contracts.map((c) => {
              const st = shownStatus(c, today);
              return (
                <li key={c.id} data-my-contract={st} className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-4">
                  <div>
                    <p className="font-semibold">{c.title} <span className={`ms-1 rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[st]}`}>{tk(`st_${st}`)}</span></p>
                    <p className="text-sm text-muted">{dd(c.starts_on)} – {dd(c.ends_on)} · {tk('yearsN', { count: c.years })}</p>
                    {c.status === 'sent' ? <p className="mt-1 text-sm font-semibold">{tk('toSign')}</p> : c.status === 'player_signed' ? <p className="mt-1 text-sm">{tk('waitingClub')}</p> : null}
                  </div>
                  <Link href={`/me/contract/${c.id}${c.status === 'sent' ? '#sign' : ''}`} className={`inline-flex min-h-11 items-center rounded-full px-6 font-display font-bold ${c.status === 'sent' ? 'bg-accent text-on-accent hover:brightness-110' : 'border-2 border-fg hover:bg-fg hover:text-raised'}`}>
                    {c.status === 'sent' ? tk('readAndSign') : tk('open')}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {conduct?.version ? (
        <section id="conduct" aria-labelledby="coc-h" className={`rounded-card border-2 p-6 ${conduct.agreedAt ? 'border-line bg-raised' : 'border-danger/40 bg-danger/5'}`} data-conduct={conduct.agreedAt ? 'agreed' : 'missing'}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="coc-h" className="font-display text-xl font-extrabold">{tc('title')}</h3>
              <p className="text-sm text-muted">{conduct.version.title}{conduct.version.label ? ` · ${conduct.version.label}` : ''}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${conduct.agreedAt ? 'bg-accent/20 text-pitch' : 'bg-danger text-white'}`}>{conduct.agreedAt ? tc('agreedBadge') : tc('missingBadge')}</span>
          </div>
          <p className="mt-3">{conduct.agreedAt ? tc('agreedOn', { date: fmt.dateTime.format(new Date(conduct.agreedAt)) }) : tc('missingText')}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={conduct.agreedAt ? '/me/conduct' : '/me/conduct#players'} className={`inline-flex min-h-11 items-center rounded-full px-6 font-display font-bold ${conduct.agreedAt ? 'border-2 border-fg hover:bg-fg hover:text-raised' : 'bg-accent text-on-accent hover:brightness-110'}`}>{conduct.agreedAt ? tc('read') : tc('readAndAgree')}</Link>
            {conduct.version.pdfPath ? <a href={conduct.version.pdfPath} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 font-semibold hover:border-accent">{tc('downloadPdf')}</a> : null}
          </div>
        </section>
      ) : null}

        </section>
      ) : null}
    </div>
  );
}
