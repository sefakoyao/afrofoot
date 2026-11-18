import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** One quiz question, already in the player's language, options shuffled; `answer` is the index of the right one. */
export interface QuizQuestion { id: string; text: string; options: string[]; answer: number; explain: string | null; source: string | null; topic: 'rules' | 'club' }

type L10n = Record<string, string>;
type Facts = { scorers: { name: string; goals: number }[]; seasons: [number, number] | null; leagues: string[]; ladder: string[]; founded: number | null };
type T = (key: string, values?: Record<string, string | number>) => string;

const pick = (o: L10n | null | undefined, locale: string) => (o ? o[locale] || o.en || '' : '');
function shuffle<X>(xs: X[]): X[] { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; }
/** Shuffles the options and keeps track of where the right one went. */
function mix(options: string[], right: number): { options: string[]; answer: number } {
  const order = shuffle(options.map((_, i) => i));
  return { options: order.map((i) => options[i]!), answer: order.indexOf(right) };
}

/** Questions about the club made from live data (migration 0049, quiz_club_facts); a question is left out when the data cannot make it fair. */
function clubQuestions(f: Facts, t: T): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  const [top, second] = f.scorers;
  if (top && f.seasons && f.scorers.length >= 3 && (!second || top.goals > second.goals)) {
    const names = [top.name, ...f.scorers.slice(1, 4).map((s) => s.name)];
    out.push({ id: 'club-top', topic: 'club', text: t('q_top', { from: f.seasons[0], to: f.seasons[1] }), ...mix(names, 0),
      explain: t('a_top', { name: top.name, goals: top.goals, from: f.seasons[0], to: f.seasons[1] }), source: t('src_palloliitto') });
  }
  const played = f.ladder.filter((l) => f.leagues.includes(l));
  if (played.length) {
    const best = played[0]!, at = f.ladder.indexOf(best);
    // the right league and its neighbours on the ladder, so the options are plausible
    const around = f.ladder.slice(Math.max(0, at - 2), at + 3).filter((l) => l !== best).slice(0, 3);
    const options = [best, ...around];
    out.push({ id: 'club-level', topic: 'club', text: t('q_level'), ...mix(options, 0),
      explain: t('a_level', { league: best, all: played.join(', ') }), source: t('src_palloliitto') });
  }
  if (f.founded) {
    const y = f.founded;
    out.push({ id: 'club-founded', topic: 'club', text: t('q_founded'), ...mix([y, y - 2, y + 1, y - 1].map(String), 0), explain: t('a_founded', { year: y }), source: null });
  }
  return out;
}

/** A round of 5: two club questions (when the data allows) and Laws of the Game questions for the rest, in random order. */
export async function quizRound(db: SupabaseClient, locale: string, t: T, size = 5): Promise<QuizQuestion[]> {
  const [{ data: rows }, { data: facts }] = await Promise.all([
    db.from('quiz_questions').select('id, topic, question, options, answer, explain, source').eq('active', true),
    db.rpc('quiz_club_facts'),
  ]);
  const club = shuffle(facts ? clubQuestions(facts as Facts, t) : []).slice(0, 2);
  const rules = shuffle((rows ?? []) as { id: string; question: L10n; options: L10n[]; answer: number; explain: L10n | null; source: string | null }[])
    .slice(0, size - club.length)
    .map((q) => ({ id: q.id, topic: 'rules' as const, text: pick(q.question, locale), ...mix(q.options.map((o) => pick(o, locale)), q.answer), explain: q.explain ? pick(q.explain, locale) : null, source: q.source }));
  return shuffle([...rules, ...club]);
}
