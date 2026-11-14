/** Result of an auth form action. `error` and `message` are keys under `auth.*`. */
export type AuthState =
  | { status: 'idle' }
  | { status: 'error'; error: string; email?: string }
  | { status: 'ok'; message: string }
  | { status: 'blocked'; email?: string };
/** The email typed by the user, so React's form reset after an action does not make them type it again. */
export const typedEmail = (s: AuthState): string | undefined => ('email' in s ? s.email : undefined);
export const IDLE: AuthState = { status: 'idle' };
