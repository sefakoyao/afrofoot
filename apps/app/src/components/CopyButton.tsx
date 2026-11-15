'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/** Copies one payment detail (IBAN, reference, amount, bank barcode) so it can be pasted into the bank app. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations('me');
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      data-copy={value}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* clipboard blocked: the value stays selectable */ }
      }}
      aria-label={`${t('copy')}: ${label}`}
      className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line bg-raised px-4 text-sm font-bold hover:border-accent"
    >
      <span aria-live="polite">{done ? t('copied') : t('copy')}</span>
    </button>
  );
}
