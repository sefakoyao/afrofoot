import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { SeasonPicker } from '@/components/admin/SeasonPicker';
import { requireArea } from '@/lib/auth';
import { dateFormats, isolate } from '@/lib/format';
import { moneyFormat, pickSeason } from '@/lib/finance';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('fin'))('balTitle') };
}

type Row = { player_id: string; first_name: string; last_name: string; invoiced_cents: number; paid_cents: number; open_cents: number; overdue_cents: number; balance_cents: number; oldest_due: string | null; last_paid_at: string | null; invoices: number };
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

/**
 * Admin → Finance → Player balances (migration 0054, finance_balances): for each player of the season, what was invoiced,
 * paid, open and overdue in the season, and the balance still unpaid from any season. Players who owe come first.
 */
export default async function BalancesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, locale, fmt, supabase] = await Promise.all([getTranslations('fin'), getLocale(), dateFormats(), getSupabase()]);
  if (!supabase) return null;
  const eur = moneyFormat(locale);
  const { seasons, season } = await pickSeason(supabase, one(sp.season));
  if (!season) return <p className="rounded-card bg-raised p-6 text-muted">{t('noSeason')}</p>;
  const show = one(sp.show) === 'all' ? 'all' : 'owing';
  const q = one(sp.q).trim().toLowerCase().slice(0, 60);
  const { data } = await supabase.rpc('finance_balances', { p_season: season.id });
  const all = ((data ?? []) as Row[]).map((r) => ({ ...r, invoiced_cents: Number(r.invoiced_cents), paid_cents: Number(r.paid_cents), open_cents: Number(r.open_cents), overdue_cents: Number(r.overdue_cents), balance_cents: Number(r.balance_cents) }));
  const rows = all
    .filter((r) => (show === 'all' || r.balance_cents > 0) && (!q || `${r.first_name} ${r.last_name}`.toLowerCase().includes(q)))
    .sort((a, b) => b.overdue_cents - a.overdue_cents || b.balance_cents - a.balance_cents || a.last_name.localeCompare(b.last_name));
  const sum = (k: 'invoiced_cents' | 'paid_cents' | 'open_cents' | 'overdue_cents' | 'balance_cents') => rows.reduce((a, r) => a + r[k], 0);
  const owing = all.filter((r) => r.balance_cents > 0).length, overdueN = all.filter((r) => r.overdue_cents > 0).length;
  const day = (iso: string | null) => (iso ? fmt.date.format(new Date(`${iso}T12:00:00Z`)) : '–');
  const href = (s: string) => `/admin/finance/balances?${new URLSearchParams({ season: season.id, show: s, ...(q ? { q } : {}) })}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">{t('balTitle')}</h1>
          <p className="mt-1 max-w-3xl text-muted">{t('balLead')}</p>
        </div>
        <SeasonPicker seasons={seasons} current={season.id} label={t('season')} action="/admin/finance/balances" keep={{ show }} />
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-bal-totals>
        {[['players', String(all.length)], ['owing', String(owing)], ['overdueN', String(overdueN)], ['owed', eur(all.reduce((a, r) => a + r.balance_cents, 0))]].map(([k, v]) => (
          <div key={k} className={`rounded-card p-4 ${k === 'overdueN' && overdueN ? 'bg-danger/10' : 'bg-raised border border-line'}`} data-bal-total={k}>
            <dt className="text-sm text-muted">{t(`bal_${k}` as 'bal_players')}</dt><dd className="font-display text-2xl font-black tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="rounded-card border border-line bg-raised p-4 sm:p-6" aria-label={t('balTitle')}>
        <div className="flex flex-wrap items-end gap-2">
          <form className="flex flex-1 flex-wrap items-end gap-2" role="search">
            <input type="hidden" name="season" value={season.id} /><input type="hidden" name="show" value={show} />
            <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold sm:max-w-xs">{t('balSearch')}<input name="q" defaultValue={q} maxLength={60} className="min-h-10 rounded-control border border-line bg-raised px-3" /></label>
            <button className="min-h-10 rounded-full bg-accent px-5 font-bold text-on-accent">{t('find')}</button>
          </form>
          {(['owing', 'all'] as const).map((s) => (
            <a key={s} href={href(s)} aria-current={s === show ? 'page' : undefined} data-bal-show={s}
              className={`inline-flex min-h-10 items-center rounded-full border-2 px-4 text-sm font-semibold ${s === show ? 'border-ink-950 bg-ink-950 text-white' : 'border-line hover:border-ink-950'}`}>{t(`bal_show_${s}`)}</a>
          ))}
        </div>
        {rows.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm" data-balances>
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-2 py-2 text-start">{t('b_player')}</th>
                  {['b_invoiced', 'b_paid', 'b_open', 'b_overdue', 'b_balance'].map((k) => <th key={k} scope="col" className="px-2 py-2 text-end">{t(k as 'b_paid', { season: season.name })}</th>)}
                  <th scope="col" className="px-2 py-2 text-start">{t('b_oldest')}</th>
                  <th scope="col" className="px-2 py-2"><span className="sr-only">{t('b_actions')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.player_id} data-balance-row={`${r.first_name} ${r.last_name}`} data-overdue={r.overdue_cents > 0 || undefined}>
                    <th scope="row" className="px-2 py-2 text-start font-semibold">{isolate(`${r.first_name} ${r.last_name}`)}</th>
                    <td className="px-2 py-2 text-end tabular-nums">{r.invoiced_cents ? eur(r.invoiced_cents) : '–'}</td>
                    <td className="px-2 py-2 text-end tabular-nums">{r.paid_cents ? eur(r.paid_cents) : '–'}</td>
                    <td className="px-2 py-2 text-end tabular-nums">{r.open_cents ? eur(r.open_cents) : '–'}</td>
                    <td className={`px-2 py-2 text-end tabular-nums ${r.overdue_cents ? 'font-bold text-danger' : ''}`}>{r.overdue_cents ? eur(r.overdue_cents) : '–'}</td>
                    <td className="px-2 py-2 text-end font-bold tabular-nums" data-balance>{eur(r.balance_cents)}</td>
                    <td className="whitespace-nowrap px-2 py-2">{day(r.oldest_due)}</td>
                    <td className="px-2 py-2 text-end">
                      <span className="flex flex-wrap justify-end gap-x-3 gap-y-1">
                        <a href={`/admin/invoices?player=${r.player_id}#list-h`} className="whitespace-nowrap font-semibold text-pitch underline underline-offset-2">{t('b_invoices', { count: r.invoices })}</a>
                        <a href={`/admin/invoices?for=${r.player_id}#balance`} className="whitespace-nowrap font-semibold text-pitch underline underline-offset-2" data-new-balance>{t('b_newInvoice')}</a>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line font-bold">
                <tr data-bal-sum>
                  <th scope="row" className="px-2 py-2 text-start">{t('total')}</th>
                  {(['invoiced_cents', 'paid_cents', 'open_cents', 'overdue_cents', 'balance_cents'] as const).map((k) => <td key={k} className="px-2 py-2 text-end tabular-nums">{eur(sum(k))}</td>)}
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : <p className="mt-4 text-muted" data-bal-empty>{show === 'owing' ? t('balNoneOwing') : t('balNone')}</p>}
        <p className="mt-3 text-xs text-muted">{t('balNote')}</p>
      </section>
    </div>
  );
}
