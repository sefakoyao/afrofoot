import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, isLocale } from '@afrofoot/i18n';
import { createSeasonInvoices, markSeasonInvoicesPaid } from '@/app/actions/season-invoices';
import { SeasonBillingForm } from '@/components/admin/SeasonBillingForm';
import { SeasonPicker } from '@/components/admin/SeasonPicker';
import { requireArea } from '@/lib/auth';
import { dateFormats } from '@/lib/format';
import { moneyFormat, pickSeason } from '@/lib/finance';
import { getSupabase } from '@/lib/supabase/server';
import { addDays, helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('past'))('title') };
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
type Inv = { id: string; player_id: string; invoice_number: string | null; amount_cents: number; paid_cents: number; status: string; due_on: string; players: { first_name: string; last_name: string }; payment_lines: { line_date: string | null }[] };

/**
 * Admin → Finance → Past seasons (migration 0063): bill players for a season afterwards (one invoice each, a line per
 * month), then follow who paid: per player what was invoiced, paid and is still owed, with "mark paid" for several at once.
 * Part payments are recorded on the Invoices page as before.
 */
export default async function PastSeasonsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, locale, fmt, supabase] = await Promise.all([getTranslations('past'), getLocale(), dateFormats(), getSupabase()]);
  if (!supabase) return null;
  const eur = moneyFormat(locale);
  const tag = isLocale(locale) ? LOCALE_LABELS[locale].intl : 'en-GB';
  const { seasons, season: picked } = await pickSeason(supabase, one(sp.season));
  // past seasons first: without a choice, the latest season that is not the current one
  const season = one(sp.season) ? picked : seasons.find((s) => !s.is_current) ?? picked;
  if (!season) return <p className="rounded-card bg-raised p-6 text-muted">{t('noSeason')}</p>;
  const today = helsinkiToday();

  const [{ data: invRows }, { data: playerRows }, { data: tsRows }] = await Promise.all([
    supabase.from('payments').select('id, player_id, invoice_number, amount_cents, paid_cents, status, due_on, players!inner(first_name, last_name), payment_lines(line_date)')
      .eq('season_id', season.id).eq('notes', 'season invoice').neq('status', 'refunded'),
    supabase.from('players').select('id, first_name, last_name').order('last_name'),
    supabase.from('team_seasons').select('id, team_players(player_id)').eq('season_id', season.id),
  ]);
  const invoices = ((invRows ?? []) as unknown as Inv[]).sort((a, b) => a.players.last_name.localeCompare(b.players.last_name) || a.players.first_name.localeCompare(b.players.first_name));
  const inSeason = new Set(((tsRows ?? []) as unknown as { team_players: { player_id: string }[] }[]).flatMap((x) => x.team_players.map((p) => p.player_id)));
  const billed = new Set(invoices.map((i) => i.player_id));
  const players = ((playerRows ?? []) as { id: string; first_name: string; last_name: string }[])
    .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, inSeason: inSeason.has(p.id), billed: billed.has(p.id) }))
    .sort((a, b) => Number(b.inSeason) - Number(a.inSeason) || a.name.localeCompare(b.name));
  const paidCents = (i: Inv) => (i.status === 'paid' ? i.amount_cents : i.paid_cents ?? 0);
  const total = invoices.reduce((a, i) => a + i.amount_cents, 0), paid = invoices.reduce((a, i) => a + paidCents(i), 0);
  const fullyPaid = invoices.filter((i) => i.status === 'paid').length;
  const monthName = new Intl.DateTimeFormat(tag, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const span = (i: Inv) => {
    const ds = i.payment_lines.map((l) => l.line_date).filter((d): d is string => !!d).sort();
    if (!ds.length) return '–';
    const f = (d: string) => monthName.format(new Date(`${d}T12:00:00Z`));
    return ds.length === 1 ? f(ds[0]!) : `${f(ds[0]!)} – ${f(ds.at(-1)!)} (${t('monthsN', { count: ds.length })})`;
  };
  const day = (iso: string) => fmt.date.format(new Date(`${iso}T12:00:00Z`));
  const result = one(sp.result);
  const okMsg = result === 'p_created' ? t('p_created', { count: Number(sp.n) || 0, skipped: Number(sp.skipped) || 0 }) : result === 'p_marked' ? t('p_marked', { count: Number(sp.n) || 0 }) : null;
  const errKeys = ['p_invalid', 'p_error', 'p_notAllowed', 'p_month', 'p_order', 'p_tooLong', 'p_fee', 'p_description', 'p_players', 'p_date', 'p_issueDate', 'p_dueDate', 'p_paidNone', 'p_paidDate'] as const;
  const errMsg = (errKeys as readonly string[]).includes(result) ? t(result as (typeof errKeys)[number]) : null;
  const banner = okMsg ? <p role="status" className="rounded-card bg-accent/15 p-3 font-semibold text-pitch">{okMsg}</p> : errMsg ? <p role="alert" className="rounded-card bg-danger/10 p-3 font-semibold text-danger">{errMsg}</p> : null;
  const seasonMonth = (iso: string) => iso.slice(0, 7);
  const lastMonth = season.ends_on < today ? seasonMonth(season.ends_on) : seasonMonth(today);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
        </div>
        <SeasonPicker seasons={seasons} current={season.id} label={t('season')} action="/admin/finance/past" />
      </header>

      <section aria-label={t('totals')} className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-past-totals>
        {([['invoiced', eur(total)], ['paid', eur(paid)], ['left', eur(total - paid)], ['players', `${fullyPaid}/${invoices.length}`]] as const).map(([k, v]) => (
          <div key={k} className={`rounded-card border p-4 ${k === 'left' && total - paid > 0 ? 'border-danger/40 bg-danger/5' : 'border-line bg-raised'}`} data-tile={k}>
            <p className="text-xs font-bold uppercase tracking-widest text-muted">{t(`tile_${k}`)}</p>
            <p className={`mt-1 font-display text-2xl font-black tabular-nums ${k === 'left' && total - paid > 0 ? 'text-danger' : ''}`}>{v}</p>
          </div>
        ))}
      </section>

      <section id="bill" className="scroll-mt-4 rounded-card border border-line bg-raised p-6" aria-labelledby="bill-h">
        <details open={!invoices.length || result.startsWith('p_') && !['p_marked', 'p_paidNone', 'p_paidDate'].includes(result) || undefined}>
          <summary className="cursor-pointer list-none">
            <h2 id="bill-h" className="inline font-display text-xl font-extrabold">+ {t('billTitle', { season: season.name })}</h2>
            <p className="mt-1 text-sm text-muted">{t('billLead')}</p>
          </summary>
          {banner && !['p_marked', 'p_paidNone', 'p_paidDate'].includes(result) ? <div className="mt-3">{banner}</div> : null}
          <SeasonBillingForm action={createSeasonInvoices} seasonId={season.id} locale={tag} players={players}
            defaults={{ from: seasonMonth(season.starts_on), to: lastMonth, issue: today, due: addDays(today, 30), description: t('defaultDescription', { season: season.name }), fee: '20' }}
            labels={{ from: t('from'), to: t('to'), fee: t('fee'), feeHint: t('feeHint'), description: t('description'), issue: t('issue'), due: t('due'), dueHint: t('dueHint'),
              players: t('players'), search: t('search'), all: t('all'), none: t('none'), create: t('create'), summary: t.raw('summary') as string, summaryNone: t('summaryNone'), hasTeam: t('hasTeam') }} />
        </details>
      </section>

      <section id="list" className="scroll-mt-4 rounded-card border border-line bg-raised p-6" aria-labelledby="list-h">
        <h2 id="list-h" className="font-display text-xl font-extrabold">{t('listTitle', { season: season.name })}</h2>
        {banner && ['p_marked', 'p_paidNone', 'p_paidDate'].includes(result) ? <div className="mt-3">{banner}</div> : null}
        {invoices.length === 0 ? <p className="mt-2 text-muted">{t('listNone')}</p> : (
          <form action={markSeasonInvoicesPaid} className="mt-3 grid gap-3">
            <input type="hidden" name="season_id" value={season.id} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-line text-start text-xs uppercase tracking-wider text-muted">
                  <th className="w-8 py-2" /><th className="py-2 text-start">{t('colPlayer')}</th><th className="py-2 text-start">{t('colMonths')}</th>
                  <th className="py-2 text-end">{t('colAmount')}</th><th className="py-2 text-end">{t('colPaid')}</th><th className="py-2 text-end">{t('colLeft')}</th><th className="py-2 text-start ps-4">{t('colStatus')}</th>
                </tr></thead>
                <tbody>
                  {invoices.map((i) => {
                    const left = i.amount_cents - paidCents(i), late = i.status !== 'paid' && i.due_on < today;
                    return (
                      <tr key={i.id} className="border-b border-line" data-season-invoice={`${i.players.first_name} ${i.players.last_name}`} data-status={i.status}>
                        <td className="py-2">{i.status !== 'paid' ? <input type="checkbox" name="ids" value={i.id} aria-label={t('pick', { name: `${i.players.first_name} ${i.players.last_name}` })} className="size-5 accent-accent" /> : null}</td>
                        <td className="py-2"><bdi className="font-semibold">{i.players.first_name} {i.players.last_name}</bdi>
                          {i.invoice_number ? <a href={`/invoices/${i.id}`} className="block text-xs text-pitch underline underline-offset-2" target="_blank" rel="noopener">{t('invoiceN', { n: i.invoice_number })}</a> : null}</td>
                        <td className="py-2">{span(i)}</td>
                        <td className="py-2 text-end tabular-nums">{eur(i.amount_cents)}</td>
                        <td className="py-2 text-end tabular-nums">{eur(paidCents(i))}</td>
                        <td className={`py-2 text-end font-bold tabular-nums ${left ? 'text-danger' : 'text-muted'}`}>{eur(left)}</td>
                        <td className="py-2 ps-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${i.status === 'paid' ? 'bg-accent/20 text-pitch' : late ? 'bg-danger/10 text-danger' : paidCents(i) ? 'bg-gold text-ink-950' : 'bg-line'}`}>
                            {i.status === 'paid' ? t('stPaid') : paidCents(i) ? t('stPart') : late ? t('stLate') : t('stOpen')}</span>
                          {i.status !== 'paid' ? <span className="block text-xs text-muted">{t('dueOn', { date: day(i.due_on) })}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr className="font-bold">
                  <td /><td className="py-2">{t('total')}</td><td />
                  <td className="py-2 text-end tabular-nums">{eur(total)}</td><td className="py-2 text-end tabular-nums">{eur(paid)}</td><td className="py-2 text-end tabular-nums text-danger">{eur(total - paid)}</td><td />
                </tr></tfoot>
              </table>
            </div>
            <div className="flex flex-wrap items-end gap-3 rounded-card bg-surface p-3">
              <label className="grid gap-1 text-sm font-semibold">{t('paidOn')}<input type="date" name="paid_on" required defaultValue={today} max={today} className="min-h-10 rounded-control border border-line bg-raised px-3 font-normal" /></label>
              <button className="min-h-10 rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110" data-mark-paid>{t('markPaid')}</button>
              <p className="basis-full text-xs text-muted">{t('partHint')} <a href={`/admin/invoices?status=pending#list-h`} className="font-semibold text-pitch underline underline-offset-2">{t('partLink')}</a></p>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
