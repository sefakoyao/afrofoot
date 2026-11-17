'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { adoptLinkSession } from '@/app/actions/auth';

/**
 * Landing page for email links whose session arrives in the URL fragment (#access_token=…&type=recovery), as Supabase's
 * default email template does for links sent without PKCE (/auth/confirm forwards here). The fragment never reaches the
 * server, so this page reads it, hands it to a server action that stores the session, wipes it from the address bar and
 * continues: a password reset to /reset-password, anything else to the app. A broken link ends where /auth/confirm sends it.
 */
function HashLanding() {
  const t = useTranslations('auth');
  const router = useRouter();
  const next = useSearchParams().get('next') === '/reset-password' ? '/reset-password' : '/';
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, '', window.location.pathname + window.location.search); // never leave tokens in the address bar
    const access = h.get('access_token'), refresh = h.get('refresh_token');
    const goal = h.get('type') === 'recovery' ? '/reset-password' : next;
    const broken = () => router.replace(goal === '/reset-password' ? '/reset-password?error=link' : '/login?reason=link');
    if (!access || !refresh) { setFailed(true); broken(); return; }
    adoptLinkSession(access, refresh).then((r) => {
      if (r.ok) router.replace(goal);
      else if (r.blocked) router.replace('/login?reason=blocked');
      else { setFailed(true); broken(); }
    }, () => { setFailed(true); broken(); });
  }, [next, router]);

  return (
    <main className="mx-auto grid min-h-[60vh] max-w-md place-items-center px-4 text-center">
      <p className="font-display text-lg font-bold" role="status" aria-live="polite">{failed ? t('linkInvalid') : t('linkOpening')}</p>
    </main>
  );
}

export default function HashLandingPage() {
  return <Suspense fallback={null}><HashLanding /></Suspense>;
}
