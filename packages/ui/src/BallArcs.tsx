/**
 * "Ball arcs" background (design canvas option C): passing lines draw themselves between players, a ball travels
 * along each pass and the players pulse. One self-contained SVG, no JavaScript, so it works in server components on
 * the public site and the member app. Decorative only (aria-hidden). With "reduce motion" switched on, the lines
 * stay still and the balls and pulses are hidden.
 *
 * `shape="wide"` fills a hero banner (the move runs along the bottom and up the right edge); `shape="tall"` fills a phone-shaped screen
 * (the move runs along the bottom). The SVG covers its parent; give the parent `position: relative` and put content above it.
 */
type Point = readonly [number, number];
const SHAPES = {
  wide: { w: 1280, h: 720, pts: [[40, 690], [250, 640], [470, 700], [690, 630], [900, 690], [1090, 600], [1230, 430], [1200, 230], [1250, 70]] as Point[], bend: [-50, 40, -50, 40, -45, 55, -60, 45], align: 'xMaxYMax slice', ball: 8, node: 7, ring: 15 },
  tall: { w: 390, h: 844, pts: [[50, 820], [150, 740], [300, 790], [340, 670], [190, 640], [320, 560]] as Point[], bend: [-45, 40, -45, 40, -35], align: 'xMidYMax slice', ball: 6.5, node: 5.5, ring: 12 },
} as const;

function passes(shape: keyof typeof SHAPES) {
  const s = SHAPES[shape];
  return s.pts.slice(0, -1).map((a, i) => {
    const b = s.pts[i + 1]!;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const k = s.bend[i] ?? 0;
    return `M${a[0]} ${a[1]} Q${Math.round(mx - (dy / len) * k)} ${Math.round(my + (dx / len) * k)} ${b[0]} ${b[1]}`;
  });
}

const CSS = `
.af-pass{fill:none;stroke:#3DAF2C;stroke-width:3;stroke-linecap:round;stroke-dasharray:100;animation:af-draw var(--af-cycle) ease-in-out infinite}
.af-ring{fill:none;stroke:#3DAF2C;stroke-width:2;transform-box:fill-box;transform-origin:center;animation:af-pulse 2.4s ease-out infinite}
@keyframes af-draw{0%{stroke-dashoffset:100}35%,70%{stroke-dashoffset:0}100%{stroke-dashoffset:-100}}
@keyframes af-pulse{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.9);opacity:0}}
@media (prefers-reduced-motion: reduce){.af-pass{animation:none;stroke-dasharray:none;opacity:.5}.af-ring,.af-ball{display:none}}
`;

export function BallArcs({ shape = 'wide', speed = 1, className = '' }: { shape?: 'wide' | 'tall'; speed?: number; className?: string }) {
  const s = SHAPES[shape];
  const cycle = (shape === 'wide' ? 8.4 : 6.6) / Math.max(0.25, speed);
  const list = passes(shape);
  const delay = (i: number) => ((i * cycle) / list.length) * 0.45;
  return (
    <svg viewBox={`0 0 ${s.w} ${s.h}`} preserveAspectRatio={s.align} aria-hidden="true" focusable="false" data-ball-arcs={shape}
      className={className} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ['--af-cycle' as string]: `${cycle}s` }}>
      <style>{CSS}</style>
      <defs>
        <radialGradient id={`af-glow-${shape}`}><stop offset="0" stopColor="#7fe06b" stopOpacity=".8" /><stop offset="1" stopColor="#7fe06b" stopOpacity="0" /></radialGradient>
      </defs>
      {list.map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="2" strokeDasharray="4 10" />
          <path d={d} pathLength={100} className="af-pass" style={{ animationDelay: `${delay(i)}s` }} />
        </g>
      ))}
      {s.pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={s.ring} className="af-ring" style={{ animationDelay: `${i * 0.35}s` }} />
          <circle cx={x} cy={y} r={s.node} fill="#ffffff" />
        </g>
      ))}
      {list.map((d, i) => (
        <g key={i} className="af-ball" opacity="0">
          <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.06;0.35;0.42;1" dur={`${cycle}s`} begin={`${delay(i)}s`} repeatCount="indefinite" />
          <animateMotion path={d} keyPoints="0;1;1" keyTimes="0;0.35;1" calcMode="linear" dur={`${cycle}s`} begin={`${delay(i)}s`} repeatCount="indefinite" />
          <circle r={s.ball * 2.2} fill={`url(#af-glow-${shape})`} />
          <circle r={s.ball} fill="#ffffff" stroke="#3DAF2C" strokeWidth="3" />
        </g>
      ))}
    </svg>
  );
}
