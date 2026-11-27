import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ADMIN_ROLES, assignableRoles, canManageMember, COACH_ROLES, isPlayerRole, isRole, PLAYER_ROLES, type Role, ROLES } from '@afrofoot/db';
import { bulkMembers, updateMember } from '@/app/actions/members';
import { resetMfa } from '@/app/actions/mfa';
import { BulkBar } from '@/components/admin/BulkBar';
import { ContractsNote } from '@/components/admin/ContractsNote';
import { TeamSelect } from '@/components/admin/TeamSelect';
import { currentTeams, type Group } from '@/lib/roster';
import { requireArea } from '@/lib/auth';
import { dateFormats, isolate } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { loadPaperwork, type Paperwork } from '@/lib/paperwork';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin'))('membersTitle') };
}

const PAGE_SIZE = 25;
const RESULTS_OK = ['approve', 'approvedToTeam', 'suspend', 'reactivate', 'roleChanged', 'unchanged', 'mfaReset'];
const RESULTS_ERR = ['notAllowed', 'lastSuper', 'notFound', 'invalid', 'error', 'approveNoName', 'approveNotPlayer', 'bulkNone', 'bulkNoTeam'];
const STATUS_BADGE: Record<string, string> = { active: 'bg-accent/20 text-pitch', pending: 'bg-ink-950 text-white', suspended: 'bg-danger/15 text-danger' };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
/** Search text for PostgREST: drop the characters that have a meaning in its filter syntax. */
const cleanQuery = (q: string) => q.replace(/[,()*%\\:"']/g, ' ').trim().slice(0, 60);

export default async function MembersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requireArea('admin');
  const sp = await searchParams;
  const [t, tr, ts, fmt, supabase] = await Promise.all([getTranslations('admin'), getTranslations('role'), getTranslations('status'), dateFormats(), getSupabase()]);

  // ---------- filters: search, one quick filter (pill), page ----------
  const q = cleanQuery(one(sp.q));
  const FILTERS = ['players', 'coaches', 'admins', 'pending', 'suspended', 'active', 'paperwork', 'conduct', 'overdue', 'dob'] as const;
  type Filter = (typeof FILTERS)[number];
  // older links: ?role=…, ?status=…, ?conduct=missing
  const legacyRole = ROLES.find((r) => r === one(sp.role));
  const f: Filter | '' = (FILTERS as readonly string[]).includes(one(sp.f)) ? (one(sp.f) as Filter)
    : one(sp.conduct) === 'missing' ? 'conduct' : one(sp.status) === 'pending' ? 'pending' : one(sp.status) === 'suspended' ? 'suspended' : one(sp.status) === 'active' ? 'active' : '';
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);
  const result = one(sp.result);

  // ---------- the club's players' paperwork (for the tiles and the paperwork filters) ----------
  const { data: activePlayers } = supabase ? await supabase.from('profiles').select('id').in('role', [...PLAYER_ROLES]).eq('status', 'active').limit(2000) : { data: [] };
  const activeIds = (activePlayers ?? []).map((r) => r.id as string);
  const { data: allLinks } = supabase && activeIds.length ? await supabase.from('players').select('id, profile_id').in('profile_id', activeIds) : { data: [] };
  const clubPw = supabase ? await loadPaperwork(supabase, (allLinks ?? []).map((p) => ({ profileId: p.profile_id as string, playerId: p.id as string }))) : new Map<string, Paperwork>();
  const cocMissing = new Set<string>(), overdue = new Set<string>(), missing = new Set<string>(), noDob = new Set<string>();
  let overdueCents = 0;
  for (const [id, pw] of clubPw) {
    if (pw.conduct === null) cocMissing.add(id);
    if (pw.birth && !pw.birth.date) noDob.add(id);
    if (pw.fees?.state === 'overdue') { overdue.add(id); overdueCents += pw.fees.overdueCents; }
    const noContract = pw.contract !== undefined && (pw.contract === null || pw.contract.status !== 'active');
    if (noContract || pw.conduct === null || pw.fees?.state === 'overdue') missing.add(id);
  }
  const only = (ids: Set<string>) => (ids.size ? [...ids] : ['00000000-0000-0000-0000-000000000000']);

  // ---------- the page of members ----------
  let query = supabase?.from('profiles').select('id, email, phone, first_name, last_name, role, status, created_at', { count: 'exact' })
    .order('status', { ascending: true }).order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (query && q) query = query.or(`email.ilike.*${q}*,phone.ilike.*${q}*,first_name.ilike.*${q}*,last_name.ilike.*${q}*`);
  if (query && legacyRole) query = query.eq('role', legacyRole);
  if (query) {
    if (f === 'players') query = query.in('role', [...PLAYER_ROLES]);
    else if (f === 'coaches') query = query.in('role', [...COACH_ROLES]);
    else if (f === 'admins') query = query.in('role', [...ADMIN_ROLES]);
    else if (f === 'pending' || f === 'suspended' || f === 'active') query = query.eq('status', f);
    else if (f === 'conduct') query = query.in('id', only(cocMissing));
    else if (f === 'overdue') query = query.in('id', only(overdue));
    else if (f === 'paperwork') query = query.in('id', only(missing));
    else if (f === 'dob') query = query.in('id', only(noDob));
  }
  const counted = (fn: (x: NonNullable<typeof query>) => NonNullable<typeof query>) =>
    supabase ? fn(supabase.from('profiles').select('id', { count: 'exact', head: true }) as unknown as NonNullable<typeof query>).then((r) => r.count ?? 0) : Promise.resolve(0);
  const [{ data, count }, nAll, nPlayers, nCoaches, nAdmins, nPending, nActive] = await Promise.all([
    query ? query : Promise.resolve({ data: [], count: 0 }),
    counted((x) => x), counted((x) => x.in('role', [...PLAYER_ROLES])), counted((x) => x.in('role', [...COACH_ROLES])), counted((x) => x.in('role', [...ADMIN_ROLES])),
    counted((x) => x.eq('status', 'pending')), counted((x) => x.eq('status', 'active')),
  ]);
  const rows = data ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const params = (over: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, f, role: legacyRole, page: String(page), ...over })) if (v && !(k === 'page' && v === '1')) u.set(k, String(v));
    return `/admin/members${u.size ? `?${u}` : ''}`;
  };
  const back = params({});
  const choices = assignableRoles(actor.role);
  const { data: playerLinks } = supabase && rows.length ? await supabase.from('players').select('id, profile_id').in('profile_id', rows.map((r) => r.id)) : { data: [] };
  const playerOf = new Map((playerLinks ?? []).map((p) => [p.profile_id, p.id]));
  const paperwork = supabase ? await loadPaperwork(supabase, rows.filter((r) => isPlayerRole(r.role) && playerOf.get(r.id)).map((r) => ({ profileId: r.id, playerId: playerOf.get(r.id)! }))) : new Map<string, Paperwork>();
  const locale = fmt.date.resolvedOptions().locale;
  const euro = (cents: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  const fmts = { monthYear: new Intl.DateTimeFormat(locale, { month: '2-digit', year: 'numeric', timeZone: 'Europe/Helsinki' }), dayMonth: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'Europe/Helsinki' }), date: fmt.date };
  const teams = supabase ? await currentTeams(supabase) : [];
  const groupLabel = (g: Group) => t(`group_${g}`);
  const n = (k: string) => Number(one(sp[k])) || 0;

  const pill = (key: Filter | '', label: string, num?: number, alert?: boolean) => (
    <Link href={params({ f: key || undefined, page: 1 })} aria-current={f === key ? 'true' : undefined} data-filter={key || 'all'}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold ${f === key ? 'border-fg bg-fg text-white' : 'border-line bg-raised hover:border-accent'}`}>
      {label}{num !== undefined ? (alert && num ? <span className="rounded-full bg-danger px-1.5 text-xs text-white">{num}</span> : <span className={f === key ? 'text-white/70' : 'text-muted'}>{num}</span>) : null}
    </Link>
  );
  const tile = (key: Filter, num: string | number, label: string, tone: 'gold' | 'plain' | 'red') => (
    <Link href={params({ f: key, page: 1, q: undefined })} data-tile={key}
      className={`grid rounded-card border p-4 transition hover:border-accent ${tone === 'gold' ? 'border-gold bg-gold text-ink-950' : 'border-line bg-raised'} ${f === key ? 'ring-2 ring-accent' : ''}`}>
      <span className={`font-display text-3xl font-black leading-none ${tone === 'red' && num && num !== '€0' ? 'text-danger' : ''}`}>{num}</span>
      <span className={`mt-1 text-sm font-semibold ${tone === 'gold' ? '' : 'text-muted'}`}>{label}</span>
    </Link>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-3xl font-extrabold">{t('membersTitle')}</h1>
        <p className="mt-1 text-muted">{t('membersLead2')}</p>
      </header>

      {RESULTS_OK.includes(result) ? <p role="status" className="rounded-card bg-accent/15 p-3 font-semibold text-pitch">{t(`result_${result}`)}</p> : null}
      {result === 'bulk' ? <p role="status" className="rounded-card bg-accent/15 p-3 font-semibold text-pitch" data-bulk-result>{t('result_bulk', { approved: n('a'), added: n('t'), skipped: n('s') })}{n('already') ? ` ${t('result_bulkAlready', { count: n('already') })}` : ''}</p> : null}
      <ContractsNote sp={sp} />
      {RESULTS_ERR.includes(result) ? <p role="alert" className="rounded-card bg-danger/10 p-3 font-semibold text-danger">{t(`result_${result}`)}</p> : null}

      {/* the club at a glance; each tile filters the list */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-member-tiles>
        {tile('pending', nPending, t('k_pending'), 'gold')}
        {tile('active', nActive, t('k_active'), 'plain')}
        {tile('conduct', cocMissing.size, t('k_conduct'), 'red')}
        {tile('overdue', euro(overdueCents), t('k_overdue', { count: overdue.size }), 'red')}
      </div>

      {/* search and quick filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-raised p-2.5">
        <form role="search" className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-full border border-line bg-raised px-3">
          <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          {f ? <input type="hidden" name="f" value={f} /> : null}
          <input name="q" defaultValue={q} type="search" maxLength={60} aria-label={t('search')} placeholder={t('searchHint')} className="min-h-10 w-full min-w-0 bg-transparent outline-none" />
        </form>
        <nav aria-label={t('filters')} className="flex flex-wrap gap-2" data-member-filters>
          {pill('', t('f_all'), nAll)}{pill('players', t('f_players'), nPlayers)}{pill('coaches', t('f_coaches'), nCoaches)}{pill('admins', t('f_admins'), nAdmins)}
          {pill('pending', t('f_pending'), nPending, true)}{pill('paperwork', t('f_paperwork'), missing.size, true)}{pill('dob', t('f_dob'), noDob.size, true)}
        </nav>
      </div>
      <p className="-mt-2 px-1 text-xs text-muted" data-pw-legend>{t('pw_legend')}</p>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('total', { count: count ?? 0 })}</p>
        {q || f || legacyRole ? <Link href="/admin/members" className="text-sm font-semibold text-pitch underline">{t('clear')}</Link> : null}
      </div>
      {rows.length ? (
        <BulkBar formId="bulk-members" action={bulkMembers} back={back}
          teamSelect={<TeamSelect teams={teams} groupLabel={groupLabel} emptyLabel={t('chooseTeam')} />}
          labels={{ title: t('bulkTitle'), selectAll: t('selectAll'), action: t('bulkAction'), approve: t('bulk_approve'), team: t('bulk_team'), approveTeam: t('bulk_approveTeam'),
            teamLabel: t('bulkTeam'), apply: t('bulkApply', { count: '{count}' }), none: t('bulkPick') }} />
      ) : null}

      {rows.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-center text-muted">{t('empty')}</p> : (
        <div className="rounded-card border border-line bg-raised md:overflow-visible">
          <table className="w-full text-start text-sm md:table-fixed">
            <thead className="hidden border-b border-line bg-surface/60 text-[11px] uppercase tracking-widest text-muted md:table-header-group">
              <tr>
                <th scope="col" className="w-11 px-3 py-3"><span className="sr-only">{t('selectCol')}</span></th>
                <th scope="col" className="px-3 py-3 text-start">{t('colMember')}</th>
                <th scope="col" className="w-24 px-2 py-3 text-start">{t('colStatus')}</th>
                <th scope="col" className="w-60 px-2 py-3 text-start">{t('colPaperwork')}</th>
                <th scope="col" className="w-36 px-3 py-3"><span className="sr-only">{t('colActions')}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m) => {
                const mRole: Role = isRole(m.role) ? m.role : 'player';
                const manageable = canManageMember(actor, { id: m.id, role: mRole });
                const name = `${m.first_name} ${m.last_name}`.trim();
                const initials = (name || m.email || m.phone || '?').split(/[\s@]+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]!.toUpperCase()).join('');
                const statusBadge = <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_BADGE[m.status] ?? ''}`}>{ts(m.status)}</span>;
                return (
                  <tr key={m.id} data-member={m.email ?? m.phone} data-pending={m.status === 'pending' ? (m.email ?? m.phone) : undefined}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-3 hover:bg-accent/5 has-[input[data-select]:checked]:bg-accent/10 md:table-row md:p-0">
                    <td className="md:px-3 md:py-3">{manageable && m.id !== actor.id
                      ? <input type="checkbox" name="ids" value={m.id} form="bulk-members" aria-label={t('selectMember', { name: name || m.email || m.phone || '' })} className="size-5 accent-accent" data-select />
                      : <span className="block size-5" />}</td>
                    <td className="min-w-0 md:px-3 md:py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent font-display text-sm font-black text-on-accent" aria-hidden>{initials}</span>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-x-2 font-bold">{name ? isolate(name) : <span className="text-muted">{t('noName')}</span>}
                            {m.id === actor.id ? <span className="rounded-full bg-line px-2 text-xs font-semibold">{t('you')}</span> : null}
                            <span className="md:hidden">{statusBadge}</span></p>
                          <p className="truncate text-xs text-muted" dir="ltr" style={{ textAlign: 'start' }}><bdi>{m.email ?? m.phone}</bdi>{m.email ? null : <span className="ms-2 rounded-full bg-line px-2" dir="auto">{t('phoneAccount')}</span>}
                            </p>
                          <p className="text-xs text-muted" dir="auto">{tr(mRole)}<span className="hidden md:inline"> · {t('joinedOn', { date: fmts.dayMonth.format(new Date(m.created_at)) })}</span></p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell md:px-2 md:py-3">{statusBadge}</td>
                    <td className="col-span-3 md:px-2 md:py-3">{isPlayerRole(mRole) ? <PaperworkChips pw={paperwork.get(m.id)} playerId={playerOf.get(m.id)} t={t} fmts={fmts} euro={euro} /> : null}</td>
                    <td className="col-start-3 row-start-1 md:whitespace-nowrap md:px-3 md:py-3">
                      <div className="flex items-center justify-end gap-2">
                        {manageable && m.status === 'pending' ? (isPlayerRole(mRole) && teams.length ? (
                          <details className="relative" data-approve-menu>
                            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-full bg-accent px-4 font-bold text-on-accent hover:brightness-110 [&::-webkit-details-marker]:hidden">{t('approve')}</summary>
                            <form action={updateMember} className="absolute end-0 top-full z-20 mt-2 grid w-64 gap-2 rounded-card border border-line bg-raised p-3 shadow-xl">
                              <input type="hidden" name="id" value={m.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="op" value="approve" />
                              <label className="grid gap-1 text-xs font-semibold">{t('assignGroup')}<TeamSelect teams={teams} groupLabel={groupLabel} emptyLabel={t('noGroup')} /></label>
                              <button className="min-h-10 rounded-full bg-accent px-5 font-bold text-on-accent hover:brightness-110" data-approve>{t('approveNow')}</button>
                            </form>
                          </details>
                        ) : <ActionButton id={m.id} back={back} op="approve" label={t('approve')} primary />) : null}
                        {manageable || m.id === actor.id ? (
                          <details className="relative" data-row-menu>
                            <summary aria-label={t('moreActions', { name: name || m.email || m.phone || '' })}
                              className="grid size-9 cursor-pointer list-none place-items-center rounded-full border border-line bg-raised text-lg font-black hover:border-accent [&::-webkit-details-marker]:hidden">⋯</summary>
                            <div className="absolute end-0 top-full z-20 mt-2 grid w-64 gap-2 rounded-card border border-line bg-raised p-3 text-start shadow-xl">
                              {manageable ? (
                                <>
                                  {m.status === 'suspended' ? <ActionButton id={m.id} back={back} op="reactivate" label={t('reactivate')} primary /> : null}
                                  {m.status !== 'suspended' && m.id !== actor.id ? <ActionButton id={m.id} back={back} op="suspend" label={t('suspend')} /> : null}
                                  <form action={updateMember} className="grid gap-1.5">
                                    <input type="hidden" name="id" value={m.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="op" value="role" />
                                    <label className="grid gap-1 text-xs font-semibold">{t('colRole')}
                                      <select name="role" defaultValue={mRole} aria-label={`${t('colRole')}: ${m.email ?? m.phone}`} className="min-h-9 rounded-control border border-line bg-raised px-2 font-normal">
                                        {choices.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
                                      </select></label>
                                    <button className="min-h-9 rounded-full border border-fg px-3 font-semibold hover:bg-fg hover:text-raised">{t('saveRole')}</button>
                                  </form>
                                </>
                              ) : <span className="text-xs text-muted">{t('onlySuper')}</span>}
                              {actor.role === 'super_admin' && m.id !== actor.id && ADMIN_ROLES.includes(mRole) ? (
                                <form action={resetMfa} className="grid gap-1 border-t border-line pt-2" data-mfa-reset>
                                  <input type="hidden" name="id" value={m.id} />
                                  <button className="min-h-9 rounded-full border border-danger px-3 text-sm font-semibold text-danger hover:bg-danger/10">{t('mfaReset')}</button>
                                  <span className="text-[11px] leading-snug text-muted">{t('mfaResetHint')}</span>
                                </form>
                              ) : null}
                              <a href={`/admin/signin-help?member=${m.id}#help`} className="text-sm font-semibold text-pitch underline underline-offset-2" data-signin-help-link>{t('signinHelp')}</a>
                            </div>
                          </details>
                        ) : <span className="text-xs text-muted">{t('onlySuper')}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label={t('page', { page, pages })}>
          {page > 1 ? <Link href={params({ page: page - 1 })} className="rounded-full border border-line px-4 py-2 font-semibold hover:border-accent">{t('prev')}</Link> : <span />}
          <span className="text-muted">{t('page', { page, pages })}</span>
          {page < pages ? <Link href={params({ page: page + 1 })} className="rounded-full border border-line px-4 py-2 font-semibold hover:border-accent">{t('next')}</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}

const CHIP = 'inline-flex w-fit items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold';
const CONTRACT_CHIP: Record<string, string> = {
  active: 'bg-accent/20 text-pitch', player_signed: 'bg-danger text-white', sent: 'bg-ink-950 text-white', draft: 'bg-line text-fg',
  expired: 'bg-gold text-ink-950', terminated: 'bg-line text-muted',
};
const FEE_CHIP = { paid: 'bg-accent/20 text-pitch', unpaid: 'bg-gold text-ink-950', overdue: 'bg-danger text-white', none: 'bg-line text-muted' } as const;
type Fmts = { monthYear: Intl.DateTimeFormat; dayMonth: Intl.DateTimeFormat; date: Intl.DateTimeFormat };

/**
 * A player's paperwork as short tags (CTR contract, CoC Code of Conduct, invoices; the full wording on hover and for
 * screen readers): the contract opens that contract (or Contracts for the player), a missing CoC opens the list of
 * everyone missing, the fees open the player's invoices. A part the database does not have yet is left out.
 */
function PaperworkChips({ pw, playerId, t, fmts, euro }: { pw?: Paperwork; playerId?: string; t: Awaited<ReturnType<typeof getTranslations<'admin'>>>; fmts: Fmts; euro: (cents: number) => string }) {
  if (!playerId) return <span className="text-xs text-muted" data-paperwork="none">{t('pw_noPlayer')}</span>;
  const c = pw?.contract, f = pw?.fees;
  const tag = (href: string | null, cls: string, short: string, full: string, data: Record<string, string>) => {
    const inner = <><span aria-hidden="true">{short}</span><span className="sr-only">{full}</span></>;
    return href ? <a href={href} title={full} className={`${CHIP} ${cls} hover:ring-2 hover:ring-accent/40`} {...data}>{inner}</a> : <span title={full} className={`${CHIP} ${cls}`} {...data}>{inner}</span>;
  };
  return (
    <div className="flex flex-wrap gap-1.5" data-paperwork>
      {c !== undefined ? (c
        ? tag(`/admin/contracts/${c.id}`, CONTRACT_CHIP[c.status] ?? 'bg-line',
          c.status === 'active' ? t('pw_s_contract_active', { date: fmts.monthYear.format(new Date(c.endsOn)) }) : t(`pw_s_contract_${c.status}` as 'pw_s_contract_sent'),
          c.status === 'active' ? t('pw_contract_active', { date: fmts.date.format(new Date(c.endsOn)) }) : t(`pw_contract_${c.status}` as 'pw_contract_sent'), { 'data-pw-contract': c.status })
        : tag(`/admin/contracts?player=${playerId}`, 'border border-line bg-raised text-muted', t('pw_s_contract_none'), t('pw_contract_none'), { 'data-pw-contract': 'none' })) : null}
      {pw?.conduct !== undefined ? (pw.conduct
        ? tag(null, 'bg-accent/20 text-pitch', t('pw_s_conduct_ok', { date: fmts.dayMonth.format(new Date(pw.conduct.at)) }), t('pw_conduct_ok', { date: fmts.date.format(new Date(pw.conduct.at)) }), { 'data-pw-conduct': 'ok' })
        : tag('/admin/members?f=conduct', 'border border-danger bg-raised text-danger', t('pw_s_conduct_missing'), t('pw_conduct_missing'), { 'data-pw-conduct': 'missing', 'data-conduct-flag': '' })) : null}
      {f ? tag(`/admin/invoices?player=${playerId}#list-h`, FEE_CHIP[f.state],
        f.state === 'overdue' ? t('pw_s_fees_overdue', { amount: euro(f.overdueCents) }) : f.state === 'unpaid' ? t('pw_s_fees_unpaid', { amount: euro(f.openCents) }) : t(`pw_s_fees_${f.state}`),
        f.state === 'overdue' ? t('pw_fees_overdue', { amount: euro(f.overdueCents) }) : f.state === 'unpaid' ? t('pw_fees_unpaid', { amount: euro(f.openCents) }) : t(`pw_fees_${f.state}`),
        { 'data-pw-fees': f.state }) : null}
      {pw?.birth && !pw.birth.date ? tag('/admin/members?f=dob', 'border border-danger bg-raised text-danger', t('pw_s_dob_missing'), t('pw_dob_missing'), { 'data-pw-dob': 'missing' }) : null}
      {pw?.birth?.date && pw.birth.minor ? tag(null, 'bg-gold text-ink-950', t('pw_s_dob_minor'), t('pw_dob_minor', { date: fmts.date.format(new Date(`${pw.birth.date}T12:00:00Z`)) }), { 'data-pw-dob': 'minor' }) : null}
    </div>
  );
}

function ActionButton({ id, back, op, label, primary }: { id: string; back: string; op: 'approve' | 'suspend' | 'reactivate'; label: string; primary?: boolean }) {
  return (
    <form action={updateMember}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="op" value={op} />
      <button className={`min-h-9 w-full rounded-full px-4 font-bold ${primary ? 'bg-accent text-on-accent hover:brightness-110' : op === 'suspend' ? 'border border-danger text-danger hover:bg-danger/10' : 'border border-line'}`} data-approve={op === 'approve' ? '' : undefined}>{label}</button>
    </form>
  );
}
