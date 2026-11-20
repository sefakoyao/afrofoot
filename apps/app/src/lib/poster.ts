import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Data for the Starting XI poster (Admin → Website → Matchday poster): the game, the coach's formation and the starters
 * on it, and the bench. A player's name appears only if they agreed to be shown publicly (players.show_publicly, the
 * same rule as the website's player list); otherwise the poster shows their shirt number only.
 */
export type PosterSlot = { slot: number; role: string; x: number; y: number };
export type PosterPlayer = { slot: number | null; shirt: number | null; name: string | null; captain: boolean; role: string };
export type PosterData = {
  team: string; opponent: string; homeAway: 'home' | 'away'; kickoff: string; venue: string | null; city: string | null; division: string | null; friendly: boolean;
  formation: string | null; slots: PosterSlot[]; starters: PosterPlayer[]; bench: PosterPlayer[];
};

export const POSTER_BACKGROUNDS = ['team', 'pitch', 'night'] as const;   // built-in backgrounds; uploaded photos are "media:<path>"
export const POSTER_LAYOUTS = ['list', 'cards', 'pitch'] as const;
export type PosterLayout = (typeof POSTER_LAYOUTS)[number];
export const POSTER_TITLES = ['STARTING XI', 'LINE UP', 'MATCHDAY'] as const;
/** Uploaded images, by use: backgrounds, sponsor logos ("Presented by") and featured player photos. */
export const UPLOAD_KINDS = ['bg', 'sponsor', 'player'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];
export const UPLOAD_PATH = /^posters\/(bg|sponsor|player)\/[\w-]+\.(jpg|jpeg|png)$/;
export const POSTER_FORMATS = { portrait: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 } } as const;
export type PosterFormat = keyof typeof POSTER_FORMATS;

/**
 * A sample game for trying the designs (match=sample): invented players in a 4-3-3, nothing stored, so players never see
 * it. Posters made from it carry a "SAMPLE" tag.
 */
export const SAMPLE_MATCH = 'sample';
export function samplePoster(team = 'Afro Foot Club'): PosterData {
  const next = new Date(); next.setUTCDate(next.getUTCDate() + ((6 - next.getUTCDay() + 7) % 7 || 7)); next.setUTCHours(16, 0, 0, 0); // next Saturday, 18:00 in Helsinki (winter)
  const slots: PosterSlot[] = [
    { slot: 1, role: 'GK', x: 50, y: 92 }, { slot: 2, role: 'DF', x: 20, y: 72 }, { slot: 3, role: 'DF', x: 40, y: 72 }, { slot: 4, role: 'DF', x: 60, y: 72 }, { slot: 5, role: 'DF', x: 80, y: 72 },
    { slot: 6, role: 'MF', x: 25, y: 44 }, { slot: 7, role: 'MF', x: 50, y: 44 }, { slot: 8, role: 'MF', x: 75, y: 44 },
    { slot: 9, role: 'FW', x: 25, y: 16 }, { slot: 10, role: 'FW', x: 50, y: 16 }, { slot: 11, role: 'FW', x: 75, y: 16 },
  ];
  const xi: [number, string][] = [[1, 'Sample Keeper'], [2, 'Alex Rightback'], [4, 'Sam Stopper'], [5, 'Jo Wall'], [3, 'Kim Leftback'], [8, 'Ali Engine'], [6, 'Chris Anchor'], [10, 'Ola Playmaker'],
    [7, 'Max Winger'], [9, 'Tom Striker'], [11, 'Lee Flyer']];
  return {
    team, opponent: 'Example City FC', homeAway: 'home', kickoff: next.toISOString(), venue: 'Home ground', city: 'Helsinki', division: 'Sample league', friendly: false, formation: '4-3-3', slots,
    starters: xi.map(([shirt, name], i) => ({ slot: i + 1, shirt, name, captain: shirt === 10, role: slots[i]!.role })),
    bench: ([[12, 'Pat Reserve'], [14, 'Rui Bench'], [16, 'Dan Sub'], [18, 'Eli Spare'], [21, 'Noa Extra']] as [number, string][]).map(([shirt, name]) => ({ slot: null, shirt, name, captain: false, role: '' })),
  };
}

/** Games with a lineup on the board (starters chosen), newest kick-off first: the ones a poster can be made for. */
export async function posterGames(db: SupabaseClient) {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data } = await db.from('matches').select('id, opponent, kickoff_at, home_away, team_seasons!inner(teams!inner(name)), match_squad!inner(status)')
    .eq('match_squad.status', 'starter').gte('kickoff_at', since).neq('status', 'cancelled').order('kickoff_at').limit(30);
  const seen = new Set<string>();
  return ((data ?? []) as unknown as { id: string; opponent: string; kickoff_at: string; home_away: string; team_seasons: { teams: { name: string } } }[])
    .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
    .map((m) => ({ id: m.id, opponent: m.opponent, kickoff: m.kickoff_at, homeAway: m.home_away, team: m.team_seasons.teams.name }));
}

export async function loadPoster(db: SupabaseClient, matchId: string): Promise<PosterData | null> {
  const { data: m } = await db.from('matches')
    .select('id, opponent, kickoff_at, home_away, division, event_type, formation, team_seasons!inner(teams!inner(name)), locations(name, city)').eq('id', matchId).maybeSingle();
  if (!m) return null;
  const [{ data: squad }, { data: f }] = await Promise.all([
    db.from('match_squad').select('player_id, slot, status, shirt_number, captain, players!inner(first_name, last_name, show_publicly)').eq('match_id', matchId).in('status', ['starter', 'substitute']),
    m.formation ? db.from('formations').select('slots').eq('code', m.formation).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // a squad without its own shirt numbers uses the players' team numbers
  const { data: numbers } = await db.from('team_players').select('player_id, jersey_number').eq('team_season_id', (await db.from('matches').select('team_season_id').eq('id', matchId).single()).data?.team_season_id ?? '');
  const teamNumber = new Map(((numbers ?? []) as { player_id: string; jersey_number: number | null }[]).map((n) => [n.player_id, n.jersey_number]));
  const slots = ((f as { slots: PosterSlot[] } | null)?.slots ?? []) as PosterSlot[];
  const roleOf = new Map(slots.map((s) => [s.slot, s.role]));
  const rows = ((squad ?? []) as unknown as { player_id: string; slot: number | null; status: string; shirt_number: number | null; captain: boolean; players: { first_name: string; last_name: string; show_publicly: boolean } }[]);
  const toPlayer = (r: (typeof rows)[number]): PosterPlayer => ({
    slot: r.slot, shirt: r.shirt_number ?? teamNumber.get(r.player_id) ?? null, captain: r.captain, role: (r.slot && roleOf.get(r.slot)) || '',
    name: r.players.show_publicly ? `${r.players.first_name} ${r.players.last_name}` : null,
  });
  const team = (m.team_seasons as unknown as { teams: { name: string } }).teams.name;
  const place = m.locations as unknown as { name: string; city: string | null } | null;
  return {
    team, opponent: m.opponent, homeAway: m.home_away as 'home' | 'away', kickoff: m.kickoff_at, venue: place?.name ?? null, city: place?.city ?? null,
    division: m.division, friendly: m.event_type === 'friendly', formation: m.formation, slots,
    starters: rows.filter((r) => r.status === 'starter').map(toPlayer),
    bench: rows.filter((r) => r.status === 'substitute').map(toPlayer).sort((a, b) => (a.shirt ?? 99) - (b.shirt ?? 99)),
  };
}
