'use server';

import type { ZodTypeAny, z } from 'zod';
import type { FormState } from '@/lib/formState';
import { getPublicClient } from '@/lib/supabase';
import { planId } from '@/lib/plans';
import { contactSchema, enrolmentSchema, invoiceSchema, tryoutSchema } from '@/lib/schemas';


const text = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
const bad = (error: string): FormState => ({ status: 'error', error });

/** Run the schema; return the first i18n error key or the parsed data. A filled honeypot field is treated as success without saving. */
function parse<S extends ZodTypeAny>(schema: S, raw: Record<string, string>): { data: z.infer<S> } | { state: FormState } {
  if (raw.website) return { state: { status: 'ok' } };
  const r = schema.safeParse(raw);
  if (!r.success) return { state: bad(r.error.issues[0]?.message ?? 'tr_e_req') };
  return { data: r.data };
}

/** Insert one row. A duplicate open request (unique index, code 23505) reports success so nobody can probe who has applied. */
async function insert(table: string, row: Record<string, unknown>, failKey: string): Promise<FormState> {
  const db = getPublicClient();
  if (!db) return bad(failKey);
  const { error } = await db.from(table).insert(row); // no .select(): the public role may insert but never read
  if (error && error.code !== '23505') return bad(failKey);
  return { status: 'ok' };
}

export async function submitContact(_: FormState, fd: FormData): Promise<FormState> {
  const p = parse(contactSchema, text(fd));
  if ('state' in p) return p.state;
  return insert('contact_messages', p.data, 'ct_err');
}

export async function submitTryout(_: FormState, fd: FormData): Promise<FormState> {
  const p = parse(tryoutSchema, text(fd));
  if ('state' in p) return p.state;
  const { dob, consent: _c, ...d } = p.data;
  return insert('tryout_requests', { ...d, date_of_birth: dob }, 'ct_err');
}

export async function submitEnrolment(_: FormState, fd: FormData): Promise<FormState> {
  const p = parse(enrolmentSchema, text(fd));
  if ('state' in p) return p.state;
  const { dob, plan, terms: _t, privacy: _p, photo_consent, public_listing, ...d } = p.data;
  return insert('player_enrolments', {
    ...d, date_of_birth: dob, plan_id: await planId(plan),
    terms_accepted: true, privacy_accepted: true, photo_consent: photo_consent === 'on', public_listing: public_listing === 'on',
  }, 'ct_err');
}

export async function submitInvoice(_: FormState, fd: FormData): Promise<FormState> {
  const p = parse(invoiceSchema, text(fd));
  if ('state' in p) return p.state;
  const { plan, consent: _c, ...d } = p.data;
  const id = await planId(plan);
  if (!id) return bad('inv_err');
  return insert('invoice_requests', { ...d, plan_id: id, consent: true }, 'inv_err');
}

/** Sponsor enquiries are stored as contact messages with topic "partnership" and the company name. */
export async function submitSponsor(_: FormState, fd: FormData): Promise<FormState> {
  const raw = text(fd);
  const p = parse(contactSchema, { ...raw, topic: 'partnership', message: `${raw.package ? `[${raw.package}] ` : ''}${raw.message ?? ''}` });
  if ('state' in p) return p.state;
  return insert('contact_messages', p.data, 'sp_err');
}
