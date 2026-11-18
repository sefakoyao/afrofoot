import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { isPlayerRole, ROLES } from '@afrofoot/db';
import { requireArea } from '@/lib/auth';
import { isolate } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { missingConsent } from '@/lib/conduct';
import { PlayerGuideCard } from '@/components/PlayerGuideCard';
import { LeagueSyncCard } from '@/components/admin/LeagueSyncCard';

/** Admin home: who is waiting for approval, and how many active members there are per role. */
export default async function AdminHome({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const member = await requireArea('admin');
  const [t, ta, tr, supabase] = await Promise.all([getTranslations('app'), getTranslations('admin'), getTranslations('role'), getSupabase()]);
  const { data } = supabase ? await supabase.from('profiles').select('id, role, status') : { data: [] };
  const tc = await getTranslations('conduct');
  const activePlayers = (data ?? []).filter((r) => isPlayerRole(r.role) && r.status === 'active').map((r) => r.id);
  const noConduct = supabase ? (await missingConsent(supabase, activePlayers)).size : 0;
  const { count: toCountersign } = supabase ? await supabase.from('player_contracts').select('id', { count: 'exact', head: true }).eq('status', 'player_signed') : { count: 0 };
  const tk = await getTranslations('contract');
  // Club emails (migration 0048): is sending set up, and how the last 7 days went. Missing before 0048 is run: no card.
  const { data: emailRows } = supabase ? await supabase.rpc('email_status') : { data: null };
  const mail = (emailRows as { key_set: boolean; sender_ready: boolean; queued: number; delivered: number; failed: number; last_error: string | null }[] | null)?.[0] ?? null;
  const rows = data ?? [];
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  const pending = count('pending');
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <section className="rounded-card border border-line bg-raised p-6">
        <h1 className="font-display text-2xl font-extrabold">{t('welcome', { name: isolate(member.firstName || member.email || member.phone || '') })}</h1>
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

      <section className={`rounded-card border-2 p-6 ${noConduct ? 'border-danger/40 bg-danger/5' : 'border-line bg-raised'}`} data-conduct-count={noConduct}>
        <h2 className="font-display text-lg font-extrabold">{tc('title')}</h2>
        <p className="mt-1">{noConduct ? tc('overviewMissing', { count: noConduct }) : tc('overviewAll')}</p>
        {noConduct ? <Link href="/admin/members?conduct=missing" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">{tc('overviewCta')}</Link> : null}
      </section>

      {mail ? (
        <section className={`rounded-card border-2 p-6 ${!mail.key_set || !mail.sender_ready || mail.failed ? 'border-danger/40 bg-danger/5' : 'border-line bg-raised'}`} data-email-status={mail.key_set && mail.sender_ready ? 'ready' : 'setup'}>
          <h2 className="font-display text-lg font-extrabold">{ta('mailTitle')}</h2>
          <p className="mt-1">{mail.key_set && mail.sender_ready ? ta('mailReady', { delivered: mail.delivered, queued: mail.queued }) : ta('mailSetup')}</p>
          {mail.failed ? <p className="mt-1 font-semibold text-danger">{ta('mailFailed', { count: mail.failed })}{mail.last_error ? <span className="block text-xs font-normal" dir="ltr">{mail.last_error.slice(0, 160)}</span> : null}</p> : null}
        </section>
      ) : null}

      {toCountersign ? (
        <section className="rounded-card border-2 border-danger/40 bg-danger/5 p-6" data-countersign-count={toCountersign}>
          <h2 className="font-display text-lg font-extrabold">{tk('adminTitle')}</h2>
          <p className="mt-1">{tk('overviewCountersign', { count: toCountersign })}</p>
          <Link href="/admin/contracts?status=player_signed" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">{tk('overviewCta')}</Link>
        </section>
      ) : null}

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

      <LeagueSyncCard result={(await searchParams).result} />

      <PlayerGuideCard />
    </div>
  );
}
