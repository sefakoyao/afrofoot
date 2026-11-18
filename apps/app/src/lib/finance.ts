import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CURRENCY, LOCALE_LABELS, isLocale } from '@afrofoot/i18n';

/** Admin → Finance (migration 0054): cost categories, seasons, money formatting. */
export const COST_CATEGORIES = ['team_fees', 'field_booking', 'kits', 'league_fees', 'licences', 'other'] as const;
/** Rows of the "New balance invoices" form (migration 0055: up to 10 per call). */
export const BALANCE_ROWS = 6;

export type CostCategory = (typeof COST_CATEGORIES)[number];

export type Season = { id: string; name: string; starts_on: string; ends_on: string; is_current: boolean };

/** All seasons, newest first, and the one asked for in the address (else the current one, else the newest). */
export async function pickSeason(db: SupabaseClient, wanted: string): Promise<{ seasons: Season[]; season: Season | null }> {
  const { data } = await db.from('seasons').select('id, name, starts_on, ends_on, is_current').order('starts_on', { ascending: false });
  const seasons = (data ?? []) as Season[];
  return { seasons, season: seasons.find((s) => s.id === wanted) ?? seasons.find((s) => s.is_current) ?? seasons[0] ?? null };
}

export function moneyFormat(locale: string) {
  const f = new Intl.NumberFormat(isLocale(locale) ? LOCALE_LABELS[locale].intl : 'en-GB', { style: 'currency', currency: CURRENCY });
  return (cents: number) => f.format(cents / 100);
}

export type Projection = {
  season: { id: string; name: string; starts_on: string; ends_on: string };
  collected: number; outstanding: number; overdue: number; invoices: number; scheduled: number; scheduled_count: number;
  by_month: { month: string; collected: number; outstanding: number; scheduled: number }[];
};
