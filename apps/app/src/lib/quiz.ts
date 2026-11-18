import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** One quiz question, already in the player's language, options shuffled; `answer` is the index of the right one. */
export interface QuizQuestion { id: string; text: string; options: string[]; answer: number; explain: string | null; source: string | null; topic: 'rules' | 'club' }

type L10n = Record<string, string>;
type Facts = {
  scorers: { name: string; goals: number }[]; seasons: [number, number] | null; leagues: string[]; ladder: string[]; founded: number | null;
  // migration 0050
  biggest_win?: { opponent: string; gf: number; ga: number; season: number } | null; opponents?: string[];
  position?: { position: number; teams: number; category: string | null; season: number } | null;
  first_league_season?: number | null; cup_seasons?: number | null;
};
type T = (key: string, values?: Record<string, string | number>) => string;

const pick = (o: L10n | null | undefined, locale: string) => (o ? o[locale] || o.en || '' : '');
function shuffle<X>(xs: X[]): X[] { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; }
/** Shuffles the options and keeps track of where the right one went. */
function mix(options: string[], right: number): { options: string[]; answer: number } {
  const order = shuffle(options.map((_, i) => i));
  return { options: order.map((i) => options[i]!), answer: order.indexOf(right) };
}

/** Wrong numbers near the right one (never below `min`), for number questions. */
function near(n: number, min = 0, max = Infinity): number[] {
  return [n + 1, n - 1, n + 2, n - 2, n + 3].filter((x) => x >= min && x <= max).slice(0, 3);
}

/** Questions about the club made from live data (migrations 0049 and 0050, quiz_club_facts); a question is left out when the data cannot make it fair. */
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
  const w = f.biggest_win, others = (f.opponents ?? []).filter((o) => o !== w?.opponent);
  if (w && others.length >= 2) {
    out.push({ id: 'club-win', topic: 'club', text: t('q_win'), ...mix([w.opponent, ...shuffle(others).slice(0, 3)], 0), explain: t('a_win', { opponent: w.opponent, gf: w.gf, ga: w.ga, season: w.season }), source: t('src_palloliitto') });
  }
  const pos = f.position;
  if (pos && pos.teams >= 3) {
    const wrong = near(pos.position, 1, pos.teams);
    out.push({ id: 'club-position', topic: 'club', text: t('q_position', { league: pos.category ?? '', season: pos.season }),
      ...mix([pos.position, ...wrong].map(String), 0), explain: t('a_position', { position: pos.position, teams: pos.teams }), source: t('src_palloliitto') });
  }
  if (f.first_league_season) {
    const y = f.first_league_season;
    out.push({ id: 'club-first', topic: 'club', text: t('q_first'), ...mix([y, ...near(y, f.founded ?? 0)].map(String), 0),
      explain: t('a_first', { year: y }), source: t('src_palloliitto') });
  }
  if (f.cup_seasons) {
    const n = f.cup_seasons;
    out.push({ id: 'club-cups', topic: 'club', text: t('q_cups'), ...mix([n, ...near(n)].map(String), 0), explain: t('a_cups', { count: n }), source: t('src_palloliitto') });
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
