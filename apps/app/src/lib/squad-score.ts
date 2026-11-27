/**
 * Squad planner scoring (in the browser, so it follows every change on the board): how well a player fits a place, why,
 * where the squad is thin, and what to look out for. Plain rules the planner can check; no player is ranked on anything
 * the club cannot see (position, outlook, contract, training attendance, Palloliitto games and goals, age).
 */
import type { Line, PoolEntry, Status } from './squad-plan';

export type Outlook = Status | 'target';
export const outlookOf = (p: PoolEntry, statuses: Record<string, { status: Status }>): Outlook =>
  p.kind !== 'player' ? 'target' : p.contractConfirmed ? 'confirmed' : statuses[p.key]?.status ?? 'unsure';

export type Reason = { key: string; value?: string | number };
export interface Fit { entry: PoolEntry; score: number; reasons: Reason[] }

/** How well a player fits a place of this line (higher is better); null when they cannot play there at all. */
export function fit(p: PoolEntry, line: Line, outlook: Outlook): Fit | null {
  if (outlook === 'leaving') return null;
  const reasons: Reason[] = [];
  let score = 0;
  if (p.line === line) { score += 50; reasons.push({ key: 'r_main' }); }
  else if (p.second === line) { score += 30; reasons.push({ key: 'r_second' }); }
  else if (line === 'GK' || p.line === 'GK' || p.line === null) return null;   // keepers only in goal; unknown position: skip
  else { score += 8; reasons.push({ key: 'r_other' }); }
  score += { confirmed: 25, likely: 14, unsure: 0, target: 6 }[outlook];
  reasons.push({ key: `o_${outlook}` });
  if (p.attendance) { score += Math.round(p.attendance.rate / 5); reasons.push({ key: 'r_attendance', value: p.attendance.rate }); }
  if (p.games) { score += Math.min(p.games, 25) * 0.6; reasons.push({ key: 'r_games', value: p.games }); }
  if (p.goals && (line === 'FW' || line === 'MF')) { score += Math.min(p.goals, 15); reasons.push({ key: 'r_goals', value: p.goals }); }
  if (p.age != null) {
    if (p.age >= 18 && p.age <= 29) score += 4;
    else if (p.age >= 34) { score -= 4; reasons.push({ key: 'r_age', value: p.age }); }
    else if (p.age < 16) { score -= 10; reasons.push({ key: 'r_young', value: p.age }); }
  }
  if (p.contract && !p.contractConfirmed && outlook !== 'target') reasons.push({ key: 'r_contractEnds', value: p.contract.endsOn });
  return { entry: p, score: Math.round(score), reasons };
}

/** The best candidates for a place (not already on the board at depth 1–3 of that place). */
export function suggest(pool: PoolEntry[], line: Line, statuses: Record<string, { status: Status }>, exclude: Set<string>, n = 3): Fit[] {
  return pool.filter((p) => !exclude.has(p.key)).map((p) => fit(p, line, outlookOf(p, statuses))).filter((f): f is Fit => !!f && f.score >= 40)
    .sort((a, b) => b.score - a.score).slice(0, n);
}

/** Per line: places in the formation, how many players are needed (starters and a back-up each, two keepers), and who we have. */
export function gaps(roles: Line[], pool: PoolEntry[], statuses: Record<string, { status: Status }>) {
  return (['GK', 'DF', 'MF', 'FW'] as Line[]).map((line) => {
    const places = roles.filter((r) => r === line).length;
    const need = line === 'GK' ? 2 : places * 2;
    const players = pool.filter((p) => p.kind === 'player' && p.line === line);
    const count = (o: Outlook) => players.filter((p) => outlookOf(p, statuses) === o).length;
    const confirmed = count('confirmed'), likely = count('likely');
    return { line, places, need, confirmed, likely, unsure: count('unsure'), leaving: count('leaving'), missing: Math.max(0, need - confirmed),
      level: (confirmed >= need ? 'ok' : confirmed + likely >= need ? 'warn' : 'gap') as 'ok' | 'warn' | 'gap' };
  });
}

export type Warning = { key: string; values?: Record<string, string | number> };
/** Things the planner should look at: thin lines, empty places, contracts, age, players still without an outlook. */
export function warnings(roles: Line[], board: Map<number, (PoolEntry | null)[]>, pool: PoolEntry[], statuses: Record<string, { status: Status }>, year: number): Warning[] {
  const w: Warning[] = [];
  const g = gaps(roles, pool, statuses);
  const gk = g.find((x) => x.line === 'GK')!;
  if (gk.confirmed < 2) w.push({ key: 'w_keepers', values: { n: gk.confirmed } });
  const empty = roles.map((_, i) => i + 1).filter((s) => !board.get(s)?.[0]);
  if (empty.length) w.push({ key: 'w_empty', values: { n: empty.length } });
  const noBackup = roles.map((_, i) => i + 1).filter((s) => board.get(s)?.[0] && !board.get(s)?.[1]);
  if (noBackup.length) w.push({ key: 'w_backup', values: { n: noBackup.length } });
  const starters = roles.map((_, i) => board.get(i + 1)?.[0]).filter((p): p is PoolEntry => !!p);
  const unsureStarters = starters.filter((p) => ['unsure', 'likely', 'target'].includes(outlookOf(p, statuses)));
  if (unsureStarters.length) w.push({ key: 'w_unsureStarters', values: { n: unsureStarters.length } });
  const ending = starters.filter((p) => p.contract && !p.contractConfirmed && p.contract.endsOn < `${year}-04-01`);
  if (ending.length) w.push({ key: 'w_contracts', values: { n: ending.length } });
  const ages = starters.map((p) => p.age).filter((a): a is number => a != null);
  if (ages.length >= 5) { const avg = ages.reduce((a, b) => a + b, 0) / ages.length; if (avg >= 30) w.push({ key: 'w_age', values: { age: avg.toFixed(1) } }); }
  const open = pool.filter((p) => p.kind === 'player' && p.inTeam && !p.contractConfirmed && !statuses[p.key]).length;
  if (open) w.push({ key: 'w_noOutlook', values: { n: open } });
  const leaving = pool.filter((p) => p.kind === 'player' && statuses[p.key]?.status === 'leaving').length;
  if (leaving) w.push({ key: 'w_leaving', values: { n: leaving } });
  return w;
}
