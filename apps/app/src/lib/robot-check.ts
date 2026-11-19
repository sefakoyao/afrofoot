import 'server-only';
import { ROBOT_ITEMS, honeypotFilled, newRobotChallenge, robotSecret, verifyRobotAnswer, type RobotChallenge, type RobotItem, type RobotResult } from '@afrofoot/ui/robot-check';

/**
 * Football robot check for the sign-up forms (shared with the website's forms: @afrofoot/ui/robot-check). Signed with
 * SIGNUP_CHECK_SECRET (server-only environment variable); without it sign-up is closed rather than unprotected.
 * Together with a hidden "honeypot" field and Supabase Auth's own rate limits this stops automated sign-ups.
 */
export const ITEMS = ROBOT_ITEMS;
export type Item = RobotItem;
export type Challenge = RobotChallenge;
export type CheckResult = RobotResult;
const key = () => robotSecret(process.env.SIGNUP_CHECK_SECRET);

export const newChallenge = (now = Date.now()): Challenge | null => newRobotChallenge(key(), now);
export const checkAnswer = (token: unknown, answer: unknown, now = Date.now()): CheckResult => verifyRobotAnswer(key(), token, answer, now).result;
export { honeypotFilled };
