import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ROLES } from '@afrofoot/db';
import { requireArea } from '@/lib/auth';
import { isolate } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';

/** Admin home: who is waiting for approval, and how many active members there are per role. */
export default async function AdminHome() {
  const member = await requireArea('admin');
  const [t, ta, tr, supabase] = await Promise.all([getTranslations('app'), getTranslations('admin'), getTranslations('role'), getSupabase()]);
  const { data } = supabase ? await supabase.from('profiles').select('role, status') : { data: [] };
  const rows = data ?? [];
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  const pending = count('pending');
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <section className="rounded-card border border-line bg-raised p-6">
        <h1 className="font-display text-2xl font-extrabold">{t('welcome', { name: isolate(member.firstName || member.email) })}</h1>
        <p className="mt-1 text-sm text-muted">{ta('overviewTitle')}</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" aria-label={ta('overviewTitle')}>
        {([['statActive', 'active'], ['statPending', 'pending'], ['statSuspended', 'suspended']] as const).map(([k, s]) => (
          <Link key={s} href={`/admin/members?status=${s}`} className="rounded-card border border-line bg-raised p-5 hover:border-accent">
            <p className="text-sm text-muted">{ta(k)}</p>
            <p className="font-display text-4xl font-black">{count(s)}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-card border border-line bg-raised p-6">
        <h2 className="font-display text-lg font-extrabold">{ta('statPending')}</h2>
        {pending ? (
          <Link href="/admin/members?status=pending" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">
            {ta('reviewPending')} ({pending})
          </Link>
        ) : <p className="mt-2 text-muted">{ta('noPending')}</p>}
        <p className="mt-4 text-sm text-muted">{ta('howToAdd')}</p>
      </section>

      <section className="rounded-card border border-line bg-raised p-6">
        <h2 className="font-display text-lg font-extrabold">{ta('byRole')}</h2>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="flex justify-between gap-4 rounded-control bg-surface px-4 py-2">
              <dt>{tr(r)}</dt><dd className="font-bold">{rows.filter((x) => x.role === r && x.status === 'active').length}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
