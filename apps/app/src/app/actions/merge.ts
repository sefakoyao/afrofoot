'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Admin → People → Merge accounts (migration 0065): merges the "remove" account into the "keep" account with
 * public.merge_accounts, which checks again that the caller may do it, that the two accounts share an email or phone,
 * moves everything and deletes the removed login. Results: ?result=<key under merge.*>.
 */
const schema = z.object({ a: z.string().uuid(), b: z.string().uuid(), keep: z.string().uuid() })
  .refine((v) => v.a !== v.b && (v.keep === v.a || v.keep === v.b), { message: 'm_invalid' })
  .transform((v) => ({ keep: v.keep, remove: v.keep === v.a ? v.b : v.a }));

const PATH = '/admin/members/merge';
function go(result: string, extra: Record<string, string> = {}): never {
  redirect(`${PATH}?${new URLSearchParams({ result, ...extra })}`);
}

export async function mergeAccounts(fd: FormData): Promise<void> {
  await requireArea('admin');
  const raw = { a: fd.get('a') ?? '', b: fd.get('b') ?? '', keep: fd.get('keep') ?? '', confirm: fd.get('confirm') ?? '' };
  const pair = { a: String(raw.a), b: String(raw.b) };
  const pairOk = z.string().uuid().safeParse(pair.a).success && z.string().uuid().safeParse(pair.b).success;
  const p = schema.safeParse(raw);
  if (!p.success) go('m_invalid', pairOk ? pair : {});
  if (raw.confirm !== 'on') go('m_confirm', pair);
  const supabase = await getSupabase();
  if (!supabase) go('m_error');
  const { error } = await supabase.rpc('merge_accounts', { p_keep: p.data.keep, p_remove: p.data.remove });
  if (error) {
    console.error('[merge] refused', { code: error.code, message: error.message });
    const m = error.message ?? '';
    go(/share no email/.test(m) ? 'm_notShared' : /super administrator/.test(m) ? 'm_adminOnlySuper' : /own account/.test(m) ? 'm_self'
      : error.code === 'P0002' ? 'm_gone' : error.code === '42501' ? 'm_notAllowed' : 'm_error', pair);
  }
  revalidatePath('/admin', 'layout');
  go('m_merged', { kept: p.data.keep });
}
