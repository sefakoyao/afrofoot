import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TorneopalClient, runSync, type Store } from '@afrofoot/federation';

/**
 * League tables and results from the Palloliitto results service (migration 0040). Called by Vercel Cron (vercel.json)
 * with `Authorization: Bearer <CRON_SECRET>`; nothing else can start it. Server-only secrets: TORNEOPAL_API_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET. Every run is recorded in sync_runs; errors never contain a key.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? '';
  const got = req.headers.get('authorization') ?? '';
  const want = `Bearer ${secret}`;
  return secret.length >= 16 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** Writes through the service role (RLS: only admins and the service role write federation data). Raw answers are not kept. */
function supabaseStore(db: SupabaseClient): Store {
  const now = () => new Date().toISOString();
  const must = async (p: PromiseLike<{ error: { message: string } | null }>, what: string) => { const { error } = await p; if (error) throw new Error(`${what}: ${error.message}`); };
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

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return NextResponse.json({ ok: false, error: 'database not configured' }, { status: 503 });
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: setting } = await db.from('site_settings').select('value').eq('key', 'federation').maybeSingle();
  const cfg = (setting?.value ?? {}) as { enabled?: boolean; team_ids?: unknown[] };
  if (!cfg.enabled) return NextResponse.json({ ok: true, skipped: 'disabled' });

  const { data: run } = await db.from('sync_runs').insert({ kind: 'federation' }).select('id').single();
  const finish = (status: 'ok' | 'failed', rows: number, error: string | null) =>
    run ? db.from('sync_runs').update({ status, rows_upserted: rows, error, finished_at: new Date().toISOString() }).eq('id', run.id) : Promise.resolve();
  try {
    const api = TorneopalClient.fromEnv(process.env);
    const result = await runSync(api, supabaseStore(db), (cfg.team_ids ?? []).map(String));
    await finish('ok', result.standings + result.matches + result.competitions, null);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // FederationError messages never contain the key; other messages are cut short and stripped of it just in case.
    const key = process.env.TORNEOPAL_API_KEY ?? '';
    const message = (e instanceof Error ? e.message : 'Sync failed').split(key || '\u0000').join('[key]').slice(0, 300);
    await finish('failed', 0, message);
    console.error('[federation-sync] failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
