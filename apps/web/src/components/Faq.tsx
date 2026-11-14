'use client';

import { useState } from 'react';

/** Animated accordion: one answer open at a time, numbered cards that lift on hover, smooth height change. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="grid gap-3">
      {items.map((it, i) => {
        const on = open === i;
        return (
          <div key={it.q} className={`rounded-card border bg-raised/90 shadow-sm backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transition-none ${on ? 'border-accent ring-2 ring-accent/30' : 'border-line'}`}>
            <button type="button" id={`faq-q-${i}`} aria-expanded={on} aria-controls={`faq-a-${i}`} onClick={() => setOpen(on ? null : i)}
              className="flex w-full items-center gap-4 p-4 text-start sm:p-5">
              <span className={`grid size-10 shrink-0 place-items-center rounded-full font-display text-sm font-black transition-colors ${on ? 'bg-accent text-on-accent' : 'bg-accent/15 text-pitch'}`}>{String(i + 1).padStart(2, '0')}</span>
              <span className="flex-1 font-display text-lg font-extrabold">{it.q}</span>
              <span aria-hidden className={`relative size-9 shrink-0 rounded-full transition-all duration-300 motion-reduce:transition-none ${on ? 'rotate-45 bg-accent' : 'bg-ink-950'}`}>
                <span className={`absolute left-1/2 top-1/2 h-0.5 w-4 -translate-x-1/2 -translate-y-1/2 rounded ${on ? 'bg-on-accent' : 'bg-white'}`} />
                <span className={`absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded ${on ? 'bg-on-accent' : 'bg-white'}`} />
              </span>
            </button>
            <div id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} aria-hidden={!on}
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden"><p className="px-4 pb-5 text-muted sm:px-5 sm:ps-[4.5rem]">{it.a}</p></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
