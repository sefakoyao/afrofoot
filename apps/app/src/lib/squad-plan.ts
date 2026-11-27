import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Squad planner (migration 0076): who can play next season, where the team is thin, and who could fill each place.
 * Everything here is read through RLS as the signed-in admin or coach. Scores and reasons are worked out in the browser
 * from these numbers (lib/squad-score.ts), so they follow the planner's changes at once.
 */
export type Line = 'GK' | 'DF' | 'MF' | 'FW';
export const LINE_OF: Record<string, Line> = { goalkeeper: 'GK', defender: 'DF', midfielder: 'MF', forward: 'FW' };
export const STATUSES = ['confirmed', 'likely', 'unsure', 'leaving'] as const;
export type Status = (typeof STATUSES)[number];

export interface PoolEntry {
  key: string;                       // "p:<player id>" | "tryout:<id>" | "enrolment:<id>"
  kind: 'player' | 'tryout' | 'enrolment';
  id: string;
  name: string;
  line: Line | null;                 // main position
  second: Line | null;               // second position
  age: number | null;
  shirt: number | null;
  inTeam: boolean;                   // on this team's current roster
  contract: { status: string; endsOn: string } | null;
  contractConfirmed: boolean;        // a signed contract covering the planned season
  attendance: { rate: number; sessions: number } | null;   // trainings in the last 12 months (marked attendance)
  games: number; goals: number;      // Palloliitto league and cup games and goals (all seasons stored)
  previousTeam: string | null;       // applicants
}
export interface Formation { code: string; format: number; slots: { slot: number; role: Line; x: number; y: number }[] }
export interface Plan { formation: string; notes: string; slots: { slot: number; depth: number; key: string }[]; statuses: Record<string, { status: Status; note: string }> }

const ageOn = (dob: string | null, on: string) => {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  const [Y, M, D] = on.split('-').map(Number) as [number, number, number];
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
};

/** The coming season: from July on the next year, before that this year (Finnish seasons run spring to autumn). */
export const defaultYear = (now = new Date()) => (now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear());

/** The teams this person may plan: every team for admins, the teams they coach for coaches. */
export async function planTeams(db: SupabaseClient, coachTeamSeasons?: string[]): Promise<{ id: string; name: string }[]> {
  if (coachTeamSeasons) {
    if (!coachTeamSeasons.length) return [];
    const { data } = await db.from('team_seasons').select('team_id, teams!inner(name)').in('id', coachTeamSeasons);
    const seen = new Map<string, string>();
    for (const r of (data ?? []) as unknown as { team_id: string; teams: { name: string } }[]) seen.set(r.team_id, r.teams.name);
    return [...seen].map(([id, name]) => ({ id, name }));
  }
  const { data } = await db.from('teams').select('id, name').order('name');
  return (data ?? []) as { id: string; name: string }[];
}

