/**
 * Faint pitch markings behind the signed-in pages (player, coach, admin) — design canvas "Page watermarks", option A.
 * Decorative only: fixed behind the content, never catches clicks or focus, hidden from screen readers, and left out
 * in high-contrast mode (forced colours) and when printing. Wide screens get a sideways pitch, phones an upright one.
 */
const LINES = { fill: 'none', stroke: '#3DAF2C', strokeWidth: 4 } as const;

function Wide() {
  return (
    <svg viewBox="0 0 1280 736" preserveAspectRatio="xMidYMid slice" className="hidden size-full md:block" aria-hidden="true" focusable="false">
      <g {...LINES}>
        <rect x="40" y="40" width="1200" height="656" rx="6" />
        <line x1="640" y1="40" x2="640" y2="696" />
        <circle cx="640" cy="368" r="96" />
        <rect x="40" y="188" width="176" height="360" /><rect x="40" y="278" width="64" height="180" />
        <rect x="1064" y="188" width="176" height="360" /><rect x="1176" y="278" width="64" height="180" />
        <path d="M216 300 A 90 90 0 0 1 216 436" /><path d="M1064 300 A 90 90 0 0 0 1064 436" />
        <path d="M40 64 A 24 24 0 0 0 64 40" /><path d="M1216 40 A 24 24 0 0 0 1240 64" />
        <path d="M40 672 A 24 24 0 0 1 64 696" /><path d="M1216 696 A 24 24 0 0 1 1240 672" />
      </g>
      <g fill="#3DAF2C"><circle cx="640" cy="368" r="7" /><circle cx="160" cy="368" r="6" /><circle cx="1120" cy="368" r="6" /></g>
    </svg>
  );
}

function Tall() {
  return (
    <svg viewBox="0 0 736 1280" preserveAspectRatio="xMidYMid slice" className="size-full md:hidden" aria-hidden="true" focusable="false">
      <g {...LINES}>
        <rect x="40" y="40" width="656" height="1200" rx="6" />
        <line x1="40" y1="640" x2="696" y2="640" />
        <circle cx="368" cy="640" r="96" />
        <rect x="188" y="40" width="360" height="176" /><rect x="278" y="40" width="180" height="64" />
        <rect x="188" y="1064" width="360" height="176" /><rect x="278" y="1176" width="180" height="64" />
        <path d="M300 216 A 90 90 0 0 0 436 216" /><path d="M300 1064 A 90 90 0 0 1 436 1064" />
      </g>
      <g fill="#3DAF2C"><circle cx="368" cy="640" r="7" /><circle cx="368" cy="160" r="6" /><circle cx="368" cy="1120" r="6" /></g>
    </svg>
  );
}

export function PitchWatermark() {
  return (
    <div aria-hidden="true" data-watermark="pitch" className="pointer-events-none fixed inset-0 -z-10 select-none opacity-10 print:hidden forced-colors:hidden">
      <Wide /><Tall />
    </div>
  );
}
