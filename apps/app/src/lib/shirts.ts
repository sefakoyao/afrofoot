import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Shirt numbers (migration 0057): the numbers 1–99 of a team and the requests for them. */
export type ShirtNumber = { number: number; player_id: string | null; player_name: string | null; requests: number; mine_requested: boolean; free: boolean; /** 0059: one of the club's numbers */ in_set: boolean };
export type ShirtRequest = { id: string; team_season_id: string; player_id: string; number: number; note: string | null; status: 'pending' | 'approved' | 'declined' | 'withdrawn'; decision_note: string | null; created_at: string; decided_at: string | null; players?: { first_name: string; last_name: string } | null };

export async function shirtNumbers(db: SupabaseClient, teamSeasonId: string): Promise<ShirtNumber[]> {
  const { data } = await db.rpc('shirt_numbers', { p_ts: teamSeasonId });
  return (data ?? []) as ShirtNumber[];
}

/** Open requests of one or more teams, oldest first, with the player's name (staff and admins). */
export async function openShirtRequests(db: SupabaseClient, teamSeasonIds: string[]): Promise<ShirtRequest[]> {
  if (!teamSeasonIds.length) return [];
  const { data } = await db.from('jersey_requests').select('id, team_season_id, player_id, number, note, status, decision_note, created_at, decided_at, players(first_name, last_name)')
    .in('team_season_id', teamSeasonIds).eq('status', 'pending').order('created_at');
  return (data ?? []) as unknown as ShirtRequest[];
}

/** "1-39, 77" or "1–39 77" → [1..39, 77] (1–99, sorted, unique); null when something is not a number or range. */
export function parseRanges(text: string): number[] | null {
  const out = new Set<number>();
  for (const part of text.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^(\d{1,2})(?:[-–](\d{1,2}))?$/);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2] ?? m[1]);
    if (a < 1 || b > 99 || a > b) return null;
    for (let n = a; n <= b; n++) out.add(n);
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

/** "1–4, 6, 8–12": free numbers written as ranges. */
export function ranges(ns: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j]! + 1) j++;
    out.push(j > i ? `${ns[i]}–${ns[j]}` : String(ns[i]));
    i = j;
  }
  return out.join(', ');
}
