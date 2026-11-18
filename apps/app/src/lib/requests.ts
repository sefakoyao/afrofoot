import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Admin → Requests: everything visitors send from the website forms, in one inbox (tables of migrations 0006, 0013, 0015,
 * 0019; read and updated as the signed-in admin, RLS admin_all / invreq_admin_*). Sponsor enquiries are contact messages
 * with the topic "partnership".
 */
export const KINDS = ['tryout', 'enrolment', 'invoice', 'message'] as const;
export type Kind = (typeof KINDS)[number];

/** Status flow per kind, as the database allows it (request_status for three tables, invoice_requests has its own). */
export const STATUSES: Record<Kind, readonly string[]> = {
  tryout: ['new', 'in_review', 'accepted', 'declined', 'archived'],
  enrolment: ['new', 'in_review', 'accepted', 'declined', 'archived'],
  invoice: ['new', 'invoiced', 'paid', 'cancelled'],
  message: ['new', 'in_review', 'archived'],
};
/** Still waiting for someone: shown by default. */
export const OPEN: Record<Kind, readonly string[]> = {
  tryout: ['new', 'in_review'], enrolment: ['new', 'in_review'], invoice: ['new', 'invoiced'], message: ['new', 'in_review'],
};

export interface Request {
  kind: Kind; id: string; created_at: string; status: string; name: string; email: string; phone: string | null;
  /** short facts for the list line, already plain values (translated by the page) */
  position?: string | null; age?: number | null; previous_team?: string | null; palloliitto_url?: string | null;
  guardian?: string | null; message?: string | null; topic?: string; plan?: string | null; payment_method?: string | null;
  player_name?: string | null; address?: string | null; nationality?: string | null; note?: string | null; tryout_on?: string | null;
  invoice_number?: string | null; reference?: string | null; locale?: string | null;
}

const TABLE: Record<Kind, string> = { tryout: 'tryout_requests', enrolment: 'player_enrolments', invoice: 'invoice_requests', message: 'contact_messages' };
export const tableOf = (k: Kind) => TABLE[k];

const age = (dob: string | null) => {
  if (!dob) return null;
  const d = new Date(`${dob}T12:00:00Z`), now = new Date();
  return now.getUTCFullYear() - d.getUTCFullYear() - (now < new Date(Date.UTC(now.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) ? 1 : 0);
};
type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

/** All requests of the chosen kinds, newest first (at most 200 per kind). */
export async function loadRequests(db: SupabaseClient, kinds: readonly Kind[], open: boolean): Promise<Request[]> {
  const q = (k: Kind, cols: string) => {
    let x = db.from(TABLE[k]).select(cols).order('created_at', { ascending: false }).limit(200);
    if (open) x = x.in('status', [...OPEN[k]]);
    return x;
  };
  const [tr, en, inv, msg] = await Promise.all([
    kinds.includes('tryout') ? q('tryout', 'id, created_at, status, first_name, last_name, email, phone, date_of_birth, position, previous_team, palloliitto_url, guardian_name, guardian_phone, message, internal_note, tryout_on, locale') : null,
    kinds.includes('enrolment') ? q('enrolment', 'id, created_at, status, first_name, last_name, email, phone, date_of_birth, position, nationality, address, city, previous_team, palloliitto_url, guardian_name, guardian_phone, payment_method, internal_note, locale, membership_plans(name)') : null,
    kinds.includes('invoice') ? q('invoice', 'id, created_at, status, full_name, email, phone, player_name, address, postal_code, city, reference_note, invoice_number, locale, membership_plans(name)') : null,
    kinds.includes('message') ? q('message', 'id, created_at, status, name, email, topic, message') : null,
  ]);
  const out: Request[] = [];
  for (const r of ((tr?.data ?? []) as unknown as Row[])) out.push({
    kind: 'tryout', id: r.id as string, created_at: r.created_at as string, status: r.status as string, name: `${r.first_name} ${r.last_name}`, email: r.email as string,
    phone: s(r.phone), position: s(r.position), age: age(s(r.date_of_birth)), previous_team: s(r.previous_team), palloliitto_url: s(r.palloliitto_url),
    guardian: [s(r.guardian_name), s(r.guardian_phone)].filter(Boolean).join(' · ') || null, message: s(r.message), note: s(r.internal_note), tryout_on: s(r.tryout_on), locale: s(r.locale),
  });
  for (const r of ((en?.data ?? []) as unknown as Row[])) out.push({
    kind: 'enrolment', id: r.id as string, created_at: r.created_at as string, status: r.status as string, name: `${r.first_name} ${r.last_name}`, email: r.email as string,
    phone: s(r.phone), position: s(r.position), age: age(s(r.date_of_birth)), nationality: s(r.nationality), address: [s(r.address), s(r.city)].filter(Boolean).join(', ') || null,
    previous_team: s(r.previous_team), palloliitto_url: s(r.palloliitto_url), guardian: [s(r.guardian_name), s(r.guardian_phone)].filter(Boolean).join(' · ') || null,
    payment_method: s(r.payment_method), plan: s((r.membership_plans as Row | null)?.name), note: s(r.internal_note), locale: s(r.locale),
  });
  for (const r of ((inv?.data ?? []) as unknown as Row[])) out.push({
    kind: 'invoice', id: r.id as string, created_at: r.created_at as string, status: r.status as string, name: r.full_name as string, email: r.email as string,
    phone: s(r.phone), player_name: s(r.player_name), address: [s(r.address), [s(r.postal_code), s(r.city)].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
    reference: s(r.reference_note), invoice_number: s(r.invoice_number), plan: s((r.membership_plans as Row | null)?.name), locale: s(r.locale),
  });
  for (const r of ((msg?.data ?? []) as unknown as Row[])) out.push({
    kind: 'message', id: r.id as string, created_at: r.created_at as string, status: r.status as string, name: r.name as string, email: r.email as string,
    phone: null, topic: r.topic as string, message: s(r.message),
  });
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** New requests of every kind, for the badge in the admin menu. */
export async function newRequestCount(db: SupabaseClient): Promise<number> {
  const counts = await Promise.all(KINDS.map((k) => db.from(TABLE[k]).select('id', { count: 'exact', head: true }).eq('status', 'new')));
  return counts.reduce((n, c) => n + (c.count ?? 0), 0);
}
