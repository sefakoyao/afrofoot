'use client';

import { useState } from 'react';

export interface SquadPlayer { id: string; display_name: string; position: string | null; jersey_number: number | null; nationality: string | null }

const FILTERS = [['all', 'sq_all'], ['goalkeeper', 'position_gk'], ['defender', 'position_df'], ['midfielder', 'position_mf'], ['forward', 'position_fw']] as const;

export function Squad({ players, labels }: { players: SquadPlayer[]; labels: Record<string, string> }) {
  const [pos, setPos] = useState<string>('all');
  const shown = players.filter((p) => pos === 'all' || p.position === pos);
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2" role="group">
        {FILTERS.map(([v, k]) => (
          <button key={v} type="button" aria-pressed={pos === v} onClick={() => setPos(v)}
            className={`rounded-full border-2 px-4 py-1.5 font-semibold ${pos === v ? 'border-accent bg-accent text-on-accent' : 'border-line'}`}>{labels[k]}</button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((p) => (
          <div key={p.id} className="rounded-card border border-line bg-raised p-4 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-ink-950 font-display text-xl font-black text-accent" aria-hidden>
              {p.display_name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
            </div>
            <p className="mt-2 font-display font-extrabold">{p.display_name}</p>
            <p className="text-sm text-muted">{[p.jersey_number ? `#${p.jersey_number}` : null, p.position ? labels[`position_${({ goalkeeper: 'gk', defender: 'df', midfielder: 'mf', forward: 'fw' } as Record<string, string>)[p.position] ?? ''}`] : null].filter(Boolean).join(' · ')}</p>
          </div>
        ))}
      </div>
    </>
  );
}
