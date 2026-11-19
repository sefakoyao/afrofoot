import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Football robot check shared by the member app (sign-up) and the website (contact and sponsor forms):
 * "Tap the whistle" among six football things in a random order. The challenge travels in a token signed with a
 * server-only secret, so no storage is needed; it carries when it was made (answers too fast or too late are refused)
 * and a one-time nonce the caller can store to refuse the same solved challenge twice. Server only.
 */
export const ROBOT_ITEMS = ['ball', 'boot', 'whistle', 'goal', 'cone', 'shirt', 'trophy', 'flag', 'gloves'] as const;
export type RobotItem = (typeof ROBOT_ITEMS)[number];
export type RobotChallenge = { token: string; target: RobotItem; options: RobotItem[] };
export type RobotResult = 'ok' | 'wrong' | 'tooFast' | 'expired' | 'invalid';

const MIN_MS = 1500, MAX_MS = 20 * 60 * 1000;
const sign = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url');

/** The secret from the environment (at least 16 characters); a fixed one only in development; else null (check closed). */
export function robotSecret(...envValues: (string | undefined)[]): string | null {
  const s = envValues.find((v) => v && v.length >= 16);
  if (s) return s;
  return process.env.NODE_ENV === 'development' ? 'development-only-signup-check-secret' : null;
}

export function newRobotChallenge(key: string | null, now = Date.now()): RobotChallenge | null {
  if (!key) return null;
  const pool = [...ROBOT_ITEMS];
  for (let i = pool.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
  const options = pool.slice(0, 6);
  const target = options[randomInt(6)]!;
  const payload = Buffer.from(JSON.stringify({ t: target, o: options, at: now, n: randomBytes(12).toString('base64url') })).toString('base64url');
  return { token: `${payload}.${sign(payload, key)}`, target, options };
}

/** Verifies the signed challenge and the item chosen; `nonce` identifies the challenge (for one-time use). */
export function verifyRobotAnswer(key: string | null, token: unknown, answer: unknown, now = Date.now()): { result: RobotResult; nonce: string | null } {
  const invalid = { result: 'invalid' as const, nonce: null };
  if (!key || typeof token !== 'string' || token.length > 600) return invalid;
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return invalid;
  const want = Buffer.from(sign(payload, key)), got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return invalid;
  let data: { t?: string; at?: number; n?: string };
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return invalid; }
  if (typeof data.at !== 'number' || typeof data.t !== 'string') return invalid;
  const nonce = typeof data.n === 'string' ? data.n.slice(0, 40) : null;
  const age = now - data.at;
  if (age < MIN_MS) return { result: 'tooFast', nonce };
  if (age > MAX_MS) return { result: 'expired', nonce };
  return { result: answer === data.t ? 'ok' : 'wrong', nonce };
}

/** True when the hidden field a person never sees was filled in (a form-filling robot). */
export const honeypotFilled = (fd: FormData): boolean => String(fd.get('website') ?? '').trim() !== '';
