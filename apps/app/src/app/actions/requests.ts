'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { KINDS, STATUSES, tableOf, type Kind } from '@/lib/requests';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Admin → Requests: change a request's status and the admin's own fields (internal note, tryout date, invoice number).
 * Checks mirror the table constraints (migrations 0006, 0013, 0015, 0019); RLS decides that only admins may update.
 */
const schema = z.object({
  kind: z.enum(KINDS), id: z.string().uuid(), status: z.string(),
  note: z.string().trim().max(2000).optional(),
  tryout_on: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  invoice_number: z.string().trim().max(40).optional(),
  back: z.string().regex(/^\/admin\/requests(\?[\w=&%-]*)?$/).optional(),
});

export async function updateRequest(fd: FormData): Promise<void> {
  const member = await requireArea('admin');
  const raw = Object.fromEntries(['kind', 'id', 'status', 'note', 'tryout_on', 'invoice_number', 'back'].map((k) => [k, fd.get(k) ?? undefined]));
  const p = schema.safeParse(raw);
  const back = (result: string, id?: string): never => {
    const base = p.success && p.data.back ? p.data.back : '/admin/requests';
    redirect(`${base}${base.includes('?') ? '&' : '?'}result=${result}${id ? `&open=${id}#r-${id}` : ''}`);
  };
  if (!p.success) return back('r_invalid');
  const v = p.data;
  const kind = v.kind as Kind;
  if (!STATUSES[kind].includes(v.status)) return back('r_invalid', v.id);
  const supabase = await getSupabase();
  if (!supabase) return back('r_error', v.id);
  const now = new Date().toISOString();
  const row: Record<string, unknown> = { status: v.status };
  if (kind === 'tryout' || kind === 'enrolment') { row.reviewed_by = member.id; row.internal_note = v.note || null; }
  if (kind === 'tryout') row.tryout_on = v.tryout_on || null;
  if (kind === 'message') row.handled_by = member.id;
  if (kind === 'invoice') { row.handled_by = member.id; row.handled_at = now; row.invoice_number = v.invoice_number || null; }
  const { data, error } = await supabase.from(tableOf(kind)).update(row).eq('id', v.id).select('id');
  if (error) { console.error('[requests] update refused', { kind, code: error.code, message: error.message }); return back('r_error', v.id); }
  if (!data?.length) return back('r_gone');
  revalidatePath('/admin', 'layout');
  return back('r_saved', v.id);
}
