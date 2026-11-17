/**
 * The sync run against the club database, shared by the website's nightly route (service role) and the member app's
 * "Update now" button (the signed-in admin: RLS admin_all lets admins write federation data and sync_runs).
 * Raw answers are not stored. Every run is recorded in sync_runs; error text never contains the API key.
 */
import { runSync, type Api, type Store, type SyncResult } from './sync.ts';

// Structural type for a supabase-js client, so this package needs no dependency on it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from(table: string): any };

const now = () => new Date().toISOString();
async function must(p: PromiseLike<{ error: { message: string } | null }>, what: string) { const { error } = await p; if (error) throw new Error(`${what}: ${error.message}`); }

export function supabaseStore(db: Db): Store {
  return {
    async upsertCompetitions(rows) {
      if (rows.length) await must(db.from('federation_competitions').upsert(rows.map((r) => ({ ...r, synced_at: now() })), { onConflict: 'external_id' }), 'competitions');
    },
    async upsertTeams(rows) {
      const unique = [...new Map(rows.map((r) => [r.external_id, r])).values()];
      if (unique.length) await must(db.from('federation_teams').upsert(unique.map((r) => ({ ...r, synced_at: now() })), { onConflict: 'external_id' }), 'teams');
    },
    async markClubTeams(ids) {
      if (ids.length) await must(db.from('federation_teams').update({ is_club: true }).in('external_id', ids), 'club teams');
    },
    async replaceStandings(key, rows) {
      await must(db.from('federation_standings').delete().eq('competition_external_id', key), 'standings (clear)');
      if (rows.length) await must(db.from('federation_standings').insert(rows.map((r) => ({ ...r, synced_at: now() }))), 'standings');
    },
    async upsertMatches(rows) {
      for (let i = 0; i < rows.length; i += 200) {
        await must(db.from('federation_matches').upsert(rows.slice(i, i + 200).map((r) => ({ ...r, synced_at: now() })), { onConflict: 'external_id' }), 'matches');
      }
    },
  };
}

export type SyncOutcome =
  | ({ ok: true } & SyncResult)
  | { ok: true; skipped: 'disabled' }
  | { ok: false; reason: 'settings_unreadable' | 'settings_missing' | 'no_team' | 'failed'; error: string };

/** Reads the settings, records the run in sync_runs and syncs. Never throws; the outcome says what happened. */
export async function syncFromSettings(db: Db, api: Api, apiKey: string): Promise<SyncOutcome> {
  const { data: setting, error: settingError } = await db.from('site_settings').select('value').eq('key', 'federation').maybeSingle();
  if (settingError) return { ok: false, reason: 'settings_unreadable', error: String(settingError.message).slice(0, 120) };
  if (!setting) return { ok: false, reason: 'settings_missing', error: 'no federation settings' };
  const cfg = (setting.value ?? {}) as { enabled?: boolean; team_ids?: unknown[] };
  if (!cfg.enabled) return { ok: true, skipped: 'disabled' };
  const teams = (cfg.team_ids ?? []).map(String);
  if (!teams.length) return { ok: false, reason: 'no_team', error: 'no team_ids in the federation settings' };

  const { data: run } = await db.from('sync_runs').insert({ kind: 'federation' }).select('id').single();
  const finish = (status: 'ok' | 'failed', rows: number, error: string | null) =>
    run ? db.from('sync_runs').update({ status, rows_upserted: rows, error, finished_at: now() }).eq('id', run.id) : Promise.resolve();
  try {
    const result = await runSync(api, supabaseStore(db), teams);
    await finish('ok', result.standings + result.matches + result.competitions, null);
    return { ok: true, ...result };
  } catch (e) {
    const message = (e instanceof Error ? e.message : 'Sync failed').split(apiKey || '\u0000').join('[key]').slice(0, 300);
    await finish('failed', 0, message);
    return { ok: false, reason: 'failed', error: message };
  }
}
