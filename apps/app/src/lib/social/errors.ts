/** An error whose message is the platform's own reason (safe to show to admins: never contains a key). */
export class SocialError extends Error {}
export type Posted = { id: string; url: string | null };
