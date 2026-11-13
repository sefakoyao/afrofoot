/**
 * Client for the Finnish FA results service (Torneopal "taso" REST API). SERVER-SIDE ONLY:
 * the key must never reach the browser (no NEXT_PUBLIC_ prefix, never bundled into client components).
 *
 * STATUS: transport only. Command names and response shapes are taken from third-party projects and are NOT yet
 * verified against the official help page / a real response. Run `pnpm --filter @afrofoot/federation probe` with the key
 * to capture real responses into ./fixtures, then the mappers (map.ts) are written and tested against them.
 */
export const DEFAULT_BASE_URL = 'https://spl.torneopal.net/taso/rest';

export class FederationError extends Error {
  constructor(message: string, readonly status?: number, readonly command?: string) { super(message); this.name = 'FederationError'; }
}
export type Params = Record<string, string | number | undefined | null>;
export interface ClientOptions { apiKey: string; baseUrl?: string; timeoutMs?: number; retries?: number; fetchImpl?: typeof fetch }

export class TorneopalClient {
  private readonly key: string; private readonly base: string; private readonly timeoutMs: number; private readonly retries: number; private readonly f: typeof fetch;
  constructor(o: ClientOptions) {
    if (!o.apiKey) throw new FederationError('TORNEOPAL_API_KEY is not configured');
    this.key = o.apiKey; this.base = (o.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeoutMs = o.timeoutMs ?? 10_000; this.retries = o.retries ?? 2; this.f = o.fetchImpl ?? fetch;
  }
  static fromEnv(env: Record<string, string | undefined>): TorneopalClient {
    return new TorneopalClient({ apiKey: env.TORNEOPAL_API_KEY ?? '', baseUrl: env.TORNEOPAL_BASE_URL });
  }
  /** Calls `{base}/{command}?...&api_key=...` and returns parsed JSON. Errors never contain the key. */
  async call<T = unknown>(command: string, params: Params = {}): Promise<T> {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(command)) throw new FederationError('Invalid command name', undefined, command);
    const url = new URL(`${this.base}/${command}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    url.searchParams.set('api_key', this.key);
    let last: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
      try {
        const res = await this.f(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
        if (res.status >= 500) { last = new FederationError(`Upstream error ${res.status}`, res.status, command); }
        else if (res.status === 401 || res.status === 403) throw new FederationError('API key rejected', res.status, command);
        else if (!res.ok) throw new FederationError(`Request failed (${res.status})`, res.status, command);
        else {
          const text = await res.text();
          try { return JSON.parse(text) as T; } catch { throw new FederationError('Response was not valid JSON', res.status, command); }
        }
      } catch (e) {
        if (e instanceof FederationError && (e.status === undefined || e.status < 500)) { if (e.status !== undefined || e.message.startsWith('Response')) throw e; }
        last = e instanceof FederationError ? e : new FederationError(e instanceof Error && e.name === 'AbortError' ? 'Request timed out' : 'Network error', undefined, command);
      } finally { clearTimeout(timer); }
      if (attempt < this.retries) await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
    }
    throw last instanceof FederationError ? last : new FederationError('Request failed', undefined, command);
  }
  // Convenience wrappers for commands seen in third-party code (unverified — see header).
  getDistricts() { return this.call('getDistricts'); }
  getClubs(p: Params) { return this.call('getClubs', p); }
  getVenues(p: Params) { return this.call('getVenues', p); }
  getMatches(p: Params) { return this.call('getMatches', p); }
  search(text: string) { return this.call('search', { text }); }
}
