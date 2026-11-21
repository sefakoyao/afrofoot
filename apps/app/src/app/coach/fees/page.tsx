import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { dateFormats } from '@/lib/format';
import { coachScope } from '@/lib/staff';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToday } from '@/lib/time';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('perm'))('feesTitle') };
}

type Pay = { id: string; player_id: string; amount_cents: number; paid_cents: number | null; status: string; due_on: string | null; invoice_number: string | null };
type Roster = { team_season_id: string; jersey_number: number | null; players: { id: string; first_name: string; last_name: string } };

/**
 * Coach → Teams & events → Fees (migration 0070, right "fees"): per team the coach coaches, each player's invoices,
 * what is still owed and whether something is overdue, read only (RLS coach_fees_read: own players only).
 */
export default async function CoachFeesPage() {
  const scope = await coachScope();
  if (!scope.perms.has('fees')) redirect('/coach');
  const [t, fmt, supabase] = await Promise.all([getTranslations('perm'), dateFormats(), getSupabase()]);
  const ids = scope.teams.map((x) => x.id);
  const [{ data: roster }, { data: pays }] = supabase && ids.length ? await Promise.all([
    supabase.from('team_players').select('team_season_id, jersey_number, players!inner(id, first_name, last_name)').in('team_season_id', ids).is('left_on', null),
    supabase.from('payments').select('id, player_id, amount_cents, paid_cents, status, due_on, invoice_number').in('status', ['pending', 'failed', 'paid']).order('due_on'),
  ]) : [{ data: [] }, { data: [] }];
  const today = helsinkiToday();
  const euro = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' });
  const byPlayer = new Map<string, Pay[]>();
  for (const p of (pays ?? []) as Pay[]) byPlayer.set(p.player_id, [...(byPlayer.get(p.player_id) ?? []), p]);
  const owed = (p: Pay) => (p.status === 'paid' ? 0 : p.amount_cents - (p.paid_cents ?? 0));
  const late = (p: Pay) => owed(p) > 0 && !!p.due_on && p.due_on < today;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('feesTitle')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('feesLead')}</p>
      </header>
      {scope.teams.map((team) => {
        const players = ((roster ?? []) as unknown as Roster[]).filter((r) => r.team_season_id === team.id).sort((a, b) => a.players.last_name.localeCompare(b.players.last_name));
        const lateCount = players.filter((r) => (byPlayer.get(r.players.id) ?? []).some(late)).length;
        return (
          <section key={team.id} className="grid gap-2" aria-labelledby={`fees-${team.id}`} data-fees-team={team.name}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`fees-${team.id}`} className="font-display text-lg font-extrabold"><bdi>{team.name}</bdi></h2>
              <span className="text-sm text-muted">{t('feesLate', { count: lateCount })}</span>
            </div>
            <ul className="overflow-hidden rounded-card border border-line bg-raised">
              {players.map((r) => {
                const list = byPlayer.get(r.players.id) ?? [];
                const due = list.reduce((a, p) => a + owed(p), 0), overdue = list.some(late);
                const next = list.find((p) => owed(p) > 0);
                return (
                  <li key={r.players.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line p-3 last:border-0" data-fee-player={`${r.players.first_name} ${r.players.last_name}`} data-fee-state={overdue ? 'late' : due ? 'open' : list.length ? 'paid' : 'none'}>
                    <span className="grid min-w-0 flex-1 leading-tight">
                      <span className="font-bold"><bdi>{r.players.first_name} {r.players.last_name}</bdi>{r.jersey_number ? <span className="ms-1.5 text-xs text-muted" dir="ltr">#{r.jersey_number}</span> : null}</span>
                      <span className="text-sm text-muted">{next?.due_on ? t('feesDue', { date: fmt.date.format(new Date(`${next.due_on}T12:00:00Z`)) }) : list.length ? t('feesNothingDue') : t('feesNoInvoice')}</span>
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${overdue ? 'bg-danger text-white' : due ? 'bg-gold text-ink-950' : list.length ? 'bg-accent/20 text-pitch' : 'bg-line text-muted'}`}>
                      {overdue ? t('feesOverdue', { amount: euro.format(due / 100) }) : due ? t('feesOpen', { amount: euro.format(due / 100) }) : list.length ? t('feesPaid') : '–'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-muted">{t('feesNote')}</p>
    </div>
  );
}
