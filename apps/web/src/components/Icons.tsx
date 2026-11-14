/** Line icons for the home page tiles (24x24, stroke follows the text colour). */
const base = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

/** Membership: a member card with a check badge. */
export const IconMembership = () => (
  <svg {...base}><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.6-1.6 1.8-2.3 3-2.3s2.4.7 3 2.3" /><path d="M15 10h3M15 13h2" /></svg>
);
/** Become a partner: a handshake. */
export const IconPartner = () => (
  <svg {...base}><path d="M2 11l4-4 4 1.5 3-1.5 4 2 5-1" /><path d="M2 11l5.5 5.5a2 2 0 0 0 2.8 0l.7-.7" /><path d="M10 13l2.5 2.5a1.8 1.8 0 0 0 2.6 0l.4-.4a1.8 1.8 0 0 0 0-2.6L13 10" /><path d="M22 10l-4.5 5.5" /></svg>
);
/** Training: a calendar. */
export const IconTraining = () => (
  <svg {...base}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /><path d="M8 14h3M13 14h3M8 17.5h3" /></svg>
);
