import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultEnd, defaultStart, fillTemplate, hasBlanks, loadContractSettings, type ContractSettings } from './contracts';
import { loadBilling } from './invoice/data';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Helsinki' });

/** Team, season and objectives used in a contract for one team season. */
async function teamFacts(db: SupabaseClient, teamSeasonId: string) {
  const first = await db.from('team_seasons').select('division, objectives, teams!inner(name), seasons!inner(name, starts_on, ends_on)').eq('id', teamSeasonId).maybeSingle();
  // before migration 0037 there is no objectives column: read the team without it (the contract then keeps the blank)
  const data = (first.error
    ? (await db.from('team_seasons').select('division, teams!inner(name), seasons!inner(name, starts_on, ends_on)').eq('id', teamSeasonId).maybeSingle()).data
    : first.data) as { division: string | null; objectives?: string | null; teams: unknown; seasons: unknown } | null;
  if (!data) return null;
  const t = data.teams as unknown as { name: string }, s = data.seasons as unknown as { name: string; starts_on: string; ends_on: string };
  return { team: t.name, season: s.name, seasonStarts: s.starts_on, seasonEnds: s.ends_on, division: data.division as string | null, objectives: data.objectives ?? null };
}

/**
 * Builds a contract (title, dates, text) for a player in a team season from the default template. Used by the manual
 * "New contract" form and by the automatic contracts below.
 */
export async function buildContract(db: SupabaseClient, input: { playerId: string; teamSeasonId: string | null; years: number; startsOn: string; endsOn?: string; settings?: ContractSettings }) {
  const [{ data: player }, { data: tpl }, facts, billing, settings] = await Promise.all([
    db.from('players').select('first_name, last_name').eq('id', input.playerId).maybeSingle(),
    db.from('contract_templates').select('body').eq('is_default', true).maybeSingle(),
    input.teamSeasonId ? teamFacts(db, input.teamSeasonId) : Promise.resolve(null),
    loadBilling(db),
    input.settings ? Promise.resolve(input.settings) : loadContractSettings(db),
  ]);
  if (!player || !tpl) return null;
  const ends = input.endsOn || defaultEnd(input.startsOn, input.years);
  const startYear = input.startsOn.slice(0, 4), endYear = ends.slice(0, 4);
  const body = fillTemplate(tpl.body, {
    club: billing.legal_name || 'the club', team: facts?.team ?? '', player: `${player.first_name} ${player.last_name}`,
    starts: input.startsOn, ends, years: input.years, season: facts?.season, division: facts?.division, objectives: facts?.objectives, settings,
  });
  return { player_id: input.playerId, team_season_id: input.teamSeasonId, years: input.years, starts_on: input.startsOn, ends_on: ends, body,
    title: `Player contract ${startYear === endYear ? startYear : `${startYear}–${endYear}`}` };
}

export type AutoResult = { sent: number; drafts: number; existing: number };

/**
 * When players join a team (approve with a group, bulk "add to a team", the team page picker): a contract for each player
 * who has none for this period yet, from the default template with the team's season and objectives and the club's fee
 * lines filled in. With "create and send" (the default) it is sent to the player at once, unless blanks remain or the
 * player has no app account to sign with; those stay drafts for an admin. Runs as the signed-in admin (RLS admin_all; the
 * database still checks the status flow and one live contract per period).
 */
export async function autoContracts(db: SupabaseClient, teamSeasonId: string, playerIds: string[]): Promise<AutoResult> {
  const result: AutoResult = { sent: 0, drafts: 0, existing: 0 };
  const ids = [...new Set(playerIds)];
  if (!ids.length) return result;
  const settings = await loadContractSettings(db);
  if (settings.auto === 'off') return result;
  const facts = await teamFacts(db, teamSeasonId);
  if (!facts) return result;
  const start = defaultStart(today());   // the contract year: 1 December – 30 November
  const [{ data: current }, { data: accounts }] = await Promise.all([
    db.from('player_contracts').select('player_id').in('player_id', ids).in('status', ['draft', 'sent', 'player_signed', 'active']).gte('ends_on', start),
    db.from('players').select('id, profile_id').in('id', ids),
  ]);
  const covered = new Set((current ?? []).map((c) => c.player_id));
  const canSign = new Set((accounts ?? []).filter((a) => a.profile_id).map((a) => a.id));
  for (const id of ids) {
    if (covered.has(id)) { result.existing++; continue; }
    const row = await buildContract(db, { playerId: id, teamSeasonId, years: settings.years, startsOn: start, settings });
    if (!row) continue;
    const { data, error } = await db.from('player_contracts').insert(row).select('id').single();
    if (error || !data) { console.error('[contracts] automatic draft refused', { code: error?.code, message: error?.message }); continue; }
    if (settings.auto === 'send' && !hasBlanks(row.body) && canSign.has(id)) {
      const { error: sendError } = await db.from('player_contracts').update({ status: 'sent' }).eq('id', data.id).eq('status', 'draft');
      if (!sendError) { result.sent++; continue; }
      console.error('[contracts] automatic send refused', { code: sendError.code, message: sendError.message });
    }
    result.drafts++;
  }
  return result;
}

/** Query parameters for the result banner: cs = sent, cd = drafts left for an admin. */
export const autoParams = (r: AutoResult): Record<string, number> => ({ ...(r.sent ? { cs: r.sent } : {}), ...(r.drafts ? { cd: r.drafts } : {}) });
