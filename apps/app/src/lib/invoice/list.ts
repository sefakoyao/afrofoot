import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Invoice search for Admin → Invoices (runs as the admin; RLS lets admins read all payments).
 * Status follows what the player sees: open = unpaid and not yet due, overdue = unpaid after the due date, paid.
 */
export const INVOICE_STATUSES = ['open', 'overdue', 'paid'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export interface InvoiceFilters { q: string; status: InvoiceStatus | ''; month: string; player: string; page: number }
export interface InvoiceRow { id: string; invoiceNumber: string; amountCents: number; dueOn: string | null; status: string; issuedAt: string; playerId: string; playerName: string }
export interface InvoiceList { rows: InvoiceRow[]; count: number; pages: number; totals: Record<InvoiceStatus, { n: number; cents: number }> }

export const PAGE_SIZE = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Read and sanitise the filters from the address (unknown values are ignored). */
export function parseFilters(sp: Record<string, string | string[] | undefined>): InvoiceFilters {
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const status = INVOICE_STATUSES.find((s) => s === one('status')) ?? '';
  return {
    q: one('q').replace(/[,()*%\\:"']/g, ' ').trim().slice(0, 60), // characters with a meaning in PostgREST filters
    status, month: /^\d{4}-(0[1-9]|1[0-2])$/.test(one('month')) ? one('month') : '',
    player: UUID.test(one('player')) ? one('player') : '', page: Math.max(1, Number.parseInt(one('page'), 10) || 1),
  };
}

export const effectiveStatus = (status: string, dueOn: string | null, today: string): string =>
  (status === 'pending' || status === 'failed') && dueOn && dueOn < today ? 'overdue' : status === 'pending' || status === 'failed' ? 'open' : status;

export async function listInvoices(db: SupabaseClient, f: InvoiceFilters, today: string): Promise<InvoiceList> {
  // Same filters for the page of rows and for the totals.
  const base = (cols: string, opts?: { count: 'exact' }) => {
    let q = db.from('payments').select(cols, opts).not('invoice_number', 'is', null);
    if (f.player) q = q.eq('player_id', f.player);
    if (f.month) {
      const [y, m] = f.month.split('-').map(Number) as [number, number];
      q = q.gte('invoice_sent_at', new Date(Date.UTC(y, m - 1, 1)).toISOString()).lt('invoice_sent_at', new Date(Date.UTC(y, m, 1)).toISOString());
    }
    if (f.status === 'paid') q = q.eq('status', 'paid');
    if (f.status === 'open') q = q.in('status', ['pending', 'failed']).or(`due_on.gte.${today},due_on.is.null`);
    if (f.status === 'overdue') q = q.in('status', ['pending', 'failed']).lt('due_on', today);
    if (f.q) q = /\d/.test(f.q) && !/\s/.test(f.q)
      ? q.ilike('invoice_number', `%${f.q}%`)
      : q.or(`first_name.ilike.*${f.q}*,last_name.ilike.*${f.q}*`, { referencedTable: 'players' });
    return q;
  };
  const [{ data, count }, { data: all }] = await Promise.all([
    base('id, invoice_number, amount_cents, due_on, status, invoice_sent_at, created_at, player_id, players!inner(first_name, last_name)', { count: 'exact' })
      .order('invoice_sent_at', { ascending: false, nullsFirst: false }).order('invoice_number', { ascending: false })
      .range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1),
    base('amount_cents, status, due_on, players!inner(id)').limit(5000),
  ]);
  type Raw = { id: string; invoice_number: string; amount_cents: number; due_on: string | null; status: string; invoice_sent_at: string | null; created_at: string; player_id: string; players: { first_name: string; last_name: string } };
  const totals: InvoiceList['totals'] = { open: { n: 0, cents: 0 }, overdue: { n: 0, cents: 0 }, paid: { n: 0, cents: 0 } };
  for (const r of (all as unknown as { amount_cents: number; status: string; due_on: string | null }[] | null) ?? []) {
    const s = effectiveStatus(r.status, r.due_on, today) as InvoiceStatus;
    if (s in totals) { totals[s].n += 1; totals[s].cents += r.amount_cents; }
  }
  const rows = ((data as unknown as Raw[] | null) ?? []).map((r) => ({
    id: r.id, invoiceNumber: r.invoice_number, amountCents: r.amount_cents, dueOn: r.due_on, status: r.status,
    issuedAt: r.invoice_sent_at ?? r.created_at, playerId: r.player_id, playerName: `${r.players.first_name} ${r.players.last_name}`,
  }));
  return { rows, count: count ?? 0, pages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)), totals };
}
