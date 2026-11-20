'use client';

import { useState } from 'react';

/** A caption with a live character count (each platform has a limit). */
export function CaptionField({ name, defaultValue, max, readOnly, label }: { name: string; defaultValue: string; max: number; readOnly?: boolean; label: string }) {
  const [v, setV] = useState(defaultValue);
  return (
    <label className="grid gap-1 text-sm">
      <span className="sr-only">{label}</span>
      <textarea name={name} value={v} onChange={(e) => setV(e.target.value)} maxLength={max} rows={9} readOnly={readOnly} dir="auto"
        className="w-full rounded-control border border-line bg-raised p-3 leading-relaxed" data-caption={name} />
      <span className={`text-end text-xs ${v.length > max * 0.9 ? 'text-danger' : 'text-muted'}`}>{v.length} / {max}</span>
    </label>
  );
}
