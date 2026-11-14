'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { updatePassword } from '@/app/actions/auth';
import { Alert, PasswordField, SubmitButton } from '@/components/fields';
import { IDLE } from '@/lib/formState';

export function ResetForm({ home }: { home: string }) {
  const t = useTranslations('auth');
  const [state, action] = useActionState(updatePassword, IDLE);
  if (state.status === 'ok') {
    return (
      <div className="grid gap-4">
        <Alert tone="ok">{t(state.message)}</Alert>
        <Link href={home} className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">{t('continue')}</Link>
      </div>
    );
  }
  const err = state.status === 'error' ? state.error : null;
  return (
    <form action={action} className="grid gap-4">
      {err ? <Alert tone="error">{t(err)}</Alert> : null}
      {err === 'linkInvalid' ? <Link href="/forgot-password" className="text-sm font-semibold text-pitch underline">{t('requestNewLink')}</Link> : null}
      <PasswordField label={t('newPassword')} name="password" autoComplete="new-password" required minLength={10} hint={t('passwordRule')}
        aria-invalid={err === 'passwordTooShort' || err === 'passwordTooLong' || err === 'samePassword' || undefined} />
      <PasswordField label={t('confirmPassword')} name="confirm" autoComplete="new-password" required minLength={10}
        aria-invalid={err === 'passwordMismatch' || undefined} />
      <SubmitButton label={t('updatePassword')} pendingLabel={t('saving')} />
    </form>
  );
}
