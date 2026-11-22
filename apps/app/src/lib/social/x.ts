import 'server-only';
import { createHmac, randomBytes } from 'node:crypto';
import { SocialError, type Posted } from './errors';

/**
 * Posts on the club's X account through the X API v2 (migration 0071), signed with OAuth 1.0a (user context).
 * Server settings (Vercel, app project; never in the code or the database), from the club's app at developer.x.com
 * (app permissions "Read and write", keys generated after that; they do not expire):
 *   X_API_KEY, X_API_SECRET               the app's consumer keys
 *   X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET the club account's access token and secret
 */
const read = (name: string) => { const v = process.env[name]; return v && v.trim() ? v.trim() : undefined; };
const NAMES = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'] as const;
export const xMissing = () => NAMES.filter((n) => !read(n));
const base = () => (read('X_API_URL') ?? 'https://api.x.com').replace(/\/+$/, '');

// RFC 3986 percent-encoding, as OAuth 1.0a requires
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** The OAuth 1.0a Authorization header (HMAC-SHA1). A JSON or multipart body is not part of the signature. */
export function oauthHeader(method: string, url: string, consumerKey: string, consumerSecret: string, token: string, tokenSecret: string, nonce = randomBytes(16).toString('hex'), timestamp = String(Math.floor(Date.now() / 1000))): string {
  const u = new URL(url);
  const oauth: Record<string, string> = { oauth_consumer_key: consumerKey, oauth_nonce: nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: timestamp, oauth_token: token, oauth_version: '1.0' };
  const all = [...Object.entries(oauth), ...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)] as const).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1));
  const baseString = [method.toUpperCase(), enc(`${u.origin}${u.pathname}`), enc(all.map(([k, v]) => `${k}=${v}`).join('&'))].join('&');
  const signature = createHmac('sha1', `${enc(consumerSecret)}&${enc(tokenSecret)}`).update(baseString).digest('base64');
  return 'OAuth ' + Object.entries({ ...oauth, oauth_signature: signature }).map(([k, v]) => `${enc(k)}="${enc(v)}"`).join(', ');
}

async function x(path: string, init: { method?: string; json?: unknown; form?: FormData } = {}): Promise<Record<string, unknown>> {
  if (xMissing().length) throw new SocialError(`${xMissing().join(', ')} not set`);
  const url = `${base()}${path}`, method = init.method ?? 'GET';
  let res: Response;
  try {
    res = await fetch(url, {
      method, cache: 'no-store', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: oauthHeader(method, url, read('X_API_KEY')!, read('X_API_SECRET')!, read('X_ACCESS_TOKEN')!, read('X_ACCESS_TOKEN_SECRET')!), ...(init.json ? { 'Content-Type': 'application/json' } : {}) },
      body: init.json ? JSON.stringify(init.json) : init.form,
    });
  } catch (e) {
    throw new SocialError(`Could not reach X (${e instanceof Error ? e.name : 'network'})`);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { detail?: string; title?: string; errors?: { message?: string }[] };
  if (!res.ok) throw new SocialError(String(body.detail ?? body.errors?.[0]?.message ?? body.title ?? `HTTP ${res.status}`).slice(0, 400));
  return body;
}

/** For Admin → Website → Social media: the account the keys reach, or why not. */
export async function checkX(): Promise<{ ok: boolean; username?: string; error?: string }> {
  if (xMissing().length) return { ok: false, error: `missing:${xMissing().join(', ')}` };
  try {
    const r = await x('/2/users/me');
    return { ok: true, username: String((r.data as { username?: string } | undefined)?.username ?? '') };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error' };
  }
}

/** A post with the picture: upload it, then the text (at most 280 characters; X shortens the link). */
export async function postX(text: string, jpeg: Buffer): Promise<Posted> {
  const form = new FormData();
  form.append('media', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'afrofoot.jpg');
  form.append('media_category', 'tweet_image');
  const up = await x('/2/media/upload', { method: 'POST', form });
  const mediaId = (up.data as { id?: string } | undefined)?.id;
  if (!mediaId) throw new SocialError('X did not accept the picture');
  const r = await x('/2/tweets', { method: 'POST', json: { text, media: { media_ids: [mediaId] } } });
  const id = (r.data as { id?: string } | undefined)?.id;
  if (!id) throw new SocialError('X did not return the post');
  return { id, url: `https://x.com/i/web/status/${id}` };
}
