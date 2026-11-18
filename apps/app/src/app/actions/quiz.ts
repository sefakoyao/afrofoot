'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireArea } from '@/lib/auth';
import { QUIZ_LIMITS as LIMITS, QUIZ_LOCALES as LOCALES, QUIZ_MAX_OPTIONS as MAX_OPTIONS, QUIZ_TOPICS } from '@/lib/quiz-form';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Admin → Quiz: add, edit and delete quiz questions. The checks mirror the table (migrations 0049 and 0050):
 * an English question (≤ 300 characters per language), 2–6 options each with English (≤ 150), the right answer among
 * them, an optional explanation that then needs English (≤ 600), a source (≤ 200). RLS lets only admins write.
 */

const text = (max: number) => z.string().trim().max(max);
const texts = (max: number) => z.object(Object.fromEntries(LOCALES.map((l) => [l, text(max)])) as Record<(typeof LOCALES)[number], ReturnType<typeof text>>);
const schema = z.object({
  id: z.union([z.literal(''), z.string().uuid()]),
  topic: z.enum(QUIZ_TOPICS),
  question: texts(LIMITS.question),
  options: z.array(texts(LIMITS.option)).length(MAX_OPTIONS),
  answer: z.coerce.number().int().min(0).max(MAX_OPTIONS - 1),
  explain: texts(LIMITS.explain),
  source: text(LIMITS.source),
  active: z.boolean(),
});

type L10n = Partial<Record<(typeof LOCALES)[number], string>>;
/** Only the languages that were filled in. */
const filled = (o: Record<string, string>): L10n => Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as L10n;

function back(result: string, id?: string): never {
  redirect(`/admin/quiz?result=${result}${id ? `&open=${id}#q-${id}` : ''}`);
}

export async function saveQuestion(fd: FormData): Promise<void> {
  await requireArea('admin');
  const s = (k: string) => String(fd.get(k) ?? '');
  const loc = (prefix: string) => Object.fromEntries(LOCALES.map((l) => [l, s(`${prefix}_${l}`)]));
  const p = schema.safeParse({
    id: s('id'), topic: s('topic') || 'rules', question: loc('q'),
    options: Array.from({ length: MAX_OPTIONS }, (_, i) => loc(`o${i}`)),
    answer: s('answer'), explain: loc('x'), source: s('source'), active: fd.get('active') === 'on',
  });
  const id = s('id') || undefined;
  if (!p.success) return back('r_invalid', id);
  const v = p.data;
  if (!v.question.en) return back('r_questionEn', id);
  // keep the options that have any text; each needs English; the right answer moves with the compaction
  const kept = v.options.map((o, i) => ({ o: filled(o), i })).filter((x) => Object.keys(x.o).length);
  if (kept.some((x) => !x.o.en)) return back('r_optionEn', id);
  if (kept.length < 2) return back('r_options', id);
  const answer = kept.findIndex((x) => x.i === v.answer);
  if (answer < 0) return back('r_answer', id);
  const explain = filled(v.explain);
  if (Object.keys(explain).length && !explain.en) return back('r_explainEn', id);

  const supabase = await getSupabase();
  if (!supabase) return back('r_error', id);
  const row = {
    topic: v.topic, question: filled(v.question), options: kept.map((x) => x.o), answer,
    explain: Object.keys(explain).length ? explain : null, source: v.source || null, active: v.active,
  };
  const { data, error } = v.id
    ? await supabase.from('quiz_questions').update(row).eq('id', v.id).select('id')
    : await supabase.from('quiz_questions').insert(row).select('id');
  if (error) { console.error('[quiz] save refused', { code: error.code, message: error.message }); return back('r_error', id); }
  if (!data?.length) return back('r_gone');
  revalidatePath('/admin/quiz');
  revalidatePath('/me/quiz');
  return back(v.id ? 'r_saved' : 'r_added', data[0]!.id as string);
}

export async function deleteQuestion(fd: FormData): Promise<void> {
  await requireArea('admin');
  const id = z.string().uuid().safeParse(fd.get('id'));
  if (!id.success) return back('r_invalid');
  const supabase = await getSupabase();
  if (!supabase) return back('r_error');
  const { data, error } = await supabase.from('quiz_questions').delete().eq('id', id.data).select('id');
  if (error) { console.error('[quiz] delete refused', { code: error.code, message: error.message }); return back('r_error', id.data); }
  if (!data?.length) return back('r_gone');
  revalidatePath('/admin/quiz');
  revalidatePath('/me/quiz');
  return back('r_deleted');
}
