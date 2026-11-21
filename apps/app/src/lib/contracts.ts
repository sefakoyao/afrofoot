import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { webUrl } from './env';

/** Player contracts (migration 0030). Contract text is English, like the club's paper contracts and Code of Ethics. */
export const CONTRACT_STATUSES = ['draft', 'sent', 'player_signed', 'active', 'declined', 'cancelled', 'terminated'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const LIVE: readonly ContractStatus[] = ['sent', 'player_signed', 'active'];

export interface Contract {
  id: string; player_id: string; team_season_id: string | null; title: string; years: number; starts_on: string; ends_on: string;
  body: string; body_sha256: string | null; status: ContractStatus; sent_at: string | null;
  player_signed_at: string | null; player_signed_name: string | null; club_signed_at: string | null; club_signed_name: string | null; club_signed_title?: string | null;
  declined_at: string | null; decline_reason: string | null; cancelled_at: string | null; terminated_on: string | null; termination_reason: string | null;
  created_at: string;
  // 0068: a player under 18 signs together with a parent or guardian
  is_minor?: boolean; guardian_name?: string | null; guardian_relation?: string | null; guardian_phone?: string | null; guardian_email?: string | null;
  guardian_signed_name?: string | null; guardian_signed_at?: string | null;
}
export const CONTRACT_COLUMNS = 'id, player_id, team_season_id, title, years, starts_on, ends_on, body, body_sha256, status, sent_at, player_signed_at, player_signed_name, club_signed_at, club_signed_name, club_signed_title, declined_at, decline_reason, cancelled_at, terminated_on, termination_reason, created_at, is_minor, guardian_name, guardian_relation, guardian_phone, guardian_email, guardian_signed_name, guardian_signed_at';

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

/** What the club fills in once (Admin → Contracts → automatic contracts; site_settings 'contracts', migration 0037). */
export type ContractSettings = {
  auto: 'send' | 'draft' | 'off'; years: 1 | 2 | 3;
  // 0038 amateur agreement: the membership fee line and what it includes / excludes (one item per line)
  team_fee: string; included: string; not_included: string;
  // 0052 who signs for the club (name and title), used when an admin countersigns
  signatory_name: string; signatory_title: string;
  // 0037 fields, still filled in for the earlier template "Player contract"
  club_fees: string; max_fee_per_year: string; volunteer_amount: string;
  /** The fee line made from the active membership plans (Admin → Invoices → Plans), used when team_fee is left empty. */
  plan_fee?: string;
};
export const CONTRACT_DEFAULTS: ContractSettings = {
  auto: 'send', years: 1, team_fee: '', signatory_name: '', signatory_title: '',
  included: 'League fee per player\nTraining and games\nTraining ground booking\nThe Afro Foot Club app\nPersonal development plan',
  not_included: 'Player insurance\nPlayer licence', club_fees: '', max_fee_per_year: '', volunteer_amount: '',
};

export type Plan = { amount_cents: number; period: string };
const PERIOD_ORDER = ['year', 'season', 'quarter', 'month'] as const;
const PERIOD_WORD: Record<string, string> = { year: 'per year', season: 'per season', quarter: 'per quarter', month: 'per month' };
const euros = (cents: number) => `EUR ${cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100)}`;

/**
 * The contract's membership fee line from the club's active plans, longest period first, e.g.
 * "EUR 240 per year (or EUR 60 per quarter, or EUR 20 per month), invoiced through the Afro Foot Club app". Empty without plans.
 */
export function feeLineFromPlans(plans: Plan[]): string {
  const rows = plans.filter((p) => p.amount_cents > 0 && p.period in PERIOD_WORD)
    .sort((a, b) => PERIOD_ORDER.indexOf(a.period as 'year') - PERIOD_ORDER.indexOf(b.period as 'year') || b.amount_cents - a.amount_cents);
  const seen = new Set<string>();
  const parts = rows.filter((r) => !seen.has(r.period) && seen.add(r.period)).map((r) => `${euros(r.amount_cents)} ${PERIOD_WORD[r.period]}`);
  if (!parts.length) return '';
  const [first, ...rest] = parts;
  return `${first}${rest.length ? ` (or ${rest.join(', or ')})` : ''}, invoiced through the Afro Foot Club app`;
}

export async function loadContractSettings(db: SupabaseClient): Promise<ContractSettings> {
  const [{ data }, { data: plans }] = await Promise.all([
    db.from('site_settings').select('value').eq('key', 'contracts').maybeSingle(),
    db.from('membership_plans').select('amount_cents, period').eq('active', true),
  ]);
  const v = (data?.value ?? {}) as Partial<Record<keyof ContractSettings, unknown>>;
  const str = (k: keyof ContractSettings) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
  const years = Number(v.years);
  return {
    auto: v.auto === 'draft' || v.auto === 'off' ? v.auto : 'send',
    years: years === 2 || years === 3 ? years : 1,
    team_fee: str('team_fee'), included: typeof v.included === 'string' ? str('included') : CONTRACT_DEFAULTS.included,
    not_included: typeof v.not_included === 'string' ? str('not_included') : CONTRACT_DEFAULTS.not_included,
    signatory_name: str('signatory_name'), signatory_title: str('signatory_title'),
    club_fees: str('club_fees'), max_fee_per_year: str('max_fee_per_year'), volunteer_amount: str('volunteer_amount'),
    plan_fee: feeLineFromPlans((plans ?? []) as Plan[]),
  };
}

/** What a field becomes when its value is missing: a [[…]] blank the admin must complete before sending (as before 0037). */
const BLANKS: Record<string, string> = {
  season_objectives: "[[Describe the team's league and season, e.g. the series the team plays in and the objective for the season.]]",
  club_fees: '[[Fee paid by the club, e.g. playing licence, EUR amount]]',
  max_fee_per_year: '[[maximum per year]]',
  volunteer_amount: '[[amount]]',
  team_fee: '[[Membership fee for the season, e.g. EUR 300 per season, invoiced through the app]]',
  included_list: '[[What the membership fee includes, one item per line]]',
  not_included_list: '[[What the membership fee does not include, one item per line]]',
};

/** "One item per line" → "- item" lines, which the contract view shows as a bulleted list. */
const bullets = (text?: string) => (text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => `- ${l}`).join('\n');

export type TemplateValues = {
  club: string; team: string; player: string; starts: string; ends: string; years: number;
  season?: string; division?: string | null; objectives?: string | null; settings?: Partial<ContractSettings>;
};

/**
 * Fills the {{…}} fields of the template: club, team, player, dates, and (0037) the team's season objectives and the club's
 * fee lines. A field without a value stays a [[…]] blank, so such a contract cannot be sent until it is completed.
 */
export function fillTemplate(body: string, v: TemplateValues): string {
  const team = v.team || 'the team';
  const objectives = v.objectives?.trim() || '';
  const values: Record<string, string> = {
    club: v.club, team, player: v.player, starts: longDate(v.starts), ends: longDate(v.ends),
    years: String(v.years), years_text: v.years === 1 ? 'one year' : v.years === 2 ? 'two years' : 'three years',
    season: v.season ?? '', division: v.division ?? '',
    season_objectives: objectives, club_fees: v.settings?.club_fees?.trim() ?? '',
    max_fee_per_year: v.settings?.max_fee_per_year?.trim() ?? '', volunteer_amount: v.settings?.volunteer_amount?.trim() ?? '',
    team_fee: v.settings?.team_fee?.trim() || v.settings?.plan_fee?.trim() || '', included_list: bullets(v.settings?.included), not_included_list: bullets(v.settings?.not_included),
    prices_link: `${webUrl()}/membership#fees`,
  };
  return body.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (values[k] ? values[k]! : BLANKS[k] ?? (k in values ? '' : m)));
}

