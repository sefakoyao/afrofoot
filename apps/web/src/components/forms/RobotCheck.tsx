'use client';

import { useEffect, useState } from 'react';
import { FootballIcon, type RobotItem } from '@afrofoot/ui/football-icons';
import type { Labels } from './fields';

type Challenge = { token: string; target: RobotItem; options: RobotItem[] };

/**
 * "Quick check: tap the whistle" on the website's contact and sponsor forms. Asks the server for a fresh challenge
 * when it appears, after every failed send (`round` changes) and on "New pictures", since a challenge counts once.
 * Real radio buttons: works with a keyboard and a screen reader. The picked tile shows a green ring and a tick.
 */
export function RobotCheck({ labels, round, error }: { labels: Labels; round: unknown; error?: boolean }) {
  const [c, setC] = useState<Challenge | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let live = true;
    setState('loading');
    fetch('/api/robot-check', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Challenge) => { if (live) { setC(j); setState('ready'); } })
      .catch(() => { if (live) setState('unavailable'); });
    return () => { live = false; };
  }, [round, again]);

  if (state === 'unavailable') return <p role="alert" className="mt-4 rounded-card bg-danger/10 p-3 text-sm font-semibold text-danger" data-robot-unavailable>{labels.rc_unavailable}</p>;
  return (
    <fieldset
      className={`mt-5 rounded-card border bg-surface p-4 transition-colors sm:p-5 ${error ? 'border-danger shadow-[0_0_0_3px] shadow-danger/15' : 'border-line'}`}
      data-robot-check aria-describedby="rc-hint" aria-busy={state === 'loading'}>
      <legend className="sr-only">{labels.rc_title}</legend>
      <div className="flex items-start gap-3">
        <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-full ${error ? 'bg-danger/10 text-danger' : 'bg-accent/15 text-pitch'}`}>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" /><path d="m9 12 2 2 4-4" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display font-extrabold leading-tight" aria-hidden>{labels.rc_title}</p>
          <p id="rc-hint" className="mt-0.5 text-sm text-muted">
            {labels.rc_ask}{' '}
            <b className="inline-flex items-center rounded-full bg-ink-950 px-2.5 py-0.5 align-middle text-sm font-bold text-white" data-robot-target={c?.target}>{c ? labels[`rc_item_${c.target}`] : '…'}</b>
          </p>
        </div>
        <button type="button" onClick={() => setAgain((n) => n + 1)} disabled={state === 'loading'} data-robot-refresh
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-muted hover:bg-raised hover:text-fg disabled:opacity-50">
          <svg aria-hidden viewBox="0 0 24 24" className={`size-4 ${state === 'loading' ? 'animate-spin motion-reduce:animate-none' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v4h-4" /></svg>
          <span className="hidden sm:inline">{labels.rc_new}</span><span className="sr-only sm:hidden">{labels.rc_new}</span>
        </button>
      </div>
      <input type="hidden" name="robot_token" value={c?.token ?? ''} />
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
        {(c && state === 'ready' ? c.options : Array.from({ length: 6 }, () => null)).map((item, i) => item ? (
          <label key={`${c!.token.slice(-6)}-${item}`} className="group relative">
            <input type="radio" name="robot_answer" value={item} required className="peer sr-only" data-robot-option={item} />
            <span className="flex aspect-square cursor-pointer items-center justify-center rounded-2xl border-2 border-transparent bg-raised text-ink-950 shadow-[0_1px_2px_rgba(0,0,0,.06),0_4px_12px_rgba(0,0,0,.05)] transition duration-150 group-hover:-translate-y-0.5 group-hover:border-accent/40 active:scale-95 peer-checked:border-accent peer-checked:bg-accent/10 peer-checked:text-pitch peer-focus-visible:ring-4 peer-focus-visible:ring-accent/40 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
              <FootballIcon item={item} className="size-9 sm:size-10" />
              <span className="sr-only">{labels[`rc_item_${item}`]}</span>
            </span>
            {/* tick on the picked tile */}
            <span aria-hidden className="pointer-events-none absolute -end-1.5 -top-1.5 hidden size-6 items-center justify-center rounded-full bg-accent text-on-accent shadow peer-checked:flex">
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3.5 8.5 3 3 6-6.5" /></svg>
            </span>
          </label>
        ) : <span key={i} className="aspect-square animate-pulse rounded-2xl bg-line/60 motion-reduce:animate-none" aria-hidden />)}
      </div>
      <p className="mt-3 text-xs text-muted">{labels.rc_lead}</p>
    </fieldset>
  );
}
