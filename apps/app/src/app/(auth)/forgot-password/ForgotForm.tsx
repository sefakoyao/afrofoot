'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { requestPasswordReset } from '@/app/actions/auth';
import { Alert, Field, SubmitButton } from '@/components/fields';
import { IDLE, typedEmail } from '@/lib/formState';

export function ForgotForm() {
  const t = useTranslations('auth');
  const [state, action] = useActionState(requestPasswordReset, IDLE);
  return (
    <form action={action} className="grid gap-4">
      {state.status === 'error' ? <Alert tone="error">{t(state.error)}</Alert> : null}
      {state.status === 'ok' ? <Alert tone="ok">{t(state.message)}</Alert> : (
        <>
          <Field label={t('email')} name="email" type="email" defaultValue={typedEmail(state)} autoComplete="username" inputMode="email" required maxLength={200}
            aria-invalid={(state.status === 'error' && state.error === 'invalidEmail') || undefined} />
          <SubmitButton label={t('sendLink')} pendingLabel={t('sending')} />
        </>
      )}
      <p className="text-center text-sm"><Link href="/login" className="font-semibold text-pitch underline underline-offset-2">{t('backToSignIn')}</Link></p>
    </form>
  );
}
