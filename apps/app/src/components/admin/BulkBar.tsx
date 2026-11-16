'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type Labels = { title: string; selectAll: string; action: string; approve: string; team: string; approveTeam: string; teamLabel: string; apply: string; none: string };

/**
 * "With the selected members": a bar above the members list. The row checkboxes (name="ids", form=<formId>) belong to
 * this form, so the server action receives exactly the ticked members. Shows how many are ticked and offers "select all".
 */
export function BulkBar({ formId, action, back, teamSelect, labels }: { formId: string; action: (fd: FormData) => void; back: string; teamSelect: ReactNode; labels: Labels }) {
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [what, setWhat] = useState<'approve' | 'team' | 'approveTeam'>('approveTeam');
  useEffect(() => {
    const boxes = () => [...document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${formId}"]`)];
    const update = () => { setCount(boxes().filter((b) => b.checked).length); setTotal(boxes().length); };
    document.addEventListener('change', update); update();
    return () => document.removeEventListener('change', update);
  }, [formId]);
  const all = (on: boolean) => {
    const boxes = document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${formId}"]`);
    boxes.forEach((b) => { b.checked = on; });
    setCount(on ? boxes.length : 0);
  };
  return (
    <form id={formId} action={action} className="sticky top-2 z-20 grid gap-3 rounded-card border-2 border-fg bg-raised p-3 shadow-md sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end" data-bulk-bar>
      <input type="hidden" name="back" value={back} />
      <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" onChange={(e) => all(e.target.checked)} checked={count > 0 && count === total} className="size-5 accent-accent" data-select-all />
        {labels.selectAll}
      </label>
      <label className="grid gap-1 text-sm font-semibold">{labels.action}
        <select name="action" value={what} onChange={(e) => setWhat(e.target.value as typeof what)} className="min-h-10 rounded-control border border-line bg-raised px-3 font-normal">
          <option value="approveTeam">{labels.approveTeam}</option>
          <option value="team">{labels.team}</option>
          <option value="approve">{labels.approve}</option>
        </select>
      </label>
      <label className={`grid gap-1 text-sm font-semibold ${what === 'approve' ? 'invisible' : ''}`}>{labels.teamLabel}{teamSelect}</label>
      <button disabled={!count} className="min-h-10 rounded-full bg-accent px-5 font-bold text-on-accent hover:brightness-110 disabled:opacity-50" data-bulk-apply>
        {count ? labels.apply.replace('{count}', String(count)) : labels.none}
      </button>
    </form>
  );
}
