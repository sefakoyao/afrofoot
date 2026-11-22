import 'server-only';

/**
 * Facebook Page and Instagram publishing through Meta's Graph API (content assistant step 2, migration 0071).
 * Server settings (Vercel, app project; never in the code or the database):
 *   META_PAGE_ID             the club's Facebook Page id
 *   META_PAGE_ACCESS_TOKEN   a token that does not expire: a system user's (Meta Business settings) or the Page's (RUNNING §3ab)
 *   META_IG_USER_ID          optional: the Instagram professional account id (otherwise read from the Page)
 *   META_GRAPH_VERSION       optional, default v23.0
 * The token is sent in the Authorization header and never logged or shown; error messages are Meta's text only.
 */
const read = (name: string) => { const v = process.env[name]; return v && v.trim() ? v.trim() : undefined; };
export function metaConfig() {
  return { pageId: read('META_PAGE_ID'), token: read('META_PAGE_ACCESS_TOKEN'), igUserId: read('META_IG_USER_ID') };
}
const base = () => `${(read('META_GRAPH_URL') ?? 'https://graph.facebook.com').replace(/\/+$/, '')}/${read('META_GRAPH_VERSION') ?? 'v23.0'}`;

export class MetaError extends Error {}

async function graph<T>(path: string, params: Record<string, string> = {}, method: 'GET' | 'POST' = 'GET', useToken?: string): Promise<T> {
  const token = useToken ?? metaConfig().token;
  if (!token) throw new MetaError('META_PAGE_ACCESS_TOKEN is not set');
  const qs = new URLSearchParams(params);
  const url = method === 'GET' ? `${base()}/${path}${qs.size ? `?${qs}` : ''}` : `${base()}/${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method, headers: { Authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: method === 'POST' ? qs : undefined, cache: 'no-store', signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new MetaError(`Could not reach Meta (${e instanceof Error ? e.name : 'network'})`);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
  if (!res.ok || json.error) throw new MetaError((json.error?.message ?? `HTTP ${res.status}`).slice(0, 400));
  return json;
}

type PageInfo = { name?: string; link?: string; instagram_business_account?: { id: string; username?: string } };
export type Connection = {
  facebook: { ok: boolean; name?: string; link?: string; error?: string };
  instagram: { ok: boolean; username?: string; error?: string };
};

/** For Admin → Website → Social media: which Page and Instagram account the key reaches, or why not. */
export async function checkConnection(): Promise<Connection> {
  const { pageId, token } = metaConfig();
  if (!pageId || !token) {
    const missing = [!pageId && 'META_PAGE_ID', !token && 'META_PAGE_ACCESS_TOKEN'].filter(Boolean).join(', ');
    return { facebook: { ok: false, error: `missing:${missing}` }, instagram: { ok: false, error: `missing:${missing}` } };
  }
  try {
    const p = await graph<PageInfo>(pageId, { fields: 'name,link,instagram_business_account{id,username}' });
    const ig = p.instagram_business_account;
    return {
      facebook: { ok: true, name: p.name, link: p.link },
      instagram: ig ? { ok: true, username: ig.username } : { ok: false, error: 'noInstagram' },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    return { facebook: { ok: false, error: msg }, instagram: { ok: false, error: msg } };
  }
}

export type Posted = { id: string; url: string | null };

/**
 * The Page's own token. META_PAGE_ACCESS_TOKEN may be a Page token or the token of a system user who manages the Page
 * (Meta Business settings, never expires); for the latter, Meta hands out the Page token on request.
 */
async function pageToken(): Promise<string | undefined> {
  const { pageId } = metaConfig();
  if (!pageId) return undefined;
  const r = await graph<{ access_token?: string }>(pageId, { fields: 'access_token' }).catch(() => ({ access_token: undefined }));
  return r.access_token || undefined;
}

/** A photo post on the club's Page: the club's picture with the caption (links in it are clickable). */
export async function postFacebook(caption: string, imageUrl: string): Promise<Posted> {
  const { pageId } = metaConfig();
  if (!pageId) throw new MetaError('META_PAGE_ID is not set');
  const r = await graph<{ id: string; post_id?: string }>(`${pageId}/photos`, { url: imageUrl, message: caption }, 'POST', await pageToken());
  const id = r.post_id ?? r.id;
  return { id, url: `https://www.facebook.com/${id}` };
}

async function igUser(): Promise<string> {
  const { pageId, igUserId } = metaConfig();
  if (igUserId) return igUserId;
  if (!pageId) throw new MetaError('META_PAGE_ID is not set');
  const p = await graph<PageInfo>(pageId, { fields: 'instagram_business_account' });
  if (!p.instagram_business_account?.id) throw new MetaError('No Instagram professional account is linked to the Facebook Page');
  return p.instagram_business_account.id;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** An Instagram post: Meta fetches the picture (JPEG), then it is published; returns the post's address. */
export async function postInstagram(caption: string, imageUrl: string): Promise<Posted> {
  const ig = await igUser();
  const { id: container } = await graph<{ id: string }>(`${ig}/media`, { image_url: imageUrl, caption }, 'POST');
  for (let i = 0; i < 10; i++) {
    const s = await graph<{ status_code?: string; status?: string }>(container, { fields: 'status_code,status' });
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new MetaError(`Instagram could not use the picture (${s.status ?? s.status_code})`);
    if (i === 9) throw new MetaError('Instagram took too long to read the picture');
    await wait(2000);
  }
  const { id } = await graph<{ id: string }>(`${ig}/media_publish`, { creation_id: container }, 'POST');
  const link = await graph<{ permalink?: string }>(id, { fields: 'permalink' }).catch(() => ({ permalink: undefined }));
  return { id, url: link.permalink ?? null };
}
