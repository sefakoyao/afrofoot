'use client';

import { useMemo, useState } from 'react';

export type PickOption = { value: string; label: string; note?: string };
type Labels = { title: string; search: string; selectShown: string; clear: string; none: string; noMatch: string; add: string; selected: string };

/**
 * Choose several players from the club's list: search, tick, "Select all shown", then add them in one go. The ticked
 * boxes are ordinary form fields (name="who"), so the form works like any other; the count is only shown here.
 */
export function PlayerPicker({ options, labels }: { options: PickOption[]; labels: Labels }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = useMemo(() => {
    const n = q.trim().toLocaleLowerCase();
    return n ? options.filter((o) => o.label.toLocaleLowerCase().includes(n)) : options;
  }, [q, options]);
  const toggle = (v: string, on: boolean) => setPicked((s) => { const x = new Set(s); if (on) x.add(v); else x.delete(v); return x; });
  if (!options.length) return <p className="rounded-card bg-surface p-4 text-sm text-muted">{labels.none}</p>;
  return (
    <fieldset className="grid gap-3 rounded-card border border-line bg-surface p-4" data-player-picker>
      <legend className="px-1 font-display font-extrabold">{labels.title}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.search} aria-label={labels.search}
          className="min-h-10 min-w-0 flex-1 rounded-full border border-line bg-raised px-4" data-picker-search />
        <button type="button" onClick={() => setPicked((s) => new Set([...s, ...shown.map((o) => o.value)]))} className="min-h-10 rounded-full border border-line px-4 text-sm font-semibold hover:border-accent" data-picker-all>{labels.selectShown}</button>
        {picked.size ? <button type="button" onClick={() => setPicked(new Set())} className="min-h-10 rounded-full px-3 text-sm font-semibold text-muted hover:text-fg">{labels.clear}</button> : null}
      </div>
      <ul className="grid max-h-80 gap-1 overflow-y-auto rounded-control border border-line bg-raised p-1 sm:grid-cols-2" data-picker-list>
        {shown.length === 0 ? <li className="p-3 text-sm text-muted">{labels.noMatch}</li> : shown.map((o) => (
          <li key={o.value}>
            <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 py-1.5 ${picked.has(o.value) ? 'bg-accent/15' : 'hover:bg-surface'}`}>
              <input type="checkbox" checked={picked.has(o.value)} onChange={(e) => toggle(o.value, e.target.checked)} className="size-5 shrink-0 accent-accent" />
              <span className="min-w-0"><bdi className="block truncate font-semibold">{o.label}</bdi>{o.note ? <span className="block text-xs text-muted">{o.note}</span> : null}</span>
            </label>
          </li>
        ))}
      </ul>
      {/* selected players outside the current search stay selected */}
      {[...picked].map((v) => <input key={v} type="hidden" name="who" value={v} />)}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold" aria-live="polite" data-picker-count={picked.size}>{labels.selected.replace('{count}', String(picked.size))}</span>
        <button disabled={!picked.size} className="min-h-11 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110 disabled:opacity-50" data-picker-add>
          {labels.add.replace('{count}', String(picked.size))}
        </button>
      </div>
    </fieldset>
  );
}
