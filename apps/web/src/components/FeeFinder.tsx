'use client';

import { useState } from 'react';
import { BANDS, INSURANCE_ROWS, type Band } from '@/lib/fees';

export function FeeFinder({ labels }: { labels: Record<string, string> }) {
  const [band, setBand] = useState<Band>(2);
  const b = BANDS[band];
  const rows = INSURANCE_ROWS[band];
  const ages: [Band, string][] = [[1, 'fd_a1'], [2, 'fd_a2'], [3, 'fd_a3'], [4, 'fd_a4']];
  return (
    <div className="rounded-card border border-line bg-raised p-5">
      <p className="text-sm text-muted">{labels.fd_age}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={labels.fd_age}>
        {ages.map(([v, k]) => (
          <button key={v} type="button" aria-pressed={band === v} onClick={() => setBand(v)}
            className={`rounded-full border-2 px-4 py-1.5 font-semibold ${band === v ? 'border-accent bg-accent text-on-accent' : 'border-line'}`}>{labels[k]}</button>
        ))}
      </div>
      <div className="mt-4 grid gap-5 rounded-card bg-accent/10 p-4 md:grid-cols-[200px_1fr]" aria-live="polite">
        <div>
          <p className="text-sm text-muted">{labels.fd_lic}</p>
          <p className="font-display text-4xl font-black">{b.licence}</p>
          <p className="text-muted">{labels[b.label]}</p>
        </div>
        <div>
          <p className="text-sm text-muted">{labels.fd_ins}</p>
          {band === 4 ? <p className="mt-1">{labels.fd_i4}</p> : (
            <>
              {rows.length ? <p className="mt-1 text-sm text-muted">{labels.fd_yr}</p> : null}
              <ul className="mt-1 divide-y divide-line">
                {rows.map((r) => (
                  <li key={r.label} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                    <span>{labels[r.label]}</span>
                    <b>{r.price ?? <span className="font-semibold text-muted">{labels.fd_seelist}</span>}</b>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.confirmed ? 'bg-accent/20 text-pitch' : 'bg-line text-muted'}`}>{r.confirmed ? labels.fd_conf : labels.fd_ver}</span>
                  </li>
                ))}
              </ul>
              {rows.length ? <p className="mt-2 text-xs text-muted">{labels.fd_tbl_note}</p> : null}
              {band !== 1 ? (
                <>
                  <p className="mt-2">{labels.fd_o5}</p>
                  <ul className="mt-1 list-disc ps-5">{['fd_o1', 'fd_o2', 'fd_o3'].map((k) => <li key={k}>{labels[k]}</li>)}</ul>
                  <p className="mt-2 text-sm text-muted">{labels.fd_o4}</p>
                </>
              ) : null}
              {b.note && band !== 4 ? <p className="mt-2 font-semibold">{labels[b.note]}</p> : null}
            </>
          )}
        </div>
      </div>
      <p className="mt-3">
        <a className="font-semibold text-pitch underline" target="_blank" rel="noopener noreferrer" href="https://www.palloliitto.fi/kilpailut/pelipassit-ja-vakuutukset">{labels.fd_link} ↗</a>
      </p>
    </div>
  );
}
