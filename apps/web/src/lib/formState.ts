export type FormState = { status: 'idle' } | { status: 'ok' } | { status: 'error'; error: string };
export const IDLE: FormState = { status: 'idle' };
