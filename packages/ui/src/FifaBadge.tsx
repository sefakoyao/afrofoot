/** The club's FIFA ID (team registration identifier), shown in the website footer and on the member app's sign-in page. */
export const FIFA_ID = '149PZFE';

/**
 * Outline pill "FIFA ID 149PZFE" (design option A). tone: "dark" on the black website footer, "light" on white cards.
 * The label comes from the caller (translated); the ID itself always reads left to right.
 */
export function FifaBadge({ label, tone }: { label: string; tone: 'dark' | 'light' }) {
  const dark = tone === 'dark';
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border-[1.5px] px-3.5 py-1 font-display text-[13px] leading-5 ${dark ? 'border-white/35' : 'border-line'}`} data-fifa-id>
      <span className={`font-bold tracking-[.08em] ${dark ? 'text-white/60' : 'text-muted'}`}>{label}</span>
      <span dir="ltr" className={`font-extrabold tracking-[.06em] ${dark ? 'text-white' : 'text-fg'}`}>{FIFA_ID}</span>
    </span>
  );
}