export async function loadPlanner(db: SupabaseClient, teamId: string, year: number) {
  const seasonStart = `${year}-04-01`, seasonEnd = `${year}-10-31`, since = new Date(Date.now() - 365 * 86400000).toISOString();
  const [{ data: formations }, { data: planRow }, { data: roster }, { data: players }, applicants] = await Promise.all([
    db.from('formations').select('code, slots, format, sort_order').order('format', { ascending: false }).order('sort_order'),
    db.from('squad_plans').select('id, formation, notes').eq('team_id', teamId).eq('season_year', year).maybeSingle(),
    db.from('team_players').select('player_id, jersey_number, team_seasons!inner(team_id, seasons!inner(is_current))').eq('team_seasons.team_id', teamId).eq('team_seasons.seasons.is_current', true).is('left_on', null),
    db.from('players').select('id, first_name, last_name, position, secondary_position, date_of_birth').order('last_name').limit(400),
    db.rpc('coach_requests', { p_all: false }).then((r) => (r.error ? { data: [] } : r)),
  ]);
  const onTeam = new Map(((roster ?? []) as { player_id: string; jersey_number: number | null }[]).map((r) => [r.player_id, r.jersey_number]));
  const ps = ((players ?? []) as { id: string; first_name: string; last_name: string; position: string | null; secondary_position: string | null; date_of_birth: string | null }[]);
  const ids = ps.map((p) => p.id);

  // contracts, attendance and Palloliitto numbers (each part skipped when the database does not have it)
  const [contracts, attendance, fed] = ids.length ? await Promise.all([
    db.from('player_contracts').select('player_id, status, starts_on, ends_on').in('player_id', ids).in('status', ['player_signed', 'active', 'sent']),
    db.from('session_attendance').select('player_id, attendance, training_sessions!inner(starts_at, status)').in('player_id', ids).gte('training_sessions.starts_at', since).lte('training_sessions.starts_at', new Date().toISOString()).neq('training_sessions.status', 'cancelled').not('attendance', 'is', null).limit(20000),
    db.from('federation_players').select('external_id, player_id').in('player_id', ids),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const contractOf = new Map<string, { status: string; endsOn: string; covers: boolean }>();
  for (const c of ((contracts.data ?? []) as { player_id: string; status: string; starts_on: string; ends_on: string }[])) {
    const covers = c.status !== 'sent' && c.starts_on <= seasonEnd && c.ends_on >= seasonStart;
    const old = contractOf.get(c.player_id);
    if (!old || covers || (!old.covers && c.ends_on > old.endsOn)) contractOf.set(c.player_id, { status: c.status, endsOn: c.ends_on, covers });
  }
  const att = new Map<string, { yes: number; all: number }>();
  for (const a of ((attendance.data ?? []) as { player_id: string; attendance: string }[])) {
    const x = att.get(a.player_id) ?? { yes: 0, all: 0 };
    x.all++; if (a.attendance === 'present' || a.attendance === 'late') x.yes++;
    att.set(a.player_id, x);
  }
  const fedOf = new Map(((fed.data ?? []) as { external_id: string; player_id: string }[]).map((f) => [f.external_id, f.player_id]));
  const fedStats = new Map<string, { games: number; goals: number }>();
  if (fedOf.size) {
    const { data } = await db.from('federation_player_stats').select('player_external_id, appearances, goals').in('player_external_id', [...fedOf.keys()]);
    for (const s of ((data ?? []) as { player_external_id: string; appearances: number | null; goals: number | null }[])) {
      const pid = fedOf.get(s.player_external_id)!; const x = fedStats.get(pid) ?? { games: 0, goals: 0 };
      x.games += s.appearances ?? 0; x.goals += s.goals ?? 0; fedStats.set(pid, x);
    }
  }

  const ref = `${year}-06-30`;
  const pool: PoolEntry[] = ps.map((p) => {
    const c = contractOf.get(p.id), a = att.get(p.id), f = fedStats.get(p.id);
    return {
      key: `p:${p.id}`, kind: 'player', id: p.id, name: `${p.first_name} ${p.last_name}`.trim(),
      line: p.position ? LINE_OF[p.position] ?? null : null, second: p.secondary_position ? LINE_OF[p.secondary_position] ?? null : null,
      age: ageOn(p.date_of_birth, ref), shirt: onTeam.get(p.id) ?? null, inTeam: onTeam.has(p.id),
      contract: c ? { status: c.status, endsOn: c.endsOn } : null, contractConfirmed: !!c?.covers,
      attendance: a && a.all >= 3 ? { rate: Math.round((a.yes / a.all) * 100), sessions: a.all } : null,
      games: f?.games ?? 0, goals: f?.goals ?? 0, previousTeam: null,
    };
  });
  for (const r of ((applicants as { data: unknown }).data ?? []) as { kind: string; id: string; first_name: string; last_name: string; date_of_birth: string | null; position: string | null; previous_team: string | null; status: string }[]) {
    if (r.kind !== 'tryout' && r.kind !== 'enrolment') continue;
    pool.push({ key: `${r.kind}:${r.id}`, kind: r.kind, id: r.id, name: `${r.first_name} ${r.last_name}`.trim(), line: r.position ? LINE_OF[r.position] ?? null : null, second: null,
      age: ageOn(r.date_of_birth, ref), shirt: null, inTeam: false, contract: null, contractConfirmed: false, attendance: null, games: 0, goals: 0, previousTeam: r.previous_team });
  }

  let plan: Plan | null = null;
  if (planRow) {
    const [{ data: slots }, { data: st }] = await Promise.all([
      db.from('squad_plan_slots').select('slot, depth, player_id, applicant_kind, applicant_id').eq('plan_id', planRow.id),
      db.from('squad_plan_players').select('player_id, status, note').eq('plan_id', planRow.id),
    ]);
    plan = {
      formation: planRow.formation, notes: planRow.notes ?? '',
      slots: ((slots ?? []) as { slot: number; depth: number; player_id: string | null; applicant_kind: string | null; applicant_id: string | null }[])
        .map((s) => ({ slot: s.slot, depth: s.depth, key: s.player_id ? `p:${s.player_id}` : `${s.applicant_kind}:${s.applicant_id}` })),
      statuses: Object.fromEntries(((st ?? []) as { player_id: string; status: Status; note: string | null }[]).map((s) => [`p:${s.player_id}`, { status: s.status, note: s.note ?? '' }])),
    };
  }
  const forms: Formation[] = ((formations ?? []) as { code: string; slots: Formation['slots']; format: number | null }[])
    .map((f) => ({ code: f.code, format: f.format ?? 11, slots: f.slots.map((s) => ({ ...s, role: (s.role as Line) })) }));
  return { pool, plan, formations: forms };
}
