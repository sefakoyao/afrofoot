import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireArea } from '@/lib/auth';
import { dateFormats } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin'))('auditTitle') };
}

const PAGE_SIZE = 50;
const SKIP = new Set(['updated_at', 'created_at', 'id']);
type Json = Record<string, unknown> | null;

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '–';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

/**
 * What changed in one entry. Tables audited with 'redact' (personal data) store only `{ field: true }` for changed fields,
 * so their values are shown as private; everything else shows old → new.
 */
function changes(action: string, oldData: Json, newData: Json): { field: string; from?: string; to?: string; hidden?: boolean }[] {
  if (action !== 'UPDATE') return [];
  if (!oldData && newData) return Object.keys(newData).filter((k) => !SKIP.has(k)).map((field) => ({ field, hidden: true }));
  if (!oldData || !newData) return [];
  return Object.keys(newData)
    .filter((k) => !SKIP.has(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
    .map((field) => ({ field, from: show(oldData[field]), to: show(newData[field]) }));
}

/** Read-only view of audit_log (RLS: admins read; nobody writes except the database triggers). */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(typeof sp.page === 'string' ? sp.page : '', 10) || 1);
  const [t, fmt, supabase] = await Promise.all([getTranslations('admin'), dateFormats(), getSupabase()]);

  const { data } = supabase
    ? await supabase.from('audit_log').select('id, actor_id, action, table_name, record_id, old_data, new_data, created_at')
      .order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE) // one extra row tells if there is a next page
    : { data: [] };
  const all = data ?? [];
  const rows = all.slice(0, PAGE_SIZE);
  const hasNext = all.length > PAGE_SIZE;

  // Names for the people involved (actors, and accounts that were changed).
  const ids = [...new Set(rows.flatMap((r) => [r.actor_id, r.table_name === 'profiles' ? r.record_id : null]).filter((x): x is string => !!x))];
  const { data: people } = supabase && ids.length ? await supabase.from('profiles').select('id, email, first_name, last_name').in('id', ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim() || p.email]));

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('auditTitle')}</h1>
        <p className="mt-1 text-muted">{t('auditLead')}</p>
      </header>

      {rows.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-center text-muted">{t('noAudit')}</p> : (
        <div className="overflow-x-auto rounded-card border border-line bg-raised">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start">{t('colWhen')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('colWho')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('colWhat')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('colChanges')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const list = changes(r.action, r.old_data as Json, r.new_data as Json);
                const target = r.table_name === 'profiles' && r.record_id ? who.get(r.record_id) : null;
                return (
                  <tr key={r.id} className="align-top" data-audit={r.table_name}>
                    <td className="whitespace-nowrap px-4 py-3">{fmt.dateTime.format(new Date(r.created_at))}</td>
                    <td className="px-4 py-3"><bdi>{r.actor_id ? (who.get(r.actor_id) ?? r.actor_id.slice(0, 8)) : t('system')}</bdi></td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{t(`act_${r.action}` as 'act_UPDATE')}</span>{' · '}
                      {r.table_name === 'profiles' ? t('tbl_profiles') : <code>{r.table_name}</code>}
                      {target ? <> · <bdi>{target}</bdi></> : null}
                    </td>
                    <td className="px-4 py-3">
                      {list.length ? (
                        <ul className="grid gap-0.5">
                          {list.map((c) => (
                            <li key={c.field}><code>{c.field}</code>: {c.hidden ? <span className="text-muted">{t('hidden')}</span> : <bdi>{c.from} → {c.to}</bdi>}</li>
                          ))}
                        </ul>
                      ) : <span className="text-muted">–</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {page > 1 || hasNext ? (
        <nav className="flex items-center justify-between gap-3 text-sm" aria-label={t('auditTitle')}>
          {page > 1 ? <Link href={`/admin/audit?page=${page - 1}`} className="rounded-full border border-line px-4 py-2 font-semibold hover:border-accent">{t('prev')}</Link> : <span />}
          {hasNext ? <Link href={`/admin/audit?page=${page + 1}`} className="rounded-full border border-line px-4 py-2 font-semibold hover:border-accent">{t('next')}</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
