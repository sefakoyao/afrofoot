export const ROLES = ['super_admin', 'club_admin', 'coach', 'player'] as const;
export type Role = (typeof ROLES)[number];

/**
 * UI-side mirror of the database policies. The DATABASE is the authority (RLS); this only decides what to show.
 * Keep in sync with supabase/migrations/*_rls.sql and docs/03-permissions.md.
 */
export const CAPABILITIES = {
  'site.edit':           ['super_admin', 'club_admin'],
  'users.manage':        ['super_admin', 'club_admin'],
  'admins.manage':       ['super_admin'],
  'players.manage':      ['super_admin', 'club_admin'],
  'players.viewTeam':    ['super_admin', 'club_admin', 'coach'],
  'staff.manage':        ['super_admin', 'club_admin'],
  'teams.manage':        ['super_admin', 'club_admin'],
  'training.manage':     ['super_admin', 'club_admin', 'coach'],
  'attendance.mark':     ['super_admin', 'club_admin', 'coach'],
  'availability.reply':  ['player'],
  'matches.manage':      ['super_admin', 'club_admin', 'coach'],
  'squads.manage':       ['super_admin', 'club_admin', 'coach'],
  'evaluations.write':   ['coach'],
  'finance.manage':      ['super_admin', 'club_admin'],
  'finance.viewOwn':     ['player'],
  'announcements.team':  ['super_admin', 'club_admin', 'coach'],
  'announcements.all':   ['super_admin', 'club_admin'],
  'audit.view':          ['super_admin', 'club_admin'],
} as const satisfies Record<string, readonly Role[]>;
export type Capability = keyof typeof CAPABILITIES;
export const can = (role: Role | null | undefined, cap: Capability): boolean => !!role && (CAPABILITIES[cap] as readonly Role[]).includes(role);

export const HOME_BY_ROLE: Record<Role, string> = { super_admin: '/admin', club_admin: '/admin', coach: '/coach', player: '/me' };
