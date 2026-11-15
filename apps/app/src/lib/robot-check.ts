import 'server-only';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Football robot check for the sign-up forms: "Tap the whistle" among six football things in a random order.
 * The challenge travels in a token signed with SIGNUP_CHECK_SECRET (server-only environment variable), so the server
 * needs no storage; the token also carries when it was made, so answers that come too fast (scripts) or too late are
 * refused. Together with a hidden "honeypot" field and Supabase Auth's own rate limits this stops automated sign-ups.
 */
export const ITEMS = ['ball', 'boot', 'whistle', 'goal', 'cone', 'shirt', 'trophy', 'flag', 'gloves'] as const;
export type Item = (typeof ITEMS)[number];
export type Challenge = { token: string; target: Item; options: Item[] };

const MIN_MS = 1500, MAX_MS = 20 * 60 * 1000;

function secret(): string | null {
  const s = process.env.SIGNUP_CHECK_SECRET;
  if (s && s.length >= 16) return s;
  return process.env.NODE_ENV === 'development' ? 'development-only-signup-check-secret' : null;
}
const sign = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url');

/** Null when the secret is not set: sign-up is then closed (the page says so) rather than unprotected. */
export function newChallenge(now = Date.now()): Challenge | null {
  const key = secret();
  if (!key) return null;
  const pool = [...ITEMS];
  for (let i = pool.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  const options = pool.slice(0, 6);
  const target = options[randomInt(6)]!;
  const payload = Buffer.from(JSON.stringify({ t: target, o: options, at: now, n: randomBytes(8).toString('base64url') })).toString('base64url');
  return { token: `${payload}.${sign(payload, key)}`, target, options };
}

export type CheckResult = 'ok' | 'wrong' | 'tooFast' | 'expired' | 'invalid';

/** Verifies the signed challenge and the item chosen. */
export function checkAnswer(token: unknown, answer: unknown, now = Date.now()): CheckResult {
  const key = secret();
  if (!key || typeof token !== 'string' || token.length > 600) return 'invalid';
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return 'invalid';
  const want = Buffer.from(sign(payload, key)), got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return 'invalid';
  let data: { t?: string; at?: number };
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return 'invalid'; }
  if (typeof data.at !== 'number' || typeof data.t !== 'string') return 'invalid';
  const age = now - data.at;
  if (age < MIN_MS) return 'tooFast';
  if (age > MAX_MS) return 'expired';
  return answer === data.t ? 'ok' : 'wrong';
}

/** True when the hidden field a person never sees was filled in (a form-filling robot). */
export const honeypotFilled = (fd: FormData): boolean => String(fd.get('website') ?? '').trim() !== '';
