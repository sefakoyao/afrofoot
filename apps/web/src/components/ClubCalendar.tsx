'use client';

import { useState } from 'react';

export type CalItem = {
  id: string; group: 'game' | 'practice' | 'event'; day: string; dayLabel: string; time: string; badge: string; title: string; sub: string | null;
  place: string | null; maps: string | null; status: 'on' | 'cancelled' | 'postponed'; statusLabel: string | null; score: string | null; description: string | null;
};
type Labels = { all: string; game: string; practice: string; event: string; none: string; maps: string; newTab: string; filter: string };

/** The website calendar list with All / Games / Training / Events filters (filtering happens in the browser). */
export function ClubCalendar({ items, labels }: { items: CalItem[]; labels: Labels }) {
  const [show, setShow] = useState<'all' | CalItem['group']>('all');
  const list = items.filter((i) => show === 'all' || i.group === show);
  const days = [...new Set(list.map((i) => i.day))];
  return (
    <div className="grid gap-5" data-club-calendar>
      <div role="group" aria-label={labels.filter} className="flex flex-wrap gap-2">
        {(['all', 'game', 'practice', 'event'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} data-filter={k}
            className={`min-h-10 rounded-full border-2 px-4 text-sm font-bold transition active:scale-[.97] ${show === k ? 'border-accent bg-accent text-on-accent' : 'border-line hover:border-accent'}`}>
            {labels[k]}
          </button>
        ))}
      </div>
      {days.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-muted">{labels.none}</p> : (
        <ol className="grid gap-6">
          {days.map((d) => (
            <li key={d} data-cal-day={d}>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-muted">{list.find((i) => i.day === d)!.dayLabel}</h3>
              <ul className="grid gap-3">
                {list.filter((i) => i.day === d).map((i) => (
                  <li key={i.id} data-cal-item={i.group} data-status={i.status} className={`grid gap-1 rounded-card border border-line bg-raised p-4 shadow-sm ${i.status !== 'on' ? 'opacity-75' : ''}`}>
                    <p className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${i.group === 'game' ? 'bg-ink-950 text-white' : i.group === 'practice' ? 'bg-accent/20 text-pitch' : 'bg-line text-fg'}`}>{i.badge}</span>
                      <span className="font-semibold" dir="ltr">{i.time}</span>
                      {i.statusLabel ? <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-bold text-danger">{i.statusLabel}</span> : null}
                    </p>
                    <p className={`font-display text-xl font-extrabold ${i.status !== 'on' ? 'line-through' : ''}`}><bdi>{i.title}</bdi>
                      {i.score ? <span className="ms-3 tabular-nums text-pitch" dir="ltr">{i.score}</span> : null}</p>
                    {i.sub ? <p className="text-sm text-muted">{i.sub}</p> : null}
                    {i.description ? <p className="whitespace-pre-line text-sm text-muted">{i.description}</p> : null}
                    {i.place ? (
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span>{i.place}</span>
                        {i.maps ? <a href={i.maps} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 font-semibold text-pitch underline underline-offset-2" data-cal-maps>
                          <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
                          {labels.maps}<span className="sr-only"> ({labels.newTab})</span></a> : null}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
