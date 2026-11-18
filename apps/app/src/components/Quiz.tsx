'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { QuizQuestion } from '@/lib/quiz';

type Labels = { of: string; next: string; finish: string; right: string; wrong: string; again: string; score: string; perfect: string; good: string; keep: string; source: string; club: string; rules: string };

/** Five questions, one at a time: pick an answer, see right or wrong with a short explanation, then the score. Nothing is saved. */
export function Quiz({ questions, labels }: { questions: QuizQuestion[]; labels: Labels }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const q = questions[i];
  const fill = (s: string, v: Record<string, string | number>) => Object.entries(v).reduce((r, [k, x]) => r.replace(`{${k}}`, String(x)), s);

  if (!q) return null;
  if (done) {
    const msg = score === questions.length ? labels.perfect : score >= Math.ceil(questions.length / 2) ? labels.good : labels.keep;
    return (
      <div className="grid justify-items-center gap-3 py-6 text-center" data-quiz-done={score}>
        <p className="font-display text-6xl font-black tabular-nums" dir="ltr">{score}/{questions.length}</p>
        <p className="font-display text-xl font-extrabold">{msg}</p>
        <p className="text-muted">{fill(labels.score, { score, total: questions.length })}</p>
        <button type="button" onClick={() => { setI(0); setPicked(null); setScore(0); setDone(false); router.refresh(); }}
          className="mt-2 min-h-11 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110" data-quiz-again>{labels.again}</button>
      </div>
    );
  }
  const answered = picked !== null;
  const choose = (n: number) => { if (answered) return; setPicked(n); if (n === q.answer) setScore((s) => s + 1); };
  return (
    <div className="grid gap-4" data-quiz-question={i + 1}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="rounded-full bg-surface px-3 py-1 font-bold" data-quiz-topic={q.topic}>{q.topic === 'club' ? labels.club : labels.rules}</span>
        <span className="text-muted" dir="ltr">{fill(labels.of, { n: i + 1, total: questions.length })}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true"><div className="h-full bg-accent transition-all" style={{ width: `${((i + (answered ? 1 : 0)) / questions.length) * 100}%` }} /></div>
      <h3 className="font-display text-xl font-extrabold" dir="auto">{q.text}</h3>
      <div className="grid gap-2" role="group" aria-label={q.text}>
        {q.options.map((o, n) => {
          const state = !answered ? '' : n === q.answer ? 'right' : n === picked ? 'wrong' : 'dim';
          return (
            <button key={n} type="button" onClick={() => choose(n)} disabled={answered} data-option={n} data-state={state || undefined}
              className={`min-h-12 rounded-card border-2 px-4 py-2 text-start font-semibold transition ${state === 'right' ? 'border-accent bg-accent/20' : state === 'wrong' ? 'border-danger bg-danger/10' : state === 'dim' ? 'border-line opacity-60' : 'border-line bg-raised hover:border-accent'}`}>
              <span dir="auto">{o}</span>
              {state === 'right' ? <span className="ms-2" aria-hidden="true">✓</span> : state === 'wrong' ? <span className="ms-2" aria-hidden="true">✗</span> : null}
            </button>
          );
        })}
      </div>
      {answered ? (
        <div className={`rounded-card p-4 ${picked === q.answer ? 'bg-accent/10' : 'bg-danger/10'}`} role="status" data-quiz-feedback={picked === q.answer ? 'right' : 'wrong'}>
          <p className="font-display font-extrabold">{picked === q.answer ? labels.right : labels.wrong}</p>
          {q.explain ? <p className="mt-1 text-sm" dir="auto">{q.explain}</p> : null}
          {q.source ? <p className="mt-1 text-xs text-muted">{labels.source}: {q.source}</p> : null}
          <button type="button" onClick={() => { if (i + 1 >= questions.length) setDone(true); else { setI(i + 1); setPicked(null); } }}
            className="mt-3 min-h-11 rounded-full bg-fg px-6 font-display font-bold text-white hover:brightness-125" data-quiz-next>{i + 1 >= questions.length ? labels.finish : labels.next}</button>
        </div>
      ) : null}
    </div>
  );
}
