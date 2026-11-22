import 'server-only';
import { SocialError, type Posted } from './errors';

/**
 * Posts on the club's LinkedIn page (organization) through LinkedIn's Posts and Images APIs (migration 0071).
 * Server settings (Vercel, app project; never in the code or the database):
 *   LINKEDIN_ORGANIZATION_ID   the page's number (the digits in linkedin.com/company/<number>/admin)
 *   LINKEDIN_ACCESS_TOKEN      a member token with w_organization_social (and r_organization_social) from the club's
 *                              LinkedIn app; LinkedIn makes it expire after 60 days (RUNNING §3ab)
 *   LINKEDIN_TOKEN_EXPIRES     optional, YYYY-MM-DD: the page warns two weeks before
 *   LINKEDIN_VERSION           optional (YYYYMM); by default the version of two months ago, which LinkedIn still serves
 */
const read = (name: string) => { const v = process.env[name]; return v && v.trim() ? v.trim() : undefined; };
export const linkedinConfig = () => ({ org: read('LINKEDIN_ORGANIZATION_ID'), token: read('LINKEDIN_ACCESS_TOKEN'), expires: read('LINKEDIN_TOKEN_EXPIRES') });
const base = () => (read('LINKEDIN_API_URL') ?? 'https://api.linkedin.com').replace(/\/+$/, '');
function version(): string {
  const v = read('LINKEDIN_VERSION');
  if (v && /^\d{6}$/.test(v)) return v;
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 2);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function li(path: string, init: { method?: string; json?: unknown } = {}): Promise<{ res: Response; body: Record<string, unknown> }> {
  const { token } = linkedinConfig();
  if (!token) throw new SocialError('LINKEDIN_ACCESS_TOKEN is not set');
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      method: init.method ?? 'GET', cache: 'no-store', signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, 'LinkedIn-Version': version(), 'X-Restli-Protocol-Version': '2.0.0', ...(init.json ? { 'Content-Type': 'application/json' } : {}) },
      body: init.json ? JSON.stringify(init.json) : undefined,
    });
  } catch (e) {
    throw new SocialError(`Could not reach LinkedIn (${e instanceof Error ? e.name : 'network'})`);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = String(body.message ?? `HTTP ${res.status}`);
    throw new SocialError(res.status === 401 ? `The LinkedIn key has expired or is not valid: renew it (${msg})`.slice(0, 400) : msg.slice(0, 400));
  }
  return { res, body };
}

/** For Admin → Website → Social media: the page name the key reaches, or why not. */
export async function checkLinkedIn(): Promise<{ ok: boolean; name?: string; error?: string }> {
  const { org, token } = linkedinConfig();
  if (!org || !token) return { ok: false, error: `missing:${[!org && 'LINKEDIN_ORGANIZATION_ID', !token && 'LINKEDIN_ACCESS_TOKEN'].filter(Boolean).join(', ')}` };
  try {
    const { body } = await li(`/rest/organizations/${encodeURIComponent(org)}`);
    return { ok: true, name: String(body.localizedName ?? org) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error' };
  }
}

// LinkedIn's "little text": these characters must be escaped, or the post is refused or shown wrongly
const escapeLittle = (s: string) => s.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);

/** An image post on the page: upload the picture, then the post with the caption (links in it are clickable). */
export async function postLinkedIn(caption: string, jpeg: Buffer, alt: string): Promise<Posted> {
  const { org } = linkedinConfig();
  if (!org) throw new SocialError('LINKEDIN_ORGANIZATION_ID is not set');
  const owner = `urn:li:organization:${org}`;
  const { body: init } = await li('/rest/images?action=initializeUpload', { method: 'POST', json: { initializeUploadRequest: { owner } } });
  const value = init.value as { uploadUrl?: string; image?: string } | undefined;
  if (!value?.uploadUrl || !value.image) throw new SocialError('LinkedIn did not accept the picture');
  const up = await fetch(value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${linkedinConfig().token}`, 'Content-Type': 'image/jpeg' }, body: new Uint8Array(jpeg), signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!up?.ok) throw new SocialError(`LinkedIn could not store the picture (${up ? `HTTP ${up.status}` : 'network'})`);
  const { res } = await li('/rest/posts', {
    method: 'POST',
    json: {
      author: owner, commentary: escapeLittle(caption), visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: value.image, altText: alt.slice(0, 300) } }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
    },
  });
  const urn = res.headers.get('x-restli-id') ?? '';
  if (!urn) throw new SocialError('LinkedIn did not return the post');
  return { id: urn, url: `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}/` };
}
