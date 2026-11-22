import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MetaError, metaConfig, postFacebook, postInstagram, type Posted } from './meta';

/**
 * Sends the queued social posts (social_posts, migrations 0064 and 0071) with the service role. A post is claimed in the
 * database first (status "posting"), so it is sent once even when two runs overlap; the result is written back:
 * posted (with its id and link) or failed (with Meta's reason). TikTok is not connected yet: its posts stay waiting.
 */
export const AUTO_PLATFORMS = ['facebook', 'instagram'] as const;
export type AutoPlatform = (typeof AUTO_PLATFORMS)[number];
type Row = { id: string; platform: string; caption: string };

export const appUrl = () => (process.env.APP_URL?.trim() || 'https://app.afrofoot.club').replace(/\/+$/, '');
/** The JPEG Meta downloads for a post (app/api/social/image/[id]). */
export const imageUrlFor = (id: string) => `${appUrl()}/api/social/image/${id}`;

/** The platforms an admin switched on (site setting "social_posting") that also have the Meta key. */
export async function switchedOn(db: SupabaseClient): Promise<AutoPlatform[]> {
  const { pageId, token } = metaConfig();
  if (!pageId || !token) return [];
  const { data } = await db.from('site_settings').select('value').eq('key', 'social_posting').maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;
  return AUTO_PLATFORMS.filter((p) => v[p] === true);
}

async function send(db: SupabaseClient, row: Row): Promise<boolean> {
  let r: Posted;
  try {
    if (row.platform === 'facebook') r = await postFacebook(row.caption, imageUrlFor(row.id));
    else if (row.platform === 'instagram') r = await postInstagram(row.caption, imageUrlFor(row.id));
    else throw new MetaError('This platform is not connected yet');
  } catch (e) {
    const error = (e instanceof MetaError ? e.message : 'Unexpected error while posting').slice(0, 500);
    console.error('[social] post failed', { id: row.id, platform: row.platform, error });
    await db.from('social_posts').update({ status: 'failed', error }).eq('id', row.id);
    return false;
  }
  await db.from('social_posts').update({ status: 'posted', external_id: r.id.slice(0, 200), external_url: r.url?.startsWith('https://') ? r.url : null, posted_at: new Date().toISOString(), error: null }).eq('id', row.id);
  return true;
}

/** The scheduled run: every due post of the switched-on platforms (a few per run). */
export async function publishDue(db: SupabaseClient, limit = 5): Promise<{ posted: number; failed: number; platforms: string[]; error?: string }> {
  const platforms = await switchedOn(db);
  if (!platforms.length) return { posted: 0, failed: 0, platforms };
  const { data, error } = await db.rpc('claim_social_posts', { p_platforms: platforms, p_limit: limit });
  if (error) { console.error('[social] claim refused', { code: error.code, message: error.message }); return { posted: 0, failed: 0, platforms, error: error.code ?? 'claim' }; }
  let posted = 0, failed = 0;
  for (const row of (data ?? []) as Row[]) (await send(db, row)) ? posted++ : failed++;
  return { posted, failed, platforms };
}

/** "Post now" for one post (the caller has checked that the person may publish). */
export async function publishOne(db: SupabaseClient, id: string): Promise<'posted' | 'failed' | 'busy'> {
  const { data, error } = await db.rpc('claim_social_post', { p_id: id });
  const row = ((data ?? []) as Row[])[0];
  if (error || !row) return 'busy';
  return (await send(db, row)) ? 'posted' : 'failed';
}
