import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { isPlayerRole, ROLES } from '@afrofoot/db';
import { requireArea } from '@/lib/auth';
import { isolate } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { missingConsent } from '@/lib/conduct';
import { PlayerGuideCard } from '@/components/PlayerGuideCard';
import { LeagueSyncCard } from '@/components/admin/LeagueSyncCard';
import { NavIcon, type NavIconName } from '@/components/NavIcon';
import { newRequestCount } from '@/lib/requests';
import { helsinkiToday } from '@/lib/time';

/**
 * Admin home (Alternative A): four numbers to tap (members, overdue fees, contracts to countersign, new requests), a
 * "Needs your attention" list (approvals, duplicate accounts, contracts, Code of Conduct, shirt numbers, email set-up) and
 * quick actions; below, members per role, the league sync and the player guide.
 */
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
  // overdue fees: open invoices past their due date (amount still owed); duplicates (0065) and shirt requests (0057)
  const today = helsinkiToday();
  const [{ data: overdue }, requests, { data: dupes }, { count: shirts }] = supabase ? await Promise.all([
    supabase.from('payments').select('player_id, amount_cents, paid_cents').in('status', ['pending', 'failed']).lt('due_on', today),
    newRequestCount(supabase),
    supabase.rpc('duplicate_accounts'),
    supabase.from('jersey_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]) : [{ data: [] }, 0, { data: [] }, { count: 0 }];
  const owed = ((overdue ?? []) as { player_id: string; amount_cents: number; paid_cents: number | null }[]);
  const owedCents = owed.reduce((a, x) => a + x.amount_cents - (x.paid_cents ?? 0), 0);
  const owedPlayers = new Set(owed.map((x) => x.player_id)).size;
  const euro = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const dupeCount = ((dupes as unknown[] | null) ?? []).length;
  const mailProblem = !!mail && (!mail.key_set || !mail.sender_ready || mail.failed > 0);
  type Tile = { href: string; icon: NavIconName; value: string; label: string; sub: string; tone: 'ink' | 'plain' | 'green'; key: string };
  const tiles: Tile[] = [
    { key: 'members', href: '/admin/members?status=active', icon: 'users', value: String(count('active')), label: ta('statActive'), sub: ta('tilePending', { count: pending }), tone: 'ink' },
    { key: 'fees', href: '/admin/finance/balances', icon: 'euro', value: euro.format(owedCents / 100), label: ta('tileOverdue'), sub: ta('tilePlayers', { count: owedPlayers }), tone: 'plain' },
    { key: 'contracts', href: '/admin/contracts?status=player_signed', icon: 'contract', value: String(toCountersign ?? 0), label: ta('tileCountersign'), sub: tk('adminTitle'), tone: 'plain' },
    { key: 'requests', href: '/admin/requests', icon: 'inbox', value: String(requests), label: ta('tileRequests'), sub: ta('tileRequestsSub'), tone: 'green' },
  ];
  type Todo = { href: string; icon: NavIconName; title: string; sub: string; tone: string; key: string };
  const todo: Todo[] = [
    pending ? { key: 'approve', href: '/admin/members?status=pending', icon: 'user', title: ta('todoApprove', { count: pending }), sub: ta('todoApproveSub'), tone: 'bg-accent/15 text-pitch' } : null,
    dupeCount ? { key: 'dupes', href: '/admin/members/merge', icon: 'merge', title: ta('todoDupes', { count: dupeCount }), sub: ta('todoDupesSub'), tone: 'bg-gold text-ink-950' } : null,
    toCountersign ? { key: 'countersign', href: '/admin/contracts?status=player_signed', icon: 'contract', title: tk('overviewCountersign', { count: toCountersign }), sub: tk('overviewCta'), tone: 'bg-danger/10 text-danger' } : null,
    noConduct ? { key: 'conduct', href: '/admin/members?conduct=missing', icon: 'handshake', title: tc('overviewMissing', { count: noConduct }), sub: tc('overviewCta'), tone: 'bg-danger/10 text-danger' } : null,
    shirts ? { key: 'shirts', href: '/admin/shirts#requests', icon: 'shirt', title: ta('todoShirts', { count: shirts }), sub: ta('todoShirtsSub'), tone: 'bg-surface text-fg' } : null,
    mailProblem ? { key: 'mail', href: '/admin', icon: 'inbox', title: ta('mailTitle'), sub: mail!.key_set && mail!.sender_ready ? ta('mailFailed', { count: mail!.failed }) : ta('mailSetup'), tone: 'bg-danger/10 text-danger' } : null,
  ].filter((x): x is Todo => !!x);
  const actions: { href: string; icon: NavIconName; label: string }[] = [
    { href: '/admin/events', icon: 'calendar', label: ta('qaEvent') }, { href: '/admin/invoices', icon: 'receipt', label: ta('qaInvoice') },
    { href: '/admin/contracts', icon: 'contract', label: ta('qaContract') }, { href: '/admin/content/poster', icon: 'image', label: ta('qaPoster') },
  ];
  const TONE = { ink: 'bg-ink-950 text-white border-ink-950', plain: 'bg-raised text-fg border-line', green: 'bg-accent text-on-accent border-accent' } as const;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <header>
        <h1 className="font-display text-xl font-extrabold md:text-2xl">{t('welcome', { name: isolate(member.firstName || member.email || member.phone || '') })}</h1>
        <p className="text-sm text-muted">{ta('overviewTitle')}</p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={ta('overviewTitle')} data-admin-tiles>
        {tiles.map((x) => (
          <Link key={x.key} href={x.href} className={`grid gap-1 rounded-[22px] border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${TONE[x.tone]}`} data-tile={x.key}>
            <span className="flex items-center justify-between opacity-80"><NavIcon name={x.icon} className="size-5" /><span aria-hidden className="rtl-flip">›</span></span>
            <span className="mt-2 font-display text-3xl font-black tabular-nums" dir="ltr" style={{ textAlign: 'start' }}>{x.value}</span>
            <span className="text-sm font-extrabold leading-tight">{x.label}</span>
            <span className="text-xs opacity-75">{x.sub}</span>
          </Link>
        ))}
      </section>

      <section aria-labelledby="todo-h" className="grid gap-2" data-admin-todo>
        <h2 id="todo-h" className="font-display text-lg font-extrabold">{ta('todoTitle')}</h2>
        {todo.length ? (
          <ul className="overflow-hidden rounded-card border border-line bg-raised">
            {todo.map((x) => (
              <li key={x.key} className="border-b border-line last:border-0">
                <Link href={x.href} className="flex items-center gap-3 p-3.5 hover:bg-accent/5" data-todo={x.key}>
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${x.tone}`}><NavIcon name={x.icon} className="size-5" /></span>
                  <span className="grid min-w-0 flex-1 leading-tight"><span className="font-bold">{x.title}</span><span className="text-sm text-muted">{x.sub}</span></span>
                  <span aria-hidden className="rtl-flip text-xl text-muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-card border border-line bg-raised p-4 text-muted" data-todo-none>{ta('todoNone')}</p>}
      </section>

      <section aria-labelledby="qa-h" className="grid gap-2">
        <h2 id="qa-h" className="font-display text-lg font-extrabold">{ta('qaTitle')}</h2>
        <ul className="grid grid-cols-4 gap-2" data-quick-actions>
          {actions.map((x) => (
            <li key={x.href}><Link href={x.href} className="grid justify-items-center gap-1.5 rounded-card p-2 text-center text-xs font-bold hover:bg-raised">
              <span className="grid size-14 place-items-center rounded-2xl border border-line bg-raised"><NavIcon name={x.icon} className="size-6" /></span>{x.label}</Link></li>
          ))}
        </ul>
        <p className="text-sm text-muted">{ta('howToAdd')}</p>
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
