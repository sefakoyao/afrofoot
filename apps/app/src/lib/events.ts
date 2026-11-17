/** Kinds of other events (migration 0034: club_events.kind). */
export const EVENT_KINDS = ['meeting', 'social', 'tournament', 'camp', 'other'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Trainings and games an admin can add from Admin → Events (saved as training_sessions / matches, like the coaches' own). */
export const SPORT_KINDS = ['training', 'game', 'friendly'] as const;
export type SportKind = (typeof SPORT_KINDS)[number];
