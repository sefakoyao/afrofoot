/**
 * Emergency contact relation (player_private.emergency_relation). The list stores a code ("mother"), shown in the reader's
 * language; "Other" stores what the player wrote. Values written before the list existed are shown as written.
 */
export const RELATIONS = ['mother', 'father', 'guardian', 'spouse', 'partner', 'sister', 'brother', 'daughter', 'son',
  'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'relative', 'friend'] as const;
export type Relation = (typeof RELATIONS)[number];
export const isRelation = (v: unknown): v is Relation => typeof v === 'string' && (RELATIONS as readonly string[]).includes(v);

/** Label for a stored value: translated for a code, as written otherwise. */
export const relationLabel = (t: (key: string) => string, value: string | null | undefined): string =>
  !value ? '' : isRelation(value) ? t(value) : value;
