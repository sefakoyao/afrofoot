'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { signOutForInactivity } from '@/app/actions/auth';
import { WARN_BEFORE_MS } from '@/lib/idle';

const KEY = 'af-last-activity';
const BEAT_MS = 60_000;
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
const readShared = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };

/**
 * Signs the person out after `minutes` without activity (lib/idle.ts). Activity in any tab of the app counts (shared
 * through localStorage); background refreshes do not. Two minutes before, a dialog offers to stay signed in.
 * While the person is active the server is told at most once a minute, so the server-side check agrees.
 */
export function IdleGuard({ minutes }: { minutes: number }) {
  const t = useTranslations('app');
  const limit = minutes * 60_000;
  const last = useRef(Date.now()), beat = useRef(0);
  const [left, setLeft] = useState<number | null>(null);
  const [, start] = useTransition();
  const signingOut = useRef(false);

  const signOut = useCallback(() => {
    if (signingOut.current) return;
    signingOut.current = true;
    start(() => signOutForInactivity());
  }, []);

  const heartbeat = useCallback(() => {
    beat.current = Date.now();
    fetch('/api/alive', { method: 'POST', credentials: 'same-origin', redirect: 'manual' })
      .then((r) => { if (r.status !== 204) window.location.reload(); }) // the server already signed this session out
      .catch(() => { /* offline: the next activity tries again */ });
  }, []);

  const active = useCallback(() => {
    const now = Date.now();
    last.current = now;
    try { if (now - readShared() > 5000) localStorage.setItem(KEY, String(now)); } catch { /* private mode */ }
    if (now - beat.current > BEAT_MS) heartbeat();
    setLeft(null);
  }, [heartbeat]);

  useEffect(() => {
    active(); // opening a page is activity
    const onEvent = () => { if (Date.now() - last.current > 1000) active(); };
    for (const e of EVENTS) window.addEventListener(e, onEvent, { passive: true, capture: true });
    const check = () => {
      const idle = Date.now() - Math.max(last.current, readShared());
      if (idle >= limit) signOut();
      else if (idle >= limit - WARN_BEFORE_MS) setLeft(limit - idle);
      else setLeft(null);
    };
    const timer = window.setInterval(check, 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, onEvent, { capture: true });
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, limit, signOut]);

  if (left === null) return null;
  const secs = Math.max(0, Math.ceil(left / 1000));
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-4 sm:items-center" data-idle-warning>
      <div role="alertdialog" aria-modal="true" aria-labelledby="idle-h" aria-describedby="idle-p" className="w-full max-w-sm rounded-card bg-raised p-6 shadow-xl">
        <h2 id="idle-h" className="font-display text-xl font-extrabold">{t('idleTitle')}</h2>
        <p id="idle-p" className="mt-2" aria-live="polite">{t('idleText', { time })}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <button type="button" autoFocus onClick={() => { beat.current = 0; active(); }} className="min-h-11 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110" data-idle-stay>{t('idleStay')}</button>
          <button type="button" onClick={signOut} className="min-h-11 rounded-full border-2 border-fg px-6 font-display font-bold hover:bg-fg hover:text-raised" data-idle-out>{t('idleOut')}</button>
        </div>
      </div>
    </div>
  );
}
