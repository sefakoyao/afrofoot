/**
 * Match day helpers shared by the coach pages, the player calendar and client components (no server-only imports).
 * Lineup styles set a formation and team instructions; coaches can adjust each instruction afterwards (migration 0031).
 */
export const STYLES = ['balanced', 'defensive', 'midfield', 'high_press', 'counter', 'wing_play'] as const;
export type Style = (typeof STYLES)[number];
export const LINES = ['low', 'mid', 'high'] as const;
export const PRESSING = ['low', 'medium', 'high'] as const;
export const WIDTHS = ['narrow', 'balanced', 'wide'] as const;
export const TEMPOS = ['slow', 'balanced', 'fast'] as const;

export interface StylePreset { formation: string; line: (typeof LINES)[number]; press: (typeof PRESSING)[number]; width: (typeof WIDTHS)[number]; tempo: (typeof TEMPOS)[number] }
export const PRESETS: Record<Style, StylePreset> = {
  balanced: { formation: '4-4-2', line: 'mid', press: 'medium', width: 'balanced', tempo: 'balanced' },
  defensive: { formation: '5-3-2', line: 'low', press: 'low', width: 'narrow', tempo: 'slow' },
  midfield: { formation: '4-1-4-1', line: 'mid', press: 'medium', width: 'balanced', tempo: 'slow' },
  high_press: { formation: '4-3-3', line: 'high', press: 'high', width: 'wide', tempo: 'fast' },
  counter: { formation: '4-5-1', line: 'low', press: 'medium', width: 'narrow', tempo: 'fast' },
  wing_play: { formation: '3-4-3', line: 'mid', press: 'medium', width: 'wide', tempo: 'fast' },
};

/** Standard pre-game protocol, minutes before kick-off: meeting, warm-up, strategy briefing. */
export const PROTOCOL_DEFAULTS = { meet: 90, warmup: 60, briefing: 20 } as const;

export type Role = 'GK' | 'DF' | 'MF' | 'FW';
export const ROLE_OF: Record<string, Role> = { goalkeeper: 'GK', defender: 'DF', midfielder: 'MF', forward: 'FW' };
export interface Slot { slot: number; role: Role; x: number; y: number }

export type LiveState = 'not_started' | 'first_half' | 'half_time' | 'second_half' | 'full_time';
export interface PhaseTimes { kickoff?: string | null; secondHalf?: string | null }

/** Match clock from the time the half was started in the app: "23'", "45+2'", "HT", "FT". */
export function matchMinute(state: LiveState, t: PhaseTimes, now = Date.now()): { minute: number; added: number; label: string } {
  const since = (iso?: string | null) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 60000)) + 1 : 1);
  if (state === 'first_half') { const m = since(t.kickoff); return m > 45 ? { minute: 45, added: Math.min(20, m - 45), label: `45+${m - 45}'` } : { minute: m, added: 0, label: `${m}'` }; }
  if (state === 'second_half') { const m = 45 + since(t.secondHalf); return m > 90 ? { minute: 90, added: Math.min(20, m - 90), label: `90+${m - 90}'` } : { minute: m, added: 0, label: `${m}'` }; }
  if (state === 'half_time') return { minute: 45, added: 0, label: 'HT' };
  if (state === 'full_time') return { minute: 90, added: 0, label: 'FT' };
  return { minute: 0, added: 0, label: '' };
}

/** The next phase button the live console offers, in order. */
export const NEXT_PHASE: Record<LiveState, 'kickoff' | 'half_time' | 'second_half' | 'full_time' | null> = {
  not_started: 'kickoff', first_half: 'half_time', half_time: 'second_half', second_half: 'full_time', full_time: null,
};

export interface EventRow {
  id: string; type: string; side: 'us' | 'opponent'; minute: number; added_minute: number; player_id: string | null; assist_player_id: string | null;
  player_out_id: string | null; opponent_label: string | null; note: string | null; voided: boolean; created_at: string;
}

/** Who is on the pitch now: starters, plus substitutes who came on, minus players taken off or sent off. */
export function onPitch(starters: string[], events: EventRow[]): Set<string> {
  const set = new Set(starters);
  for (const e of [...events].filter((x) => !x.voided).sort((a, b) => a.minute - b.minute || a.added_minute - b.added_minute || a.created_at.localeCompare(b.created_at))) {
    if (e.side !== 'us') continue;
    if (e.type === 'substitution') { if (e.player_out_id) set.delete(e.player_out_id); if (e.player_id) set.add(e.player_id); }
    if ((e.type === 'red_card' || e.type === 'second_yellow') && e.player_id) set.delete(e.player_id);
  }
  return set;
}
