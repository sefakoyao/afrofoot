'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * A pop-up when a player signs in with paperwork still to do: the player contract waiting for their signature and/or the
 * Code of Conduct not yet agreed, each with a button to do it now. Shown once per sign-in session (remembered in the
 * browser tab's session storage; shown again after the next sign-in), never on the page it points to. The small banners
 * on the player pages stay until it is done.
 */
export function SignReminder({ userId, contractHref, conductHref, labels }: {
  userId: string; contractHref: string | null; conductHref: string | null;
  labels: { title: string; lead: string; contract: string; contractCta: string; conduct: string; conductCta: string; later: string };
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const first = useRef<HTMLAnchorElement>(null);
  const key = `afc-sign-reminder:${userId}`;
  const onTarget = (contractHref && path.startsWith(contractHref.split('#')[0]!)) || (conductHref && path.startsWith(conductHref.split('#')[0]!));
  useEffect(() => {
    if (!contractHref && !conductHref) return;
    let seen = false;
    try { seen = sessionStorage.getItem(key) === '1'; } catch { /* storage blocked: show it once per page load */ }
    if (!seen && !onTarget) setOpen(true);
  }, [key, contractHref, conductHref, onTarget]);
  useEffect(() => { if (open) first.current?.focus(); }, [open]);
  const close = () => { setOpen(false); try { sessionStorage.setItem(key, '1'); } catch { /* nothing */ } };
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });
  if (!open) return null;
  const item = (text: string, href: string, cta: string, data: string, primary: boolean) => (
    <li className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" data-reminder-item={data}>
      <p className="flex items-start gap-3 font-semibold">
        <span aria-hidden className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-danger font-black text-white">!</span>{text}
      </p>
      <Link ref={primary ? first : undefined} href={href} onClick={close}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">{cta}</Link>
    </li>
  );
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" data-sign-reminder>
      <button type="button" aria-label={labels.later} onClick={close} className="absolute inset-0 bg-ink-950/60" tabIndex={-1} />
      <div role="dialog" aria-modal="true" aria-labelledby="sr-title" className="relative w-full max-w-lg overflow-hidden rounded-[24px] bg-raised shadow-2xl">
        <div aria-hidden className="h-2 bg-gradient-to-r from-accent to-gold" />
        <div className="grid gap-4 p-6">
          <div>
            <h2 id="sr-title" className="font-display text-2xl font-extrabold">{labels.title}</h2>
            <p className="mt-1 text-muted">{labels.lead}</p>
          </div>
          <ul className="grid gap-2">
            {contractHref ? item(labels.contract, contractHref, labels.contractCta, 'contract', true) : null}
            {conductHref ? item(labels.conduct, conductHref, labels.conductCta, 'conduct', !contractHref) : null}
          </ul>
          <button type="button" onClick={close} className="justify-self-center rounded-full px-5 py-2 font-semibold text-muted underline underline-offset-2 hover:text-fg" data-reminder-later>{labels.later}</button>
        </div>
      </div>
    </div>
  );
}
