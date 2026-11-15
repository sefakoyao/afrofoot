import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Data for the player's own pages. Every query runs as the signed-in player, so RLS decides what comes back:
 * own players / player_private rows, and matches, stats and training of their own team (migration 0008).
 */

export interface PlayerSport {
  id: string; position: string | null; secondaryPosition: string | null; preferredFoot: string | null;
  heightCm: number | null; weightKg: number | null; shirt: number | null;
  phone: string | null; emergencyName: string | null; emergencyRelation: string | null; emergencyPhone: string | null;
}

export async function loadPlayerSport(db: SupabaseClient, profileId: string): Promise<PlayerSport | null> {
  const { data: p } = await db.from('players')
    .select('id, position, secondary_position, preferred_foot, height_cm, weight_kg').eq('profile_id', profileId).maybeSingle();
  if (!p) return null;
  const [{ data: priv }, { data: roster }] = await Promise.all([
    db.from('player_private').select('phone, emergency_name, emergency_relation, emergency_phone').eq('player_id', p.id).maybeSingle(),
    db.from('team_players').select('jersey_number, team_seasons!inner(seasons!inner(is_current))')
      .eq('player_id', p.id).is('left_on', null).eq('team_seasons.seasons.is_current', true).limit(1),
  ]);
  return {
    id: p.id, position: p.position, secondaryPosition: p.secondary_position, preferredFoot: p.preferred_foot,
    heightCm: p.height_cm, weightKg: p.weight_kg, shirt: (roster?.[0]?.jersey_number as number | null | undefined) ?? null,
    phone: priv?.phone ?? null, emergencyName: priv?.emergency_name ?? null, emergencyRelation: priv?.emergency_relation ?? null, emergencyPhone: priv?.emergency_phone ?? null,
  };
}

export interface MatchLine { id: string; kickoffAt: string; opponent: string; homeAway: string; goalsFor: number | null; goalsAgainst: number | null; minutes: number; goals: number; assists: number }
export interface SeasonStats { played: number; goals: number; assists: number; minutes: number; yellow: number; red: number; cleanSheets: number; last: MatchLine[] }

type StatRow = {
  minutes: number; goals: number; assists: number; yellow_cards: number; red_card: boolean; clean_sheet: boolean;
  matches: { id: string; kickoff_at: string; opponent: string; home_away: string; goals_for: number | null; goals_against: number | null };
};

/** Current season, played matches only. match_player_stats is filled by the coach or by match day when a match ends (0012). */
export async function loadSeasonStats(db: SupabaseClient, playerId: string): Promise<SeasonStats> {
  const { data } = await db.from('match_player_stats')
    .select('minutes, goals, assists, yellow_cards, red_card, clean_sheet, matches!inner(id, kickoff_at, opponent, home_away, goals_for, goals_against, status, team_seasons!inner(seasons!inner(is_current)))')
    .eq('player_id', playerId).eq('matches.status', 'played').eq('matches.team_seasons.seasons.is_current', true);
  const rows = (data as unknown as StatRow[] | null) ?? [];
  const sum = (f: (r: StatRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  return {
    played: rows.filter((r) => r.minutes > 0).length,
    goals: sum((r) => r.goals), assists: sum((r) => r.assists), minutes: sum((r) => r.minutes),
    yellow: sum((r) => r.yellow_cards), red: sum((r) => (r.red_card ? 1 : 0)), cleanSheets: sum((r) => (r.clean_sheet ? 1 : 0)),
    last: rows.filter((r) => r.minutes > 0).sort((a, b) => b.matches.kickoff_at.localeCompare(a.matches.kickoff_at)).slice(0, 5).map((r) => ({
      id: r.matches.id, kickoffAt: r.matches.kickoff_at, opponent: r.matches.opponent, homeAway: r.matches.home_away,
      goalsFor: r.matches.goals_for, goalsAgainst: r.matches.goals_against, minutes: r.minutes, goals: r.goals, assists: r.assists,
    })),
  };
}

export interface Training { attended: number; late: number; missed: number; excused: number; rate: number | null }

/** Current season, sessions that already started and were not cancelled. Excused absences do not lower the rate. */
export async function loadTraining(db: SupabaseClient, playerId: string): Promise<Training> {
  const { data } = await db.from('session_attendance')
    .select('attendance, training_sessions!inner(starts_at, status, team_seasons!inner(seasons!inner(is_current)))')
    .eq('player_id', playerId).not('attendance', 'is', null)
    .lt('training_sessions.starts_at', new Date().toISOString()).neq('training_sessions.status', 'cancelled')
    .eq('training_sessions.team_seasons.seasons.is_current', true);
  const rows = (data as { attendance: string }[] | null) ?? [];
  const n = (s: string) => rows.filter((r) => r.attendance === s).length;
  const present = n('present'), late = n('late'), missed = n('absent'), excused = n('excused');
  const counted = present + late + missed;
  return { attended: present + late, late, missed, excused, rate: counted ? Math.round(((present + late) / counted) * 100) : null };
}
