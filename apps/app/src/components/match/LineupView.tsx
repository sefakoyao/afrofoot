export type LineupSlot = { slot: number; role: string; x: number; y: number };
type Pick = { name: string; shirt: number | null; captain: boolean; me: boolean };

const surname = (name: string) => name.trim().split(/\s+/).slice(-1)[0] ?? name;

/**
 * The published lineup as players see it: the same pitch as the coach's board, read-only, with the player's own marker
 * highlighted, then the bench. Shirt numbers instead of photos (teammates' photos are private to the player and the coaches).
 */
export function LineupView({ slots, starters, bench, label, benchLabel, youLabel }: {
  slots: LineupSlot[]; starters: (Pick & { slot: number })[]; bench: Pick[]; label: string; benchLabel: string; youLabel: string;
}) {
  const at = new Map(starters.map((s) => [s.slot, s]));
  return (
    <div className="grid gap-3" data-lineup-view>
      <div className="relative mx-auto aspect-[68/100] w-full max-w-[19rem] overflow-hidden rounded-[18px] shadow-[0_10px_24px_rgba(10,42,10,.22)]"
        style={{ background: 'repeating-linear-gradient(0deg, #2f8f22 0 10%, #349a26 10% 20%)' }} dir="ltr" role="list" aria-label={label}>
        <div aria-hidden className="pointer-events-none absolute inset-2 rounded-md border-2 border-white/50" />
        <div aria-hidden className="pointer-events-none absolute inset-x-2 top-1/2 h-0.5 bg-white/50" />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/50" />
        <div aria-hidden className="pointer-events-none absolute bottom-2 left-1/2 h-[15%] w-[52%] -translate-x-1/2 border-2 border-b-0 border-white/50" />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-2 h-[15%] w-[52%] -translate-x-1/2 border-2 border-t-0 border-white/50" />
        {slots.map((s) => {
          const p = at.get(s.slot);
          if (!p) return null;
          return (
            <div key={s.slot} role="listitem" data-view-slot={s.slot} data-me={p.me || undefined}
              className="absolute flex w-[4.25rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
              <span className={`relative flex size-9 items-center justify-center rounded-full border-[3px] font-display text-sm font-black shadow-md ${s.role === 'GK' ? 'border-white bg-ink-950 text-white' : 'border-white bg-white text-ink-950'} ${p.me ? 'ring-4 ring-accent' : ''}`}>
                {p.shirt ?? s.role}
                {p.captain ? <span className="absolute -start-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-black text-on-accent">C</span> : null}
              </span>
              <span className={`max-w-full truncate rounded px-1 text-[10px] font-semibold ${p.me ? 'bg-accent text-on-accent' : 'bg-black/60 text-white'}`}>
                <span className="sr-only">{s.role} </span><bdi>{p.me ? youLabel : surname(p.name)}</bdi>
              </span>
            </div>
          );
        })}
      </div>
      {bench.length ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{benchLabel} ({bench.length})</p>
          <ul className="mt-1 flex flex-wrap gap-1.5" data-view-bench>
            {bench.map((p, i) => (
              <li key={i} data-me={p.me || undefined} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.me ? 'bg-accent text-on-accent' : 'bg-raised'}`}>
                {p.shirt !== null ? <b dir="ltr" className="me-1">{p.shirt}</b> : null}<bdi>{p.me ? youLabel : p.name}</bdi>{p.captain ? ' (C)' : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
