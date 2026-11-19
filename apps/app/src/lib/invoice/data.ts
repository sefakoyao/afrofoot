import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Billing, InvoiceData } from './pdf';

const BILLING_DEFAULTS: Billing = { legal_name: '', street: '', postal_city: '', business_id: '', iban: '', bic: '', bank: '', email: '', phone: '', website: '', payment_terms_days: 14, late_interest: '8.00' };

/** The club's invoice details (site_settings 'billing', migration 0027; filled in under Admin → Invoices). */
export async function loadBilling(db: SupabaseClient): Promise<Billing & { invoice_day: number; due_day: number; contact_person: string; require_consents: boolean }> {
  const { data } = await db.from('site_settings').select('value').eq('key', 'billing').maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === 'string' ? (v[k] as string) : '');
  const num = (k: string, d: number) => (typeof v[k] === 'number' ? (v[k] as number) : Number(v[k]) || d);
  const day = (k: string, d: number) => Math.min(28, Math.max(1, Math.trunc(num(k, d)))); // 0060: as app.invoice_days()
  return { ...BILLING_DEFAULTS, legal_name: str('legal_name'), street: str('street'), postal_city: str('postal_city'), business_id: str('business_id'),
    iban: str('iban'), bic: str('bic'), bank: str('bank'), email: str('email'), phone: str('phone'), website: str('website'), contact_person: str('contact_person'),
    payment_terms_days: num('payment_terms_days', 14), invoice_day: day('invoice_day', 1), due_day: day('due_day', 10), late_interest: str('late_interest') || '8.00',
    require_consents: v.require_consents !== false }; // 0036: on unless switched off
}

/**
 * One invoice with its lines and payer, read as the signed-in user: RLS returns it to the player it belongs to and to admins only.
 * Null when it does not exist, is not visible, or is not an invoice.
 */
export async function loadInvoice(db: SupabaseClient, id: string, playerUrl: string): Promise<InvoiceData | null> {
  const { data: p } = await db.from('payments')
    .select('id, player_id, invoice_number, reference, amount_cents, paid_cents, due_on, status, paid_at, invoice_sent_at, created_at, players(first_name, last_name)')
    .eq('id', id).maybeSingle();
  if (!p || !p.invoice_number || !p.reference) return null;
  const [{ data: lines }, { data: priv }] = await Promise.all([
    db.from('payment_lines').select('description, line_date, quantity, unit, unit_price_cents, vat_percent').eq('payment_id', id).order('position'),
    db.from('player_private').select('address, city').eq('player_id', p.player_id).maybeSingle(),
  ]);
  const player = p.players as unknown as { first_name: string; last_name: string } | null;
  const issued = (p.invoice_sent_at ?? p.created_at) as string;
  const items = (lines ?? []).map((l) => ({ description: l.description, date: l.line_date, quantity: Number(l.quantity), unit: l.unit, unitPriceCents: l.unit_price_cents, vatPercent: Number(l.vat_percent) }));
  return {
    number: p.invoice_number, reference: p.reference, issuedOn: new Date(issued).toLocaleDateString('en-CA', { timeZone: 'Europe/Helsinki' }),
    dueOn: p.due_on, amountCents: p.amount_cents, paidCents: p.status === 'paid' ? p.amount_cents : (p.paid_cents ?? 0), status: p.status, paidAt: p.paid_at,
    // invoices made before lines existed show one line for the whole amount
    lines: items.length ? items : [{ description: 'Membership fees', date: p.due_on, quantity: 1, unit: 'kpl', unitPriceCents: p.amount_cents, vatPercent: 0 }],
    payer: { name: player ? `${player.first_name} ${player.last_name}` : '', street: priv?.address ?? null, postalCity: priv?.city ?? null },
    playerUrl,
  };
}
