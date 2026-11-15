import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Player contracts (migration 0030). Contract text is English, like the club's paper contracts and Code of Ethics. */
export const CONTRACT_STATUSES = ['draft', 'sent', 'player_signed', 'active', 'declined', 'cancelled', 'terminated'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const LIVE: readonly ContractStatus[] = ['sent', 'player_signed', 'active'];

export interface Contract {
  id: string; player_id: string; team_season_id: string | null; title: string; years: number; starts_on: string; ends_on: string;
  body: string; body_sha256: string | null; status: ContractStatus; sent_at: string | null;
  player_signed_at: string | null; player_signed_name: string | null; club_signed_at: string | null; club_signed_name: string | null;
  declined_at: string | null; decline_reason: string | null; cancelled_at: string | null; terminated_on: string | null; termination_reason: string | null;
  created_at: string;
}
export const CONTRACT_COLUMNS = 'id, player_id, team_season_id, title, years, starts_on, ends_on, body, body_sha256, status, sent_at, player_signed_at, player_signed_name, club_signed_at, club_signed_name, declined_at, decline_reason, cancelled_at, terminated_on, termination_reason, created_at';

export const STATUS_BADGE: Record<ContractStatus | 'expired', string> = {
  draft: 'bg-line text-fg', sent: 'bg-ink-950 text-white', player_signed: 'bg-danger text-white', active: 'bg-accent/20 text-pitch',
  declined: 'bg-danger/15 text-danger', cancelled: 'bg-line text-muted', terminated: 'bg-line text-muted', expired: 'bg-line text-muted',
};

/** An active contract past its end date is shown as expired (nothing to store: the dates say it). */
export const shownStatus = (c: Pick<Contract, 'status' | 'ends_on'>, today: string): ContractStatus | 'expired' =>
  c.status === 'active' && c.ends_on < today ? 'expired' : c.status;

/** Default end of the term: 31 October (end of the Finnish season) of the last season covered. */
export function defaultEnd(startsOn: string, years: number): string {
  const y = Number(startsOn.slice(0, 4));
  const firstSeasonEnd = startsOn.slice(5) <= '10-31' ? y : y + 1;
  return `${firstSeasonEnd + years - 1}-10-31`;
}

/** Latest allowed end for the chosen number of years (database check: ends_on <= starts_on + years). */
export function maxEnd(startsOn: string, years: number): string {
  return `${Number(startsOn.slice(0, 4)) + years}${startsOn.slice(4)}`;
}

const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Fills the {{…}} fields of the template. [[…]] blanks stay for the admin to complete before sending. */
export function fillTemplate(body: string, v: { club: string; team: string; player: string; starts: string; ends: string; years: number }): string {
  const values: Record<string, string> = {
    club: v.club, team: v.team || 'the team', player: v.player, starts: longDate(v.starts), ends: longDate(v.ends),
    years: String(v.years), years_text: v.years === 1 ? 'one year' : v.years === 2 ? 'two years' : 'three years',
  };
  return body.replace(/\{\{(\w+)\}\}/g, (m, k: string) => values[k] ?? m);
}

export const hasBlanks = (body: string) => body.includes('[[');

/** The signed-in player's contracts (RLS: their own, never drafts), newest first. */
export async function myContracts(db: SupabaseClient): Promise<Contract[]> {
  const { data } = await db.from('player_contracts').select(CONTRACT_COLUMNS).order('starts_on', { ascending: false });
  return (data as Contract[] | null) ?? [];
}

export { longDate };
