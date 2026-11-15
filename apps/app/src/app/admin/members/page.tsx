import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ACCOUNT_STATUSES, ROLES, assignableRoles, canManageMember, isRole, type Role } from '@afrofoot/db';
import { updateMember } from '@/app/actions/members';
import { requireArea } from '@/lib/auth';
import { dateFormats, isolate } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { missingConsent } from '@/lib/conduct';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin'))('membersTitle') };
}

const PAGE_SIZE = 25;
const RESULTS_OK = ['approve', 'suspend', 'reactivate', 'roleChanged', 'unchanged'];
const RESULTS_ERR = ['notAllowed', 'lastSuper', 'notFound', 'invalid', 'error'];
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

  let query = supabase?.from('profiles').select('id, email, first_name, last_name, role, status, created_at', { count: 'exact' })
    .order('status', { ascending: true }).order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (query && q) query = query.or(`email.ilike.*${q}*,first_name.ilike.*${q}*,last_name.ilike.*${q}*`);
  if (query && role) query = query.eq('role', role);
  if (query && status) query = query.eq('status', status);
  // Code of Conduct filter: active players who have not agreed to the current version (migration 0028).
  const conduct = one(sp.conduct) === 'missing' ? 'missing' : '';
  if (query && supabase && conduct) {
    const { data: activePlayers } = await supabase.from('profiles').select('id').eq('role', 'player').eq('status', 'active');
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
  const noConduct = supabase ? await missingConsent(supabase, rows.filter((r) => r.role === 'player' && r.status === 'active').map((r) => r.id)) : new Set<string>();
  const tc = await getTranslations('conduct');
  // Player records of the listed members, for the "Invoices" link (invoices belong to player records).
  const { data: playerLinks } = supabase && rows.length ? await supabase.from('players').select('id, profile_id').in('profile_id', rows.map((r) => r.id)) : { data: [] };
  const playerOf = new Map((playerLinks ?? []).map((p) => [p.profile_id, p.id]));
  const tInv = await getTranslations('inv');

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('membersTitle')}</h1>
        <p className="mt-1 text-muted">{t('membersLead')}</p>
      </header>

      {RESULTS_OK.includes(result) ? <p role="status" className="rounded-card bg-accent/15 p-3 font-semibold text-pitch">{t(`result_${result}`)}</p> : null}
      {RESULTS_ERR.includes(result) ? <p role="alert" className="rounded-card bg-danger/10 p-3 font-semibold text-danger">{t(`result_${result}`)}</p> : null}

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

      {rows.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-center text-muted">{t('empty')}</p> : (
        <div className="relative overflow-x-auto rounded-card border border-line bg-raised">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
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
                  <tr key={m.id} data-member={m.email} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{name ? isolate(name) : <span className="text-muted">{t('noName')}</span>}
                        {m.id === actor.id ? <span className="ms-2 rounded-full bg-line px-2 text-xs">{t('you')}</span> : null}</p>
                      {noConduct.has(m.id) ? <p className="mt-1"><span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white" data-conduct-flag>{tc('flag')}</span></p> : null}
                      <p className="text-muted" dir="ltr" style={{ textAlign: 'start' }}><bdi>{m.email}</bdi></p>
                    </td>
                    <td className="px-4 py-3">{tr(mRole)}
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
                            <select name="role" defaultValue={mRole} aria-label={`${t('colRole')}: ${m.email}`} className="min-h-9 rounded-control border border-line bg-raised px-2">
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
