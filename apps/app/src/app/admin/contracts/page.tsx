import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { createContract, saveContractSettings, saveTemplate } from '@/app/actions/contracts';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { CONTRACT_DEFAULTS, CONTRACT_STATUSES, STATUS_BADGE, loadContractSettings, shownStatus, type ContractStatus } from '@/lib/contracts';
import { dateFormats } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('contract'))('adminTitle') };
}

const input = 'min-h-11 w-full rounded-control border border-line bg-raised px-3';
type Row = { id: string; title: string; status: ContractStatus; starts_on: string; ends_on: string; years: number; player_id: string; is_minor?: boolean; players: { first_name: string; last_name: string } };

/** Admin → Contracts: list with status filter, new contract (1, 2 or 3 years) from the template, and the template itself. */
export default async function ContractsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, fmt, supabase] = await Promise.all([getTranslations('contract'), dateFormats(), getSupabase()]);
  const settings = supabase ? await loadContractSettings(supabase) : CONTRACT_DEFAULTS;
  const status = CONTRACT_STATUSES.find((s) => s === sp.status);
  const today = helsinkiToday();

  let q = supabase?.from('player_contracts').select('id, title, status, starts_on, ends_on, years, player_id, is_minor, players!inner(first_name, last_name)').order('created_at', { ascending: false }).limit(200);
  if (q && status) q = q.eq('status', status);
  // ?player=<id>: one player's contracts (link from Admin → Invoices, "waiting before invoicing")
  const player = typeof sp.player === 'string' && /^[0-9a-f-]{36}$/.test(sp.player) ? sp.player : '';
  if (q && player) q = q.eq('player_id', player);
  const [{ data: rows }, { data: all }, { data: players }, { data: teams }, { data: tpl }] = supabase ? await Promise.all([
    q!, supabase.from('player_contracts').select('status'),
    supabase.from('players').select('id, first_name, last_name, profile_id').not('profile_id', 'is', null).order('last_name'),
    supabase.from('team_seasons').select('id, teams!inner(name), seasons!inner(name, is_current)').eq('seasons.is_current', true),
    supabase.from('contract_templates').select('body').eq('is_default', true).maybeSingle(),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: null }];
  const list = (rows as unknown as Row[] | null) ?? [];
  // 0068: under 18 (signed as a minor, or under 18 today by the birth date): a parent or guardian signs too
  const minors = new Set(supabase ? (((await supabase.rpc('minor_players')).data as string[] | null) ?? []) : []);
  const under18 = (c: Row) => !!c.is_minor || minors.has(c.player_id);
  const n = (s: ContractStatus) => (all ?? []).filter((r) => r.status === s).length;
  const teamList = ((teams as unknown as { id: string; teams: { name: string }; seasons: { name: string } }[] | null) ?? []);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('adminTitle')}</h1>
        <p className="mt-1 text-muted">{t('adminLead')}</p>
      </header>
      <ResultBanner ns="contract" result={sp.result} />

      <section className="grid gap-3 sm:grid-cols-4" aria-label={t('adminTitle')}>
        {(['player_signed', 'sent', 'active', 'draft'] as const).map((s) => (
          <Link key={s} href={`/admin/contracts?status=${s}`} data-count={s} className={`rounded-card border p-4 hover:border-accent ${s === 'player_signed' && n(s) ? 'border-danger/40 bg-danger/5' : 'border-line bg-raised'}`}>
            <p className="text-sm text-muted">{t(`count_${s}`)}</p>
            <p className="font-display text-3xl font-black">{n(s)}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="list-h">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="list-h" className="font-display text-xl font-extrabold">{t('listTitle')}</h2>
          <form className="flex flex-wrap items-end gap-2" role="search">
            <label className="grid gap-1 text-sm font-semibold">{t('filterStatus')}
              <select name="status" defaultValue={status ?? ''} className="min-h-10 rounded-control border border-line bg-raised px-3 font-normal">
                <option value="">{t('all')}</option>
                {CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{t(`st_${s}`)}</option>)}
              </select>
            </label>
            <button className="min-h-10 rounded-full bg-accent px-5 font-bold text-on-accent hover:brightness-110">{t('apply')}</button>
          </form>
        </div>
        {list.length === 0 ? <p className="mt-3 text-muted">{t('empty')}</p> : (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr><th scope="col" className="px-2 py-2 text-start">{t('player')}</th><th scope="col" className="px-2 py-2 text-start">{t('contractCol')}</th>
                  <th scope="col" className="px-2 py-2 text-start">{t('term')}</th><th scope="col" className="px-2 py-2 text-start">{t('status')}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((c) => {
                  const st = shownStatus(c, today);
                  return (
                    <tr key={c.id} data-contract={c.id} data-status={st}>
                      <td className="px-2 py-2 font-semibold"><Link href={`/admin/contracts/${c.id}`} className="text-pitch underline underline-offset-2"><bdi>{c.players.first_name} {c.players.last_name}</bdi></Link>
                        {under18(c) ? <span className="ms-2 whitespace-nowrap rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-ink-950" data-under-18>{t('under18')}</span> : null}</td>
                      <td className="px-2 py-2">{c.title}</td>
                      <td className="whitespace-nowrap px-2 py-2">{fmt.date.format(new Date(`${c.starts_on}T12:00:00Z`))} – {fmt.date.format(new Date(`${c.ends_on}T12:00:00Z`))} · {t('yearsN', { count: c.years })}</td>
                      <td className="px-2 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[st]}`}>{t(`st_${st}`)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="new-h">
        <h2 id="new-h" className="font-display text-xl font-extrabold">{t('newTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('newLead')}</p>
        <form action={createContract} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">{t('player')}
            <select name="player_id" required defaultValue={player} className={input}>
              <option value="" disabled>{t('choose')}</option>
              {(players ?? []).map((p) => <option key={p.id} value={p.id}>{p.last_name} {p.first_name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">{t('team')}
            <select name="team_season_id" defaultValue="" className={input}>
              <option value="">–</option>
              {teamList.map((x) => <option key={x.id} value={x.id}>{x.teams.name} · {x.seasons.name}</option>)}
            </select>
          </label>
          <fieldset className="grid gap-1 sm:col-span-2">
            <legend className="text-sm font-semibold">{t('duration')}</legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3].map((y) => (
                <label key={y} className="relative">
                  <input type="radio" name="years" value={y} defaultChecked={y === 1} className="peer sr-only" />
                  <span className="flex min-h-11 cursor-pointer items-center rounded-full border-2 border-line px-5 font-bold peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{t('yearsN', { count: y })}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="grid gap-1 text-sm font-semibold">{t('startsOn')}<input name="starts_on" type="date" required defaultValue={today} className={input} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('endsOn')}<input name="ends_on" type="date" className={input} />
            <span className="text-xs font-normal text-muted">{t('endsOnHint')}</span></label>
          <button className="min-h-11 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110 sm:col-span-2 sm:justify-self-start">{t('createDraft')}</button>
        </form>
      </section>

      {/* 0037: automatic contracts when a player joins a team, and the fee lines of every contract */}
      <section className="rounded-card border-2 border-accent bg-raised p-6" aria-labelledby="auto-h" data-auto-contracts>
        <h2 id="auto-h" className="scroll-mt-4 font-display text-xl font-extrabold">{t('autoTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('autoLead')}</p>
        <form action={saveContractSettings} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">{t('autoMode')}
            <select name="auto" defaultValue={settings.auto} className={input}>
              <option value="send">{t('autoMode_send')}</option><option value="draft">{t('autoMode_draft')}</option><option value="off">{t('autoMode_off')}</option>
            </select></label>
          <label className="grid gap-1 text-sm font-semibold">{t('autoYears')}
            <select name="years" defaultValue={String(settings.years)} className={input}>{[1, 2, 3].map((y) => <option key={y} value={y}>{t('yearsN', { count: y })}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t('autoTeamFee')}
            <input name="team_fee" maxLength={200} defaultValue={settings.team_fee} placeholder={settings.plan_fee || t('autoTeamFeeEg')} className={input} lang="en" dir="ltr" data-team-fee />
            {settings.plan_fee ? (
              <span className="text-xs font-normal text-muted" data-plan-fee>
                {settings.team_fee ? t('autoTeamFeeOwn') : t('autoTeamFeeFromPlans')} <bdi lang="en" dir="ltr" className="font-semibold text-fg">{settings.plan_fee}</bdi>.{' '}
                <a href="/admin/invoices#plans-h" className="font-semibold text-pitch underline underline-offset-2">{t('autoTeamFeePlansLink')}</a>
              </span>
            ) : null}</label>
          <label className="grid gap-1 text-sm font-semibold">{t('autoIncluded')}
            <textarea name="included" rows={6} maxLength={1000} defaultValue={settings.included} lang="en" dir="ltr" className="rounded-control border border-line bg-raised p-3 font-normal" data-included /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('autoNotIncluded')}
            <textarea name="not_included" rows={6} maxLength={1000} defaultValue={settings.not_included} lang="en" dir="ltr" className="rounded-control border border-line bg-raised p-3 font-normal" data-not-included /></label>
          <p className="text-xs text-muted sm:col-span-2">{t('autoListHint')}</p>
          <fieldset className="grid gap-3 rounded-card bg-surface p-4 sm:col-span-2 sm:grid-cols-2" data-signatory>
            <legend className="sr-only">{t('signatoryTitle')}</legend>
            <p className="font-display font-bold sm:col-span-2">{t('signatoryTitle')}</p>
            <label className="grid gap-1 text-sm font-semibold">{t('signatoryName')}
              <input name="signatory_name" minLength={2} maxLength={120} defaultValue={settings.signatory_name} placeholder={t('signatoryNameEg')} autoComplete="off" className={input} data-signatory-name /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('signatoryRole')}
              <input name="signatory_title" maxLength={80} defaultValue={settings.signatory_title} placeholder={t('signatoryRoleEg')} lang="en" dir="ltr" className={input} data-signatory-title /></label>
            <p className="text-xs text-muted sm:col-span-2">{t('signatoryHint')}</p>
          </fieldset>
          <p className="text-xs text-muted sm:col-span-2">{t('autoFieldsNote')}</p>
          <button className="min-h-11 justify-self-start rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">{t('autoSave')}</button>
        </form>
        {!(settings.team_fee || settings.plan_fee) || !settings.included
          ? <p className="mt-3 rounded-card bg-danger/10 p-3 text-sm font-semibold text-danger" data-auto-incomplete>{t('autoIncomplete')}</p> : null}
      </section>

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="tpl-h">
        <h2 id="tpl-h" className="font-display text-xl font-extrabold">{t('templateTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('templateLead')}</p>
        <details className="mt-3">
          <summary className="cursor-pointer font-semibold">{t('editTemplate')}</summary>
          <form action={saveTemplate} className="mt-3 grid gap-3">
            <label className="grid gap-1 text-sm font-semibold">{t('templateTitle')}
              <textarea name="body" required minLength={50} maxLength={40000} rows={22} defaultValue={tpl?.body ?? ''} lang="en" dir="ltr" className="rounded-control border border-line bg-raised p-3 font-mono text-sm" /></label>
            <button className="min-h-11 justify-self-start rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">{t('saveTemplate')}</button>
          </form>
        </details>
      </section>
    </div>
  );
}
