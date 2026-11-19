'use client';

import { useEffect, useState } from 'react';
import { FootballIcon, type RobotItem } from '@afrofoot/ui/football-icons';
import type { Labels } from './fields';

type Challenge = { token: string; target: RobotItem; options: RobotItem[] };

/**
 * "Robot check: tap the whistle" on the website's contact and sponsor forms. Asks the server for a fresh challenge
 * when it appears and again after every failed send (`round` changes), since a challenge counts once.
 * Real radio buttons: works with a keyboard and a screen reader.
 */
export function RobotCheck({ labels, round, error }: { labels: Labels; round: unknown; error?: boolean }) {
  const [c, setC] = useState<Challenge | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  useEffect(() => {
    let live = true;
    setState('loading');
    fetch('/api/robot-check', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Challenge) => { if (live) { setC(j); setState('ready'); } })
      .catch(() => { if (live) setState('unavailable'); });
    return () => { live = false; };
  }, [round]);

  if (state === 'unavailable') return <p role="alert" className="mt-4 rounded-card bg-danger/10 p-3 text-sm font-semibold text-danger" data-robot-unavailable>{labels.rc_unavailable}</p>;
  return (
    <fieldset className={`mt-4 grid gap-3 rounded-card border-2 p-4 ${error ? 'border-danger' : 'border-accent/50'}`} data-robot-check aria-describedby="rc-hint" aria-busy={state === 'loading'}>
      <legend className="px-1 font-display font-extrabold">{labels.rc_title}</legend>
      <p id="rc-hint" className="text-sm"><span className="text-muted">{labels.rc_ask}</span> <b data-robot-target={c?.target}>{c ? labels[`rc_item_${c.target}`] : '…'}</b></p>
      <input type="hidden" name="robot_token" value={c?.token ?? ''} />
      <div className="grid grid-cols-3 gap-2 rounded-card p-2 sm:grid-cols-6" style={{ background: 'repeating-linear-gradient(90deg, #2f8f22 0 16.66%, #349a26 16.66% 33.33%)' }}>
        {(c?.options ?? Array.from({ length: 6 }, () => null)).map((item, i) => item ? (
          <label key={`${c!.token.slice(-6)}-${item}`} className="relative">
            <input type="radio" name="robot_answer" value={item} required className="peer sr-only" data-robot-option={item} />
            <span className="flex aspect-square cursor-pointer items-center justify-center rounded-control bg-white/90 text-ink-950 shadow-sm transition active:scale-95 peer-checked:bg-ink-950 peer-checked:text-white peer-checked:ring-4 peer-checked:ring-accent peer-focus-visible:ring-4 peer-focus-visible:ring-white">
              <FootballIcon item={item} className="size-10" />
              <span className="sr-only">{labels[`rc_item_${item}`]}</span>
            </span>
          </label>
        ) : <span key={i} className="aspect-square animate-pulse rounded-control bg-white/50 motion-reduce:animate-none" aria-hidden />)}
      </div>
    </fieldset>
  );
}
