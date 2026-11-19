import type { ShirtNumber } from '@/lib/shirts';

/**
 * Numbers 1–99 of a team as a grid. Free numbers are radio buttons when `pick` is given (a player choosing), otherwise
 * plain; taken numbers show who wears them (as the title and for screen readers); open requests are marked with a dot.
 */
export function ShirtGrid({ numbers, pick, mine, labels }: {
  numbers: ShirtNumber[]; pick?: string; mine?: number | null;
  labels: { free: string; taken: (name: string) => string; yours: string; requested: (n: number) => string; legendFree: string; legendTaken: string; legendRequested: string; notInSet?: string };
}) {
  return (
    <div className="grid gap-2">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5" data-shirt-grid>
        {numbers.map((n) => {
          const yours = mine === n.number;
          const title = `${yours ? labels.yours : n.free ? `${labels.free}${n.requests ? ` · ${labels.requested(n.requests)}` : ''}` : labels.taken(n.player_name ?? '')}${n.in_set === false && labels.notInSet ? ` · ${labels.notInSet}` : ''}`;
          const base = 'relative flex aspect-square min-h-11 items-center justify-center rounded-control text-sm font-bold tabular-nums';
          return (
            <li key={n.number} data-shirt={n.number} data-state={yours ? 'yours' : n.free ? 'free' : 'taken'}>
              {pick && n.free ? (
                <label className={`${base} cursor-pointer border-2 border-line bg-raised hover:border-accent has-[:checked]:border-ink-950 has-[:checked]:bg-ink-950 has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent`} title={title}>
                  <input type="radio" name={pick} value={n.number} required className="sr-only" defaultChecked={n.mine_requested} />
                  <span aria-hidden>{n.number}</span><span className="sr-only">{n.number}, {title}</span>
                  {n.requests ? <span aria-hidden className="absolute end-1 top-1 size-1.5 rounded-full bg-ink-950" /> : null}
                </label>
              ) : (
                <span className={`${base} ${yours ? 'bg-accent text-on-accent' : n.free ? 'border-2 border-line bg-raised' : 'bg-line text-muted line-through decoration-2'} ${n.in_set === false ? 'outline-dashed outline-2 outline-offset-1 outline-danger' : ''}`} title={title} data-out-of-set={n.in_set === false || undefined}>
                  <span aria-hidden>{n.number}</span><span className="sr-only">{n.number}, {title}</span>
                  {n.free && n.requests ? <span aria-hidden className="absolute end-1 top-1 size-1.5 rounded-full bg-ink-950" /> : null}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-hidden>
        <span><span className="me-1 inline-block size-3 rounded border-2 border-line align-middle" />{labels.legendFree}</span>
        <span><span className="me-1 inline-block size-3 rounded bg-line align-middle" />{labels.legendTaken}</span>
        <span><span className="me-1 inline-block size-1.5 rounded-full bg-ink-950 align-middle" /> {labels.legendRequested}</span>
      </p>
    </div>
  );
}
