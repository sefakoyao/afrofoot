'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { signIn } from '@/app/actions/auth';
import { Alert, Field, PasswordField, SubmitButton } from '@/components/fields';
import { BlockedNotice } from '@/components/BlockedNotice';
import { IDLE, typedEmail } from '@/lib/formState';

export function LoginForm({ next, notice, webUrl }: { next?: string; notice?: string; webUrl: string }) {
  const t = useTranslations('auth');
  const [state, action] = useActionState(signIn, IDLE);
  const blocked = state.status === 'blocked' || (state.status === 'idle' && notice === 'blocked');
  const error = state.status === 'error' ? state.error : state.status === 'idle' && notice && notice !== 'blocked' ? notice : null;
  return (
    <form action={action} className="grid gap-4" noValidate={false}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {blocked ? <BlockedNotice webUrl={webUrl} /> : null}
      {error ? <Alert tone="error">{t(error)}</Alert> : null}
      <Field label={t('email')} name="email" type="email" defaultValue={typedEmail(state)} autoComplete="username" inputMode="email" required maxLength={200}
        aria-invalid={error === 'invalidEmail' || undefined} />
      <PasswordField label={t('password')} name="password" autoComplete="current-password" required maxLength={200}
        aria-invalid={error === 'invalidCredentials' || error === 'passwordRequired' || undefined} />
      <SubmitButton label={t('signIn')} pendingLabel={t('signingIn')} />
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="font-semibold text-pitch underline underline-offset-2">{t('forgot')}</Link>
      </p>
    </form>
  );
}
