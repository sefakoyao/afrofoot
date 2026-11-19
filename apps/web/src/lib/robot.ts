import 'server-only';
import { newRobotChallenge, robotSecret, verifyRobotAnswer } from '@afrofoot/ui/robot-check';

/**
 * The football robot check on the website's contact and sponsor forms (same check as the app's sign-up).
 * Secret: ROBOT_CHECK_SECRET (or SIGNUP_CHECK_SECRET) in the website's environment; without one the check, and so the
 * form, is unavailable and the page offers the club's email address instead.
 */
const key = () => robotSecret(process.env.ROBOT_CHECK_SECRET, process.env.SIGNUP_CHECK_SECRET);
export const newChallenge = () => newRobotChallenge(key());
export const verify = (fd: FormData) => verifyRobotAnswer(key(), fd.get('robot_token'), fd.get('robot_answer'));
