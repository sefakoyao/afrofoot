'use client';

import { useState } from 'react';

/** Copies the full address of a page or file on this site (origin + path), for pasting into WhatsApp or an email. */
export function CopyLinkButton({ path, label, done, hint }: { path: string; label: string; done: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" title={hint} data-copy-link={path}
      onClick={async () => {
        try { await navigator.clipboard.writeText(new URL(path, window.location.origin).toString()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: the download links still work */ }
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-raised px-4 font-display font-bold hover:border-accent">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
      <span aria-live="polite">{copied ? done : label}</span>
    </button>
  );
}