export const hasBlanks = (body: string) => body.includes('[[');

/** Where an admin fills in each kind of blank: the team's page (season objectives) or Admin → Contracts (fee lines). */
export type BlankFix = 'objectives' | 'fees' | 'text';
const FIX_OF: Record<string, BlankFix> = {
  season_objectives: 'objectives', team_fee: 'fees', included_list: 'fees', not_included_list: 'fees', club_fees: 'fees', max_fee_per_year: 'fees', volunteer_amount: 'fees',
};
/** The [[…]] blanks still in a contract text, each with where it is fixed (a blank typed by hand is fixed in the text). */
export function blanksIn(body: string): { text: string; fix: BlankFix }[] {
  const known = new Map(Object.entries(BLANKS).map(([k, v]) => [v, FIX_OF[k] ?? 'text']));
  const out = new Map<string, BlankFix>();
  for (const m of body.matchAll(/\[\[([\s\S]*?)\]\]/g)) out.set(m[1]!.trim(), known.get(m[0]) ?? 'text');
  return [...out].map(([text, fix]) => ({ text, fix }));
}

/** The signed-in player's contracts (RLS: their own, never drafts), newest first. */
export async function myContracts(db: SupabaseClient): Promise<Contract[]> {
  const { data } = await db.from('player_contracts').select(CONTRACT_COLUMNS).order('starts_on', { ascending: false });
  return (data as Contract[] | null) ?? [];
}

export { longDate };
