import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The coach's next events to answer (Coach home): trainings, games and team events of the teams they coach, in the next
 * three weeks, with their own answer and how many of the team's coaches are in (coach_replies, migration 0072).
 * Team events are skipped when club events are not installed; everything is empty before migration 0072.
 */
export type CoachEventKind = 'practice' | 'match' | 'event';
export type Answer = 'yes' | 'maybe' | 'no';
export type CoachEvent = { kind: CoachEventKind; id: string; title: string; at: string; teamSeasonId: string; mine: Answer | null; coachesIn: number };

export async function coachEvents(db: SupabaseClient, profileId: string, teamIds: string[], limit = 8): Promise<{ events: CoachEvent[]; installed: boolean }> {
  if (!teamIds.length) return { events: [], installed: true };
  const now = new Date().toISOString(), until = new Date(Date.now() + 21 * 86_400_000).toISOString();
  const [s, m, e] = await Promise.all([
    db.from('training_sessions').select('id, title, starts_at, team_season_id').in('team_season_id', teamIds).eq('status', 'scheduled').gt('starts_at', now).lte('starts_at', until).order('starts_at').limit(limit),
    db.from('matches').select('id, opponent, kickoff_at, team_season_id').in('team_season_id', teamIds).eq('status', 'scheduled').gt('kickoff_at', now).lte('kickoff_at', until).order('kickoff_at').limit(limit),
    db.from('club_events').select('id, title, starts_at, team_season_id').in('team_season_id', teamIds).eq('status', 'scheduled').gt('starts_at', now).lte('starts_at', until).order('starts_at').limit(limit),
  ]);
  const events: CoachEvent[] = [
    ...((s.data ?? []) as { id: string; title: string; starts_at: string; team_season_id: string }[]).map((x) => ({ kind: 'practice' as const, id: x.id, title: x.title, at: x.starts_at, teamSeasonId: x.team_season_id, mine: null, coachesIn: 0 })),
    ...((m.data ?? []) as { id: string; opponent: string; kickoff_at: string; team_season_id: string }[]).map((x) => ({ kind: 'match' as const, id: x.id, title: x.opponent, at: x.kickoff_at, teamSeasonId: x.team_season_id, mine: null, coachesIn: 0 })),
    ...(e.error ? [] : ((e.data ?? []) as { id: string; title: string; starts_at: string; team_season_id: string }[]).map((x) => ({ kind: 'event' as const, id: x.id, title: x.title, at: x.starts_at, teamSeasonId: x.team_season_id, mine: null, coachesIn: 0 }))),
  ].sort((a, b) => a.at.localeCompare(b.at)).slice(0, limit);
  if (!events.length) return { events, installed: true };
  const { data: replies, error } = await db.from('coach_replies').select('event_kind, event_id, profile_id, availability').in('event_id', events.map((x) => x.id));
  if (error) return { events, installed: false };   // migration 0072 not installed: the page says so
  for (const r of (replies ?? []) as { event_kind: CoachEventKind; event_id: string; profile_id: string; availability: Answer }[]) {
    const ev = events.find((x) => x.id === r.event_id && x.kind === r.event_kind);
    if (!ev) continue;
    if (r.profile_id === profileId) ev.mine = r.availability;
    if (r.availability === 'yes') ev.coachesIn++;
  }
  return { events, installed: true };
}
