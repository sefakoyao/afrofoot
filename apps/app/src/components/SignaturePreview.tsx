'use client';

import { useState } from 'react';
import { SignatureMark } from './SignatureMark';

/** The "type your name" field of the signing form, with a live preview of how the signature will look on the contract. */
export function SignaturePreview({ label, hint, previewLabel, placeholder, defaultValue = '' }: { label: string; hint: string; previewLabel: string; placeholder: string; defaultValue?: string }) {
  const [name, setName] = useState(defaultValue);
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 font-semibold">{label}
        <input name="name" required minLength={2} maxLength={160} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
          className="min-h-12 rounded-control border border-line bg-raised px-3 text-lg" data-sign-name />
        <span className="text-sm font-normal text-muted">{hint}</span></label>
      <div className="rounded-card bg-surface p-4" aria-live="polite" data-signature-preview>
        <p className="text-xs font-bold uppercase tracking-widest text-muted">{previewLabel}</p>
        <SignatureMark name={name} placeholder={placeholder} />
      </div>
    </div>
  );
}
