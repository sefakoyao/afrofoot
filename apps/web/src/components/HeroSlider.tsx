'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Home page hero: a looping background video behind rotating slides (intro, next match, latest result, tryout call).
 * Slides are rendered on the server and passed in. Autoplay pauses on hover, focus or when the visitor asks;
 * it stays off for people who prefer reduced motion.
 */
export function HeroSlider({ slides, labels }: { slides: ReactNode[]; labels: { prev: string; next: string; pause: string; play: string } }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hold, setHold] = useState(false);
  const n = slides.length;

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPaused(true);
  }, []);
  useEffect(() => {
    if (paused || hold || n < 2) return;
    const id = window.setTimeout(() => setI((x) => (x + 1) % n), 7000);
    return () => window.clearTimeout(id);
  }, [i, paused, hold, n]);

  return (
    <section className="relative isolate overflow-hidden bg-ink-950 text-white" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
      <video className="absolute inset-0 -z-20 size-full object-cover opacity-40" src="/hero.mp4" autoPlay muted loop playsInline preload="auto" aria-hidden />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/60 to-black/20" aria-hidden />
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-16 md:pb-28 md:pt-24">
        {slides.map((s, k) => <div key={k} hidden={k !== i} aria-hidden={k !== i}>{s}</div>)}
      </div>
      {n > 1 ? (
        <div className="absolute inset-x-0 bottom-5 mx-auto flex max-w-6xl items-center justify-between px-4">
          <div className="flex gap-2" role="tablist">
            {slides.map((_, k) => (
              <button key={k} type="button" role="tab" aria-selected={k === i} aria-label={String(k + 1)} onClick={() => setI(k)}
                className={`h-2.5 rounded-full transition-all ${k === i ? 'w-8 bg-accent' : 'w-2.5 bg-white/50'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" aria-label={labels.prev} onClick={() => setI((i + n - 1) % n)} className="grid size-9 place-items-center rounded-full bg-white/15 hover:bg-white/30">‹</button>
            <button type="button" aria-label={paused ? labels.play : labels.pause} onClick={() => setPaused((p) => !p)} className="grid size-9 place-items-center rounded-full bg-white/15 hover:bg-white/30">{paused ? '▶' : '❚❚'}</button>
            <button type="button" aria-label={labels.next} onClick={() => setI((i + 1) % n)} className="grid size-9 place-items-center rounded-full bg-white/15 hover:bg-white/30">›</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
