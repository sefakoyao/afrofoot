export const ROLES = ['super_admin', 'club_admin', 'coach', 'player_coach', 'player'] as const;
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
  'players.viewTeam':    ['super_admin', 'club_admin', 'coach', 'player_coach'],
  'staff.manage':        ['super_admin', 'club_admin'],
  'teams.manage':        ['super_admin', 'club_admin'],
  'training.manage':     ['super_admin', 'club_admin', 'coach', 'player_coach'],
  'attendance.mark':     ['super_admin', 'club_admin', 'coach', 'player_coach'],
  'availability.reply':  ['player', 'player_coach'],
  'matches.manage':      ['super_admin', 'club_admin', 'coach', 'player_coach'],
  'squads.manage':       ['super_admin', 'club_admin', 'coach', 'player_coach'],
  'evaluations.write':   ['coach', 'player_coach'],
  'finance.manage':      ['super_admin', 'club_admin'],
  'finance.viewOwn':     ['player', 'player_coach'],
  'announcements.team':  ['super_admin', 'club_admin', 'coach', 'player_coach'],
  'announcements.all':   ['super_admin', 'club_admin'],
  'audit.view':          ['super_admin', 'club_admin'],
} as const satisfies Record<string, readonly Role[]>;
export type Capability = keyof typeof CAPABILITIES;
export const can = (role: Role | null | undefined, cap: Capability): boolean => !!role && (CAPABILITIES[cap] as readonly Role[]).includes(role);

export const HOME_BY_ROLE: Record<Role, string> = { super_admin: '/admin', club_admin: '/admin', coach: '/coach', player_coach: '/coach', player: '/me' };

/** Member-app areas and the roles allowed into each. Super and club administrators share /admin; finer rights come from CAPABILITIES and RLS. */
export const AREA_ROLES = {
  admin: ['super_admin', 'club_admin'],
  coach: ['coach', 'player_coach'],
  me: ['player', 'player_coach'],
} as const satisfies Record<string, readonly Role[]>;
export type Area = keyof typeof AREA_ROLES;
export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);
export const canEnter = (role: Role, area: Area): boolean => (AREA_ROLES[area] as readonly Role[]).includes(role);

export const ACCOUNT_STATUSES = ['pending', 'active', 'suspended'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export const ADMIN_ROLES: readonly Role[] = ['super_admin', 'club_admin'];
export const isAdminRole = (r: Role): boolean => ADMIN_ROLES.includes(r);

/** Player-coach (migration 0045): coaches a team and also plays, so both checks are true for that role. */
export const COACH_ROLES = ['coach', 'player_coach'] as const satisfies readonly Role[];
export const PLAYER_ROLES = ['player', 'player_coach'] as const satisfies readonly Role[];
export const isCoachRole = (r: Role | string | null | undefined): boolean => (COACH_ROLES as readonly string[]).includes(r ?? '');
export const isPlayerRole = (r: Role | string | null | undefined): boolean => (PLAYER_ROLES as readonly string[]).includes(r ?? '');

/**
 * Mirror of the database trigger app.guard_profiles (migration 0007), used only to decide which buttons to show.
 * Admins manage accounts; only a super admin touches administrator accounts or grants an admin role; nobody changes their own role
 * or status here (the database also keeps at least one active super admin).
 */
export function canManageMember(actor: { id: string; role: Role }, target: { id: string; role: Role }): boolean {
  if (actor.id === target.id || !isAdminRole(actor.role)) return false;
  return actor.role === 'super_admin' || !isAdminRole(target.role);
}
export const assignableRoles = (actorRole: Role): readonly Role[] =>
  actorRole === 'super_admin' ? ROLES : actorRole === 'club_admin' ? ROLES.filter((r) => !isAdminRole(r)) : [];
