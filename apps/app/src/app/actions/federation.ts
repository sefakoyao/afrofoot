'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { TorneopalClient, syncFromSettings } from '@afrofoot/federation';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Admin → "Update the league table now": the Palloliitto sync (migration 0040) run as the signed-in admin, whose rights
 * (RLS admin_all) already allow writing league data. Needs only TORNEOPAL_API_KEY in this app's environment: no service
 * key and no cron secret. The website shows the new table within a minute. Results: ?result=<key under fed.*>#league.
 */
export async function syncLeagueNow(): Promise<void> {
  await requireArea('admin');
  const back = (r: string): never => redirect(`/admin?result=${r}#league`);
  const key = process.env.TORNEOPAL_API_KEY?.trim();
  if (!key) return back('r_noKey');
  const supabase = await getSupabase();
  if (!supabase) return back('r_error');
  const out = await syncFromSettings(supabase, TorneopalClient.fromEnv({ ...process.env, TORNEOPAL_API_KEY: key }), key);
  if (!out.ok) {
    console.error('[federation] admin sync failed:', out.reason, out.error);
    back(out.reason === 'failed' && /refused/.test(out.error) ? 'r_refused' : out.reason === 'failed' ? 'r_failed' : 'r_settings');
  }
  revalidatePath('/admin');
  back('skipped' in out ? 'r_disabled' : 'r_synced');
}

/**
 * Link a Palloliitto player to the club's player in the app, or remove the link (player_id ''). Admins only (RLS
 * admin_all on federation_players); one Palloliitto player per app player (unique index, migration 0041).
 */
export async function linkFederationPlayer(fd: FormData): Promise<void> {
  await requireArea('admin');
  const back = (r: string, id?: string): never => redirect(`/admin/palloliitto?result=${r}${id ? `&player=${encodeURIComponent(id)}` : ''}`);
  const external = String(fd.get('external_id') ?? '');
  const playerId = String(fd.get('player_id') ?? '');
  if (!/^\d{1,12}$/.test(external) || (playerId && !/^[0-9a-f-]{36}$/.test(playerId))) return back('r_invalid');
  const supabase = await getSupabase();
  if (!supabase) return back('r_error');
  const { data, error } = await supabase.from('federation_players').update({ player_id: playerId || null }).eq('external_id', external).select('external_id');
  if (error?.code === '23505') return back('r_taken', external);
  if (error || !data?.length) { if (error) console.error('[federation] link refused', { code: error.code, message: error.message }); return back('r_invalid', external); }
  revalidatePath('/admin/palloliitto');
  back('r_linked', external);
}
