import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { updateRequest } from '@/app/actions/requests';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { dateFormats, isolate } from '@/lib/format';
import { KINDS, STATUSES, loadRequests, type Kind, type Request } from '@/lib/requests';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('req'))('title') };
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const input = 'min-h-10 w-full rounded-control border border-line bg-raised px-3';
const BADGE: Record<string, string> = {
  new: 'bg-accent text-on-accent', in_review: 'bg-ink-950 text-white', invoiced: 'bg-ink-950 text-white',
  accepted: 'bg-accent/20 text-pitch', paid: 'bg-accent/20 text-pitch', declined: 'bg-danger/15 text-danger', cancelled: 'bg-danger/15 text-danger', archived: 'bg-line text-muted',
};

/**
 * Admin → Requests: tryout requests, team enrolments, invoice requests and messages from the website, newest first.
 * Open requests by default; each one opens to its details, a status, and the admin's note (tryout date, invoice number).
 */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, tp, fmt, supabase] = await Promise.all([getTranslations('req'), getTranslations('position'), dateFormats(), getSupabase()]);
  const kind = KINDS.find((k) => k === one(sp.kind));
  const all = one(sp.show) === 'all';
  const openId = one(sp.open);
  const rows = supabase ? await loadRequests(supabase, kind ? [kind] : KINDS, !all) : [];
  const counts = Object.fromEntries(KINDS.map((k) => [k, rows.filter((r) => r.kind === k && r.status === 'new').length])) as Record<Kind, number>;
  const href = (k?: Kind, show = all) => `/admin/requests?${new URLSearchParams({ ...(k ? { kind: k } : {}), ...(show ? { show: 'all' } : {}) })}`;
  const back = href(kind, all);
  const pos = (p?: string | null) => (p && ['goalkeeper', 'defender', 'midfielder', 'forward'].includes(p) ? tp(p as 'goalkeeper') : p ?? '');
  const summary = (r: Request) => {
    if (r.kind === 'tryout' || r.kind === 'enrolment') return [pos(r.position), r.age != null ? t('age', { age: r.age }) : null, r.previous_team, r.kind === 'enrolment' ? r.plan : null].filter(Boolean).join(' · ');
    if (r.kind === 'invoice') return [r.plan, r.player_name ? t('forPlayer', { name: r.player_name }) : null].filter(Boolean).join(' · ');
    return `${t(`topic_${r.topic}` as 'topic_general')} · ${(r.message ?? '').slice(0, 120)}${(r.message ?? '').length > 120 ? '…' : ''}`;
  };
  const Fact = ({ k, children }: { k: string; children: ReactNode }) => children ? <div><dt className="text-xs text-muted">{t(k as 'f_email')}</dt><dd className="font-semibold">{children}</dd></div> : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
      </header>
      <ResultBanner ns="req" result={sp.result} />

      <nav aria-label={t('filter')} className="flex flex-wrap items-center gap-2" data-req-filters>
        {[undefined, ...KINDS].map((k) => (
          <a key={k ?? 'all'} href={href(k)} aria-current={k === kind ? 'page' : undefined} data-kind-filter={k ?? 'all'}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border-2 px-4 text-sm font-semibold ${k === kind ? 'border-accent bg-accent text-on-accent' : 'border-line hover:border-accent'}`}>
            {t(k ? `k_${k}` : 'k_all')}
            {k && !kind && counts[k] ? <span className="rounded-full bg-ink-950 px-1.5 text-xs text-white">{counts[k]}</span> : null}
          </a>
        ))}
        <a href={href(kind, !all)} className="ms-auto text-sm font-semibold text-pitch underline underline-offset-2" data-show-toggle>{all ? t('showOpen') : t('showAll')}</a>
      </nav>

      {rows.length ? (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={`${r.kind}-${r.id}`} id={`r-${r.id}`} className="scroll-mt-4" data-request={r.kind} data-status={r.status}>
              <details open={r.id === openId} className="rounded-card border border-line bg-raised open:shadow-sm">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 p-4">
                  <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold">{t(`k_${r.kind}_one` as 'k_tryout_one')}</span>
                  <span className="font-display font-extrabold">{isolate(r.name)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${BADGE[r.status] ?? 'bg-line'}`} data-status-badge>{t(`st_${r.status}` as 'st_new')}</span>
                  <span className="ms-auto text-sm text-muted">{fmt.dateTime.format(new Date(r.created_at))}</span>
                  <span className="basis-full text-sm text-muted">{summary(r)}</span>
                </summary>
                <div className="grid gap-4 border-t border-line p-4">
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <Fact k="f_email"><a href={`mailto:${r.email}`} className="text-pitch underline" dir="ltr">{r.email}</a></Fact>
                    <Fact k="f_phone">{r.phone ? <a href={`tel:${r.phone.replace(/\s+/g, '')}`} className="text-pitch underline" dir="ltr">{r.phone}</a> : null}</Fact>
                    <Fact k="f_position">{pos(r.position)}</Fact>
                    <Fact k="f_age">{r.age != null ? String(r.age) : null}</Fact>
                    <Fact k="f_nationality">{r.nationality}</Fact>
                    <Fact k="f_address">{r.address}</Fact>
                    <Fact k="f_previous">{r.previous_team}</Fact>
                    <Fact k="f_palloliitto">{r.palloliitto_url ? <a href={r.palloliitto_url} target="_blank" rel="noopener noreferrer" className="text-pitch underline">{t('open')}</a> : null}</Fact>
                    <Fact k="f_guardian">{r.guardian}</Fact>
                    <Fact k="f_plan">{r.plan}</Fact>
                    <Fact k="f_payment">{r.payment_method ? t(`pay_${r.payment_method}` as 'pay_invoice') : null}</Fact>
                    <Fact k="f_player">{r.player_name}</Fact>
                    <Fact k="f_reference">{r.reference}</Fact>
                    <Fact k="f_language">{r.locale ? r.locale.toUpperCase() : null}</Fact>
                  </dl>
                  {r.message ? <p className="whitespace-pre-line rounded-control bg-surface p-3 text-sm" dir="auto">{r.message}</p> : null}
                  <form action={updateRequest} className="grid gap-3 rounded-control bg-surface p-3 sm:grid-cols-2 sm:items-end">
                    <input type="hidden" name="kind" value={r.kind} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={back} />
                    <label className="grid gap-1 text-sm font-semibold">{t('status')}
                      <select name="status" defaultValue={r.status} className={input} data-status-select>
                        {STATUSES[r.kind].map((st) => <option key={st} value={st}>{t(`st_${st}` as 'st_new')}</option>)}
                      </select></label>
                    {r.kind === 'tryout' ? <label className="grid gap-1 text-sm font-semibold">{t('tryoutOn')}<input type="date" name="tryout_on" defaultValue={r.tryout_on ?? ''} className={input} /></label> : null}
                    {r.kind === 'invoice' ? <label className="grid gap-1 text-sm font-semibold">{t('invoiceNumber')}<input name="invoice_number" maxLength={40} defaultValue={r.invoice_number ?? ''} className={input} /></label> : null}
                    {r.kind === 'tryout' || r.kind === 'enrolment' ? (
                      <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t('note')}
                        <textarea name="note" rows={2} maxLength={2000} defaultValue={r.note ?? ''} placeholder={t('noteHint')} className="rounded-control border border-line bg-raised p-2 font-normal" /></label>
                    ) : null}
                    <button className="min-h-10 justify-self-start rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110" data-save>{t('save')}</button>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-card border border-line bg-raised p-5 text-muted" data-req-empty>{all ? t('emptyAll') : t('emptyOpen')}</p>}
      <p className="text-xs text-muted">{t('privacy')}</p>
    </div>
  );
}
