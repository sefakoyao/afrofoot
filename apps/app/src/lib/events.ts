/** Kinds of other events (migration 0034: club_events.kind). */
export const EVENT_KINDS = ['meeting', 'social', 'tournament', 'camp', 'other'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
