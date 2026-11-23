'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Live preview for the Matchday poster and the player announcement (endpoint): watches the settings form and shows the new poster as soon as anything changes
 * (no page reload; the strength slider waits a moment until it stops moving). Keeps the address and the upload forms'
 * "keep" fields in step, so an upload or a reload keeps the current choices.
 */
export function PosterPreview({ formId, initial, alt, download, loading, story, endpoint = '/api/content/xi' }: { formId: string; initial: string; alt: string; download: string; loading: string; story: boolean; endpoint?: string }) {
  const [query, setQuery] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [tall, setTall] = useState(story);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const read = () => {
      const q = new URLSearchParams();
      for (const [k, v] of new FormData(form)) if (typeof v === 'string' && v !== '') q.set(k, v);
      return q.toString();
    };
    const update = (wait: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const q = read();
        setQuery((old) => { if (old !== q) setBusy(true); return q; });
        setTall(new URLSearchParams(q).get('format') === 'story');
        window.history.replaceState(null, '', `?${q}`);
        document.querySelectorAll<HTMLInputElement>('input[name=keep]').forEach((i) => { i.value = q; });
      }, wait);
    };
    const onInput = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (el.type === 'range') { const out = el.parentElement?.querySelector('output'); if (out) out.textContent = `${el.value}%`; }
      update(el.type === 'range' ? 350 : 0);
    };
    form.addEventListener('change', onInput);
    form.addEventListener('input', onInput);
    form.addEventListener('submit', (e) => { e.preventDefault(); update(0); });
    return () => { form.removeEventListener('change', onInput); form.removeEventListener('input', onInput); };
  }, [formId]);
  return (
    <>
      <div className={`relative w-full ${tall ? 'max-w-sm' : 'max-w-xl'}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${endpoint}?${query}`} alt={alt} onLoad={() => setBusy(false)} onError={() => setBusy(false)}
          className={`w-full rounded-card shadow-lg transition-opacity ${busy ? 'opacity-60' : ''}`} data-poster-img data-busy={busy || undefined} />
        {busy ? (
          <span role="status" className="absolute inset-x-0 top-1/2 mx-auto flex w-fit -translate-y-1/2 items-center gap-2 rounded-full bg-ink-950/85 px-4 py-2 text-sm font-bold text-white">
            <span aria-hidden className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent motion-reduce:animate-none" />{loading}</span>
        ) : null}
      </div>
      <a href={`${endpoint}?${query}&download=1`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110" data-poster-download>{download}</a>
    </>
  );
}
