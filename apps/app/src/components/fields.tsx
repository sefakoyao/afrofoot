'use client';

import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';

export const inputClass = 'min-h-11 w-full rounded-control border border-line bg-raised px-3 py-2 text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 aria-[invalid=true]:border-danger';

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string };

export function Field({ label, hint, id, ...p }: InputProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="grid gap-1">
      <label htmlFor={fid} className="text-sm font-semibold">{label}</label>
      <input id={fid} {...p} aria-describedby={hint ? `${fid}-h` : undefined} className={inputClass} />
      {hint ? <small id={`${fid}-h`} className="text-sm text-muted">{hint}</small> : null}
    </div>
  );
}

/** Password field with a show/hide toggle. The toggle sits at the inline end, so it moves to the left in Arabic. */
export function PasswordField({ label, hint, id, ...p }: InputProps) {
  const t = useTranslations('auth');
  const auto = useId();
  const fid = id ?? auto;
  const [shown, setShown] = useState(false);
  return (
    <div className="grid gap-1">
      <label htmlFor={fid} className="text-sm font-semibold">{label}</label>
      <div className="relative">
        <input id={fid} {...p} type={shown ? 'text' : 'password'} aria-describedby={hint ? `${fid}-h` : undefined} className={`${inputClass} pe-24`} />
        <button type="button" onClick={() => setShown((s) => !s)} aria-controls={fid} aria-pressed={shown}
          className="absolute inset-y-1 end-1 rounded-full px-3 text-sm font-semibold text-pitch hover:bg-accent/10">
          {shown ? t('hidePassword') : t('showPassword')}
        </button>
      </div>
      {hint ? <small id={`${fid}-h`} className="text-sm text-muted">{hint}</small> : null}
    </div>
  );
}

export function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending}
      className="min-h-11 w-full rounded-full bg-accent px-6 py-2.5 font-display font-bold text-on-accent hover:brightness-110 disabled:opacity-60">
      {pending ? pendingLabel : label}
    </button>
  );
}

export function Alert({ tone, children }: { tone: 'error' | 'ok' | 'info'; children: ReactNode }) {
  const cls = { error: 'bg-danger/10 text-danger', ok: 'bg-accent/15 text-pitch', info: 'bg-line/60 text-fg' }[tone];
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-card p-3 text-sm font-semibold ${cls}`}>{children}</div>;
}
