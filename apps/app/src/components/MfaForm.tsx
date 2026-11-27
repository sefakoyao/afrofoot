'use client';

import { useActionState } from 'react';
import { verifyMfa, type MfaState } from '@/app/actions/mfa';
import { signOut } from '@/app/actions/auth';

type Labels = Record<'title' | 'leadSetup' | 'leadVerify' | 'step1' | 'step2' | 'step3' | 'apps' | 'secretLabel' | 'code' | 'codeHint' | 'verify' | 'verifying' | 'signOut' | 'why' | 'lost', string> & { errors: Record<string, string> };

/** The two-step sign-in card: the setup (QR code, key, first code) or just the code, then on to the admin pages. */
export function MfaForm({ factorId, setup, next, email, labels }: { factorId: string; setup: { qr: string; secret: string } | null; next: string; email: string; labels: Labels }) {
  const [state, action, pending] = useActionState<MfaState, FormData>(verifyMfa, { status: 'idle' });
  return (
    <div className="grid gap-5" data-mfa={setup ? 'setup' : 'verify'}>
      <div>
        <span aria-hidden className="mb-3 grid size-12 place-items-center rounded-full bg-accent text-on-accent">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>
        </span>
        <h1 className="font-display text-2xl font-extrabold">{labels.title}</h1>
        <p className="mt-1 text-muted">{setup ? labels.leadSetup : labels.leadVerify}</p>
        <p className="mt-1 text-xs text-muted" dir="ltr" style={{ textAlign: 'start' }}><bdi>{email}</bdi></p>
      </div>
      {setup ? (
        <ol className="grid gap-4">
          <li className="grid gap-1"><p className="font-semibold">1. {labels.step1}</p><p className="text-sm text-muted">{labels.apps}</p></li>
          <li className="grid gap-2"><p className="font-semibold">2. {labels.step2}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- the QR code comes from Supabase Auth as an SVG data URL */}
            <img src={setup.qr} alt="" width={184} height={184} className="justify-self-center rounded-card border border-line bg-white p-2" data-mfa-qr />
            <details className="text-sm"><summary className="cursor-pointer font-semibold text-pitch">{labels.secretLabel}</summary>
              <code className="mt-2 block break-all rounded-control bg-surface p-2 font-mono text-sm" dir="ltr" data-mfa-secret>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code></details></li>
          <li className="font-semibold">3. {labels.step3}</li>
        </ol>
      ) : null}
      <form action={action} className="grid gap-3">
        <input type="hidden" name="factorId" value={factorId} /><input type="hidden" name="next" value={next} />
        <label className="grid gap-1 text-sm font-semibold">{labels.code}
          <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} autoFocus placeholder="123 456" dir="ltr"
            className="min-h-12 rounded-control border border-line bg-raised px-3 text-center font-mono text-2xl tracking-[0.3em]" data-mfa-code /></label>
        <p className="text-xs text-muted">{labels.codeHint}</p>
        {state.status === 'error' ? <p role="alert" className="rounded-control bg-danger/10 p-3 text-sm font-semibold text-danger" data-mfa-error={state.error}>{labels.errors[state.error] ?? labels.errors.failed}</p> : null}
        <button disabled={pending} className="min-h-12 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110 disabled:opacity-60" data-mfa-verify>{pending ? labels.verifying : labels.verify}</button>
      </form>
      <p className="text-xs text-muted">{labels.why} {labels.lost}</p>
      <form action={signOut}><button className="text-sm font-semibold text-muted underline underline-offset-2 hover:text-fg">{labels.signOut}</button></form>
    </div>
  );
}
