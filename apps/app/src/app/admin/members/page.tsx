import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ACCOUNT_STATUSES, assignableRoles, canManageMember, isPlayerRole, isRole, PLAYER_ROLES, type Role, ROLES } from '@afrofoot/db';
import { bulkMembers, updateMember } from '@/app/actions/members';
import { BulkBar } from '@/components/admin/BulkBar';
import { ContractsNote } from '@/components/admin/ContractsNote';
import { TeamSelect } from '@/components/admin/TeamSelect';
import { currentTeams, type Group } from '@/lib/roster';
import { requireArea } from '@/lib/auth';
import { dateFormats, isolate } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { missingConsent } from '@/lib/conduct';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin'))('membersTitle') };
}

const PAGE_SIZE = 25;
const RESULTS_OK = ['approve', 'approvedToTeam', 'suspend', 'reactivate', 'roleChanged', 'unchanged'];
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

  const q = cleanQuery(one(sp.q));
  const role = ROLES.find((r) => r === one(sp.role));
  const status = ACCOUNT_STATUSES.find((s) => s === one(sp.status));
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);
  const result = one(sp.result);

  let query = supabase?.from('profiles').select('id, email, phone, first_name, last_name, role, status, created_at', { count: 'exact' })
    .order('status', { ascending: true }).order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (query && q) query = query.or(`email.ilike.*${q}*,phone.ilike.*${q}*,first_name.ilike.*${q}*,last_name.ilike.*${q}*`);
  if (query && role) query = query.eq('role', role);
  if (query && status) query = query.eq('status', status);
  // Code of Conduct filter: active players who have not agreed to the current version (migration 0028).
  const conduct = one(sp.conduct) === 'missing' ? 'missing' : '';
  if (query && supabase && conduct) {
    const { data: activePlayers } = await supabase.from('profiles').select('id').in('role', [...PLAYER_ROLES]).eq('status', 'active');
    const missing = [...(await missingConsent(supabase, (activePlayers ?? []).map((r) => r.id)))];
    query = query.in('id', missing.length ? missing : ['00000000-0000-0000-0000-000000000000']);
  }
  const { data, count } = query ? await query : { data: [], count: 0 };
  const rows = data ?? [];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const params = (over: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, role, status, conduct, page: String(page), ...over })) if (v) u.set(k, String(v));
    return `/admin/members${u.size ? `?${u}` : ''}`;
  };
  const back = params({});
  const choices = assignableRoles(actor.role);
  const noConduct = supabase ? await missingConsent(supabase, rows.filter((r) => isPlayerRole(r.role) && r.status === 'active').map((r) => r.id)) : new Set<string>();
  const tc = await getTranslations('conduct');
  // Player records of the listed members, for the "Invoices" link (invoices belong to player records).
  const { data: playerLinks } = supabase && rows.length ? await supabase.from('players').select('id, profile_id').in('profile_id', rows.map((r) => r.id)) : { data: [] };
  const playerOf = new Map((playerLinks ?? []).map((p) => [p.profile_id, p.id]));
  const tInv = await getTranslations('inv');
  // Approving with a group, and the bulk bar: the current season's teams, grouped Men / Women / Junior / Other.
  const [teams, { data: pendingRows }] = supabase ? await Promise.all([
    currentTeams(supabase),
    supabase.from('profiles').select('id, email, phone, first_name, last_name, role, created_at').eq('status', 'pending').order('created_at').limit(50),
  ]) : [[], { data: [] }];
  const pending = (pendingRows ?? []).filter((m) => isRole(m.role) && canManageMember(actor, { id: m.id, role: m.role }));
  const groupLabel = (g: Group) => t(`group_${g}`);
  const n = (k: string) => Number(one(sp[k])) || 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('membersTitle')}</h1>
        <p className="mt-1 text-muted">{t('membersLead')}</p>
      </header>

      {RESULTS_OK.includes(result) ? <p role="status" className="rounded-card bg-accent/15 p-3 font-semibold text-pitch">{t(`result_${result}`)}</p> : null}
      {result === 'bulk' ? <p role="status" className="rounded-card bg-accent/15 p-3 font-semibold text-pitch" data-bulk-result>{t('result_bulk', { approved: n('a'), added: n('t'), skipped: n('s') })}{n('already') ? ` ${t('result_bulkAlready', { count: n('already') })}` : ''}</p> : null}
      <ContractsNote sp={sp} />
      {RESULTS_ERR.includes(result) ? <p role="alert" className="rounded-card bg-danger/10 p-3 font-semibold text-danger">{t(`result_${result}`)}</p> : null}

      {pending.length ? (
        <section className="rounded-card border-2 border-accent bg-raised p-5" aria-labelledby="pending-h" data-pending-panel>
          <h2 id="pending-h" className="font-display text-xl font-extrabold">{t('pendingTitle', { count: pending.length })}</h2>
          <p className="mt-1 text-sm text-muted">{t('pendingLead')}</p>
          <ul className="mt-3 grid gap-2">
            {pending.map((m) => {
              const name = `${m.first_name} ${m.last_name}`.trim();
              return (
                <li key={m.id} className="grid gap-3 rounded-card bg-surface p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" data-pending={m.email ?? m.phone}>
                  <div className="min-w-0">
                    <p className="font-semibold">{name ? isolate(name) : <span className="text-muted">{t('noName')}</span>} <span className="ms-1 rounded-full bg-line px-2 text-xs font-normal">{tr(isRole(m.role) ? m.role : 'player')}</span></p>
                    <p className="truncate text-sm text-muted" dir="ltr" style={{ textAlign: 'start' }}><bdi>{m.email ?? m.phone}</bdi> · {fmt.date.format(new Date(m.created_at))}</p>
                  </div>
                  <form action={updateMember} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={m.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="op" value="approve" />
                    {isPlayerRole(m.role) && teams.length ? (
                      <label className="grid gap-1 text-xs font-semibold">{t('assignGroup')}
                        <TeamSelect teams={teams} groupLabel={groupLabel} emptyLabel={t('noGroup')} className="min-w-[12rem]" /></label>
                    ) : null}
                    <button className="min-h-10 rounded-full bg-accent px-5 font-bold text-on-accent hover:brightness-110" data-approve>{t('approve')}</button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <form className="grid gap-3 rounded-card border border-line bg-raised p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:items-end" role="search">
        <label className="grid gap-1 text-sm font-semibold">{t('search')}
          <input name="q" defaultValue={q} type="search" maxLength={60} className="min-h-10 rounded-control border border-line bg-raised px-3 font-normal" />
        </label>
        <label className="grid gap-1 text-sm font-semibold">{t('filterRole')}
          <select name="role" defaultValue={role ?? ''} className="min-h-10 rounded-control border border-line bg-raised px-3 font-normal">
            <option value="">{t('all')}</option>
            {ROLES.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">{t('filterStatus')}
          <select name="status" defaultValue={status ?? ''} className="min-h-10 rounded-control border border-line bg-raised px-3 font-normal">
            <option value="">{t('all')}</option>
            {ACCOUNT_STATUSES.map((s) => <option key={s} value={s}>{ts(s)}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">{tc('title')}
          <select name="conduct" defaultValue={conduct} className="min-h-10 rounded-control border border-line bg-raised px-3 font-normal">
            <option value="">{t('all')}</option>
            <option value="missing">{tc('filterMissing')}</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button className="min-h-10 rounded-full bg-accent px-5 font-bold text-on-accent hover:brightness-110">{t('apply')}</button>
          <Link href="/admin/members" className="inline-flex min-h-10 items-center rounded-full border border-line px-4 font-semibold hover:border-accent">{t('clear')}</Link>
        </div>
      </form>

      <p className="text-sm text-muted">{t('total', { count: count ?? 0 })}</p>
      {rows.length ? (
        <BulkBar formId="bulk-members" action={bulkMembers} back={back}
          teamSelect={<TeamSelect teams={teams} groupLabel={groupLabel} emptyLabel={t('chooseTeam')} />}
          labels={{ title: t('bulkTitle'), selectAll: t('selectAll'), action: t('bulkAction'), approve: t('bulk_approve'), team: t('bulk_team'), approveTeam: t('bulk_approveTeam'),
            teamLabel: t('bulkTeam'), apply: t('bulkApply', { count: '{count}' }), none: t('bulkPick') }} />
      ) : null}

      {rows.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-center text-muted">{t('empty')}</p> : (
        <div className="relative overflow-x-auto rounded-card border border-line bg-raised">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="w-10 px-3 py-3"><span className="sr-only">{t('selectCol')}</span></th>
                <th scope="col" className="px-4 py-3 text-start">{t('colName')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('colRole')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('colStatus')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('colJoined')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m) => {
                const mRole: Role = isRole(m.role) ? m.role : 'player';
                const manageable = canManageMember(actor, { id: m.id, role: mRole });
                const name = `${m.first_name} ${m.last_name}`.trim();
                return (
                  <tr key={m.id} data-member={m.email ?? m.phone} className="align-top has-[input:checked]:bg-accent/10">
                    <td className="px-3 py-3">{manageable && m.id !== actor.id
                      ? <input type="checkbox" name="ids" value={m.id} form="bulk-members" aria-label={t('selectMember', { name: name || m.email || m.phone || '' })} className="mt-0.5 size-5 accent-accent" data-select />
                      : null}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{name ? isolate(name) : <span className="text-muted">{t('noName')}</span>}
                        {m.id === actor.id ? <span className="ms-2 rounded-full bg-line px-2 text-xs">{t('you')}</span> : null}</p>
                      {noConduct.has(m.id) ? <p className="mt-1"><span className="inline-block whitespace-nowrap rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white" data-conduct-flag>{tc('flag')}</span></p> : null}
                      <p className="text-muted" dir="ltr" style={{ textAlign: 'start' }}><bdi>{m.email ?? m.phone}</bdi>{m.email ? null : <span className="ms-2 rounded-full bg-line px-2 text-xs" dir="auto">{t('phoneAccount')}</span>}</p>
                    </td>
                    <td className="px-4 py-3">{tr(mRole)}
                      <a href={`/admin/signin-help?member=${m.id}#help`} className="mt-1 block text-xs font-semibold text-pitch underline underline-offset-2" data-signin-help-link>{t('signinHelp')}</a>
                      {playerOf.get(m.id) ? <a href={`/admin/invoices?player=${playerOf.get(m.id)}#list-h`} className="mt-1 block text-xs font-semibold text-pitch underline underline-offset-2" data-invoices-link>{tInv('invoicesLink')}</a> : null}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[m.status] ?? ''}`}>{ts(m.status)}</span></td>
                    <td className="whitespace-nowrap px-4 py-3">{fmt.date.format(new Date(m.created_at))}</td>
                    <td className="px-4 py-3">
                      {manageable ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {m.status === 'pending' ? <ActionButton id={m.id} back={back} op="approve" label={t('approve')} primary /> : null}
                          {m.status === 'suspended' ? <ActionButton id={m.id} back={back} op="reactivate" label={t('reactivate')} primary /> : null}
                          {m.status !== 'suspended' ? <ActionButton id={m.id} back={back} op="suspend" label={t('suspend')} /> : null}
                          <form action={updateMember} className="flex items-center gap-1">
                            <input type="hidden" name="id" value={m.id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="op" value="role" />
                            <select name="role" defaultValue={mRole} aria-label={`${t('colRole')}: ${m.email ?? m.phone}`} className="min-h-9 rounded-control border border-line bg-raised px-2">
                              {choices.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
                            </select>
                            <button className="min-h-9 rounded-full border border-fg px-3 font-semibold hover:bg-fg hover:text-raised">{t('saveRole')}</button>
                          </form>
                        </div>
                      ) : m.id !== actor.id ? <span className="text-xs text-muted">{t('onlySuper')}</span> : null}
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

function ActionButton({ id, back, op, label, primary }: { id: string; back: string; op: 'approve' | 'suspend' | 'reactivate'; label: string; primary?: boolean }) {
  return (
    <form action={updateMember}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={back} /><input type="hidden" name="op" value={op} />
      <button className={`min-h-9 rounded-full px-4 font-bold ${primary ? 'bg-accent text-on-accent hover:brightness-110' : op === 'suspend' ? 'border border-danger text-danger hover:bg-danger/10' : 'border border-line'}`}>{label}</button>
    </form>
  );
}
