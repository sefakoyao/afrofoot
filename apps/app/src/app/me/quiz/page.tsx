import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Quiz } from '@/components/Quiz';
import { requireArea } from '@/lib/auth';
import { quizRound } from '@/lib/quiz';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('quiz'))('title') };
}

/** Player area → Quiz: a new round of 5 questions each visit (migration 0049). */
export default async function QuizPage() {
  await requireArea('me');
  const [t, locale, supabase] = await Promise.all([getTranslations('quiz'), getLocale(), getSupabase()]);
  const questions = supabase ? await quizRound(supabase, locale, (k, v) => t(k as 'title', v as never)) : [];
  const labels = Object.fromEntries((['of', 'next', 'finish', 'right', 'wrong', 'again', 'score', 'perfect', 'good', 'keep', 'source', 'club', 'rules'] as const).map((k) => [k, t.raw(k) as string])) as Record<string, string>;
  return (
    <section className="rounded-card border border-line bg-raised p-5 sm:p-6" aria-labelledby="quiz-h" data-quiz>
      <h2 id="quiz-h" className="font-display text-2xl font-extrabold">⚽ {t('title')}</h2>
      <p className="mt-1 text-muted">{t('lead')}</p>
      <div className="mt-5">
        {questions.length ? <Quiz questions={questions} labels={labels as never} /> : <p className="text-muted">{t('empty')}</p>}
      </div>
    </section>
  );
}
