import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { deleteQuestion, saveQuestion } from '@/app/actions/quiz';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { QUIZ_LIMITS, QUIZ_LOCALES, QUIZ_MAX_OPTIONS, QUIZ_TOPICS } from '@/lib/quiz-form';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('quizAdmin'))('title') };
}

type L10n = Partial<Record<(typeof QUIZ_LOCALES)[number], string>>;
type Question = { id: string; topic: (typeof QUIZ_TOPICS)[number]; question: L10n; options: L10n[]; answer: number; explain: L10n | null; source: string | null; active: boolean; created_at: string };

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const input = 'min-h-10 w-full rounded-control border border-line bg-raised px-3 font-normal';
const LANG_DIR = (l: string) => (l === 'ar' ? 'rtl' : 'ltr');

/**
 * Admin → Quiz: every question of the players' football quiz (migration 0049), with filters by topic and state.
 * Each question opens to an editor: the question, up to six options and the explanation in the four languages
 * (English required, the others fall back to it), the right answer, the source and whether players see it.
 * Club questions made from live data (top scorer, league level…) are built by the app and are not listed here.
 */
export default async function QuizAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, tq, locale, supabase] = await Promise.all([getTranslations('quizAdmin'), getTranslations('quiz'), getLocale(), getSupabase()]);
  const topic = QUIZ_TOPICS.find((x) => x === one(sp.topic));
  const state = one(sp.state) === 'off' ? 'off' : one(sp.state) === 'on' ? 'on' : 'all';
  const openId = one(sp.open);
  let query = supabase?.from('quiz_questions').select('id, topic, question, options, answer, explain, source, active, created_at').order('created_at', { ascending: false });
  if (query && topic) query = query.eq('topic', topic);
  if (query && state !== 'all') query = query.eq('active', state === 'on');
  const rows = ((query ? (await query).data : null) ?? []) as Question[];
  const href = (tp: string | undefined, st: string) => `/admin/quiz?${new URLSearchParams({ ...(tp ? { topic: tp } : {}), ...(st !== 'all' ? { state: st } : {}) })}`;
  const label = (o: L10n | null | undefined) => (o ? o[locale as 'en'] || o.en || '' : '');
  const missing = (q: Question) => QUIZ_LOCALES.filter((l) => !q.question[l] || q.options.some((o) => !o[l]) || (q.explain && !q.explain[l]));

  const Texts = ({ name, value, max, rows: r }: { name: string; value?: L10n | null; max: number; rows?: number }) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {QUIZ_LOCALES.map((l) => (
        <label key={l} className="grid gap-1 text-xs font-semibold text-muted">
          <span>{t(`lang_${l}`)}{l === 'en' ? ` · ${t('required')}` : ''}</span>
          {r ? <textarea name={`${name}_${l}`} required={name === 'q' && l === 'en'} lang={l} dir={LANG_DIR(l)} rows={r} maxLength={max} defaultValue={value?.[l] ?? ''} className="rounded-control border border-line bg-raised p-2 text-sm font-normal text-ink" />
            : <input name={`${name}_${l}`} lang={l} dir={LANG_DIR(l)} maxLength={max} defaultValue={value?.[l] ?? ''} className={`${input} text-sm text-ink`} />}
        </label>
      ))}
    </div>
  );

  const Editor = ({ q }: { q?: Question }) => (
    <form action={saveQuestion} className="grid gap-4" data-quiz-form>
      <input type="hidden" name="id" value={q?.id ?? ''} />
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-sm font-semibold">{t('topic')}
          <select name="topic" defaultValue={q?.topic ?? 'rules'} className={input}>
            {QUIZ_TOPICS.map((x) => <option key={x} value={x}>{t(`topic_${x}`)}</option>)}
          </select></label>
        <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="active" defaultChecked={q?.active ?? true} className="size-5 accent-accent" data-active />{t('active')}</label>
      </div>
      <fieldset className="grid gap-2"><legend className="mb-1 font-display font-bold">{t('question')}</legend>
        <Texts name="q" value={q?.question} max={QUIZ_LIMITS.question} rows={2} /></fieldset>
      <fieldset className="grid gap-3"><legend className="mb-1 font-display font-bold">{t('options')}</legend>
        <p className="text-sm text-muted">{t('optionsHint')}</p>
        {Array.from({ length: QUIZ_MAX_OPTIONS }, (_, i) => (
          <div key={i} className="grid gap-2 rounded-control bg-surface p-3" data-option-slot={i}>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="radio" name="answer" value={i} defaultChecked={(q?.answer ?? 0) === i} required className="size-5 accent-accent" />
              {t('option', { n: i + 1 })} · {t('rightAnswer')}</label>
            <Texts name={`o${i}`} value={q?.options[i]} max={QUIZ_LIMITS.option} />
          </div>
        ))}
      </fieldset>
      <fieldset className="grid gap-2"><legend className="mb-1 font-display font-bold">{t('explain')}</legend>
        <Texts name="x" value={q?.explain} max={QUIZ_LIMITS.explain} rows={3} /></fieldset>
      <label className="grid gap-1 text-sm font-semibold">{t('source')}
        <input name="source" maxLength={QUIZ_LIMITS.source} defaultValue={q?.source ?? ''} placeholder={t('sourceHint')} className={input} /></label>
      <div className="flex flex-wrap gap-3">
        <button className="min-h-10 rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110" data-save>{q ? t('save') : t('add')}</button>
        {q ? <button formAction={deleteQuestion} formNoValidate className="min-h-10 rounded-full border-2 border-danger px-5 font-display font-bold text-danger hover:bg-danger/10" data-delete>{t('delete')}</button> : null}
      </div>
    </form>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
      </header>
      <ResultBanner ns="quizAdmin" result={sp.result} />

      <details className="rounded-card border-2 border-dashed border-accent bg-raised open:shadow-sm" data-quiz-new>
        <summary className="cursor-pointer list-none p-4 font-display font-extrabold text-pitch">+ {t('new')}</summary>
        <div className="border-t border-line p-4"><Editor /></div>
      </details>

      <nav aria-label={t('filter')} className="flex flex-wrap items-center gap-2" data-quiz-filters>
        {[undefined, ...QUIZ_TOPICS].map((x) => (
          <a key={x ?? 'all'} href={href(x, state)} aria-current={x === topic ? 'page' : undefined} data-topic-filter={x ?? 'all'}
            className={`inline-flex min-h-10 items-center rounded-full border-2 px-4 text-sm font-semibold ${x === topic ? 'border-accent bg-accent text-on-accent' : 'border-line hover:border-accent'}`}>
            {x ? t(`topic_${x}`) : t('all')}</a>
        ))}
        <span className="ms-auto flex gap-2">
          {(['all', 'on', 'off'] as const).map((st) => (
            <a key={st} href={href(topic, st)} aria-current={st === state ? 'page' : undefined} data-state-filter={st}
              className={`inline-flex min-h-10 items-center rounded-full border-2 px-4 text-sm font-semibold ${st === state ? 'border-ink-950 bg-ink-950 text-white' : 'border-line hover:border-ink-950'}`}>
              {t(`state_${st}`)}</a>
          ))}
        </span>
      </nav>

      <p className="text-sm text-muted" data-quiz-count>{t('count', { count: rows.length })}</p>
      {rows.length ? (
        <ul className="grid gap-3">
          {rows.map((q) => {
            const gaps = missing(q);
            return (
              <li key={q.id} id={`q-${q.id}`} className="scroll-mt-4" data-quiz-row data-active={q.active ? 'true' : 'false'}>
                <details open={q.id === openId} className="rounded-card border border-line bg-raised open:shadow-sm">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 p-4">
                    <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold">{t(`topic_${q.topic}`)}</span>
                    {!q.active ? <span className="rounded-full bg-line px-2 py-0.5 text-xs font-bold text-muted" data-off-badge>{t('off')}</span> : null}
                    {gaps.length ? <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-black" data-missing>{t('missing', { langs: gaps.map((l) => l.toUpperCase()).join(', ') })}</span> : null}
                    <span className="basis-full font-semibold" dir="auto">{label(q.question)}</span>
                    <span className="basis-full text-sm text-muted" dir="auto">✓ {label(q.options[q.answer])}{q.source ? ` · ${tq('source')}: ${q.source}` : ''}</span>
                  </summary>
                  <div className="border-t border-line p-4"><Editor q={q} /></div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : <p className="rounded-card border border-line bg-raised p-5 text-muted" data-quiz-empty>{t('empty')}</p>}
      <p className="text-xs text-muted">{t('clubNote')}</p>
    </div>
  );
}
