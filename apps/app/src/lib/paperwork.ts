import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentConduct } from './conduct';
import { shownStatus, type ContractStatus } from './contracts';

/**
 * The paperwork of the members listed on Admin → Members, for players: their contract (the newest one that is not
 * cancelled or declined), the Code of Conduct (agreed to the current version, and when) and the membership fees (paid,
 * unpaid, overdue). Each part is left out (undefined) when that feature is not installed in the database, so the page
 * works on an older database too.
 */
export type ContractState = { id: string; status: ContractStatus | 'expired'; endsOn: string } | null;
export type FeeState = { state: 'paid' | 'unpaid' | 'overdue' | 'none'; openCents: number; overdueCents: number };
export type Paperwork = { contract?: ContractState; conduct?: { at: string } | null; fees?: FeeState };

const helsinkiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date());

export async function loadPaperwork(db: SupabaseClient, members: { profileId: string; playerId: string }[]): Promise<Map<string, Paperwork>> {
  const out = new Map<string, Paperwork>(members.map((m) => [m.profileId, {}]));
  if (!members.length) return out;
  const playerIds = members.map((m) => m.playerId), profileIds = members.map((m) => m.profileId);
  const today = helsinkiToday();
  const [contracts, version, payments] = await Promise.all([
    db.from('player_contracts').select('id, player_id, status, ends_on, created_at').in('player_id', playerIds).not('status', 'in', '(cancelled,declined)').order('created_at', { ascending: false }),
    currentConduct(db).catch(() => null),
    db.from('payments').select('player_id, status, amount_cents, paid_cents, due_on').in('player_id', playerIds)
      .then((r) => (r.error?.code === '42703' ? db.from('payments').select('player_id, status, amount_cents, due_on').in('player_id', playerIds) : r)),   // before 0056
  ]);
  const byPlayer = new Map(members.map((m) => [m.playerId, m.profileId]));

  // contracts: skipped when the table is not installed (migration 0030)
  if (!contracts.error) {
    for (const m of members) out.get(m.profileId)!.contract = null;
    for (const c of (contracts.data ?? []) as { id: string; player_id: string; status: ContractStatus; ends_on: string }[]) {
      const p = out.get(byPlayer.get(c.player_id) ?? '');
      if (p && !p.contract) p.contract = { id: c.id, status: shownStatus({ status: c.status, ends_on: c.ends_on }, today), endsOn: c.ends_on };
    }
  }

  // Code of Conduct: only when a version is published
  if (version) {
    const { data, error } = await db.from('conduct_consents').select('profile_id, consented_at').eq('version_id', version.id).in('profile_id', profileIds);
    if (!error) {
      for (const m of members) out.get(m.profileId)!.conduct = null;
      for (const c of (data ?? []) as { profile_id: string; consented_at: string }[]) { const p = out.get(c.profile_id); if (p) p.conduct = { at: c.consented_at }; }
    }
  }

  // fees: overdue = an open amount past its due date; unpaid = an open amount not yet due; paid = invoices, nothing open
  if (!payments.error) {
    for (const m of members) out.get(m.profileId)!.fees = { state: 'none', openCents: 0, overdueCents: 0 };
    for (const r of (payments.data ?? []) as { player_id: string; status: string; amount_cents: number; paid_cents?: number; due_on: string | null }[]) {
      const f = out.get(byPlayer.get(r.player_id) ?? '')?.fees;
      if (!f || r.status === 'refunded') continue;
      if (r.status === 'paid') { if (f.state === 'none') f.state = 'paid'; continue; }
      const open = Math.max(0, r.amount_cents - (r.paid_cents ?? 0));   // partly paid invoices (migration 0056)
      if (!open) continue;
      f.openCents += open;
      if (r.due_on && r.due_on < today) f.overdueCents += open;
      f.state = f.overdueCents ? 'overdue' : 'unpaid';
    }
  }
  return out;
}
