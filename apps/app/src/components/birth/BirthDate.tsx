'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { setMyBirthDate, type BirthState } from '@/app/actions/birth';

type Labels = { label: string; hint: string; save: string; saved: string; errors: Record<string, string> };

/**
 * The player enters their own birth date (once; afterwards only an admin corrects it, migration 0073). Used in the
 * sign-in pop-up, on the contract page before signing and on the profile. The page refreshes once it is saved.
 */
export function BirthDateForm({ labels, max, autoFocus, onSaved }: { labels: Labels; max: string; autoFocus?: boolean; onSaved?: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<BirthState, FormData>(setMyBirthDate, { status: 'idle' });
  useEffect(() => { if (state.status === 'ok') { onSaved?.(); router.refresh(); } }, [state, onSaved, router]);
  return (
    <form action={action} className="grid gap-2" data-birth-self>
      <label className="grid gap-1 text-sm font-semibold">{labels.label}
        <input type="date" name="date_of_birth" required min="1940-01-01" max={max} autoFocus={autoFocus}
          className="min-h-11 rounded-control border border-line bg-raised px-3 font-normal" aria-describedby="birth-hint" /></label>
      <p id="birth-hint" className="text-xs text-muted">{labels.hint}</p>
      {state.status === 'error' ? <p role="alert" className="rounded-control bg-danger/10 p-2 text-sm font-semibold text-danger" data-birth-error>{labels.errors[state.error] ?? labels.errors.failed}</p> : null}
      {state.status === 'ok' ? <p role="status" className="text-sm font-semibold text-pitch">{labels.saved}</p> : null}
      <button disabled={pending} className="inline-flex min-h-11 items-center justify-center justify-self-start rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110 disabled:opacity-60" data-birth-save>{labels.save}</button>
    </form>
  );
}

/**
 * The sign-in pop-up for a player without a saved birth date: it decides whether their contract needs a parent or
 * guardian, and the contract cannot be signed without it. Shown once per sign-in session ("Later"), like SignReminder.
 */
export function BirthPrompt({ userId, max, labels }: { userId: string; max: string; labels: Labels & { title: string; lead: string; later: string } }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const key = `afc-birth-prompt:${userId}`;
  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(key) === '1'; } catch { /* storage blocked: once per page load */ }
    if (!seen) setOpen(true);
  }, [key]);
  const close = () => { setOpen(false); try { sessionStorage.setItem(key, '1'); } catch { /* nothing */ } };
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" data-birth-prompt>
      <button type="button" aria-label={labels.later} onClick={close} className="absolute inset-0 bg-ink-950/60" tabIndex={-1} />
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="bp-title" className="relative w-full max-w-md overflow-hidden rounded-[24px] bg-raised shadow-2xl">
        <div aria-hidden className="h-2 bg-gradient-to-r from-accent to-gold" />
        <div className="grid gap-4 p-6">
          <div>
            <h2 id="bp-title" className="font-display text-2xl font-extrabold">{labels.title}</h2>
            <p className="mt-1 text-muted">{labels.lead}</p>
          </div>
          <BirthDateForm labels={labels} max={max} autoFocus onSaved={close} />
          <button type="button" onClick={close} className="justify-self-center rounded-full px-5 py-2 font-semibold text-muted underline underline-offset-2 hover:text-fg" data-birth-later>{labels.later}</button>
        </div>
      </div>
    </div>
  );
}
