'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { sendPhoneCode, signUpWithEmail, verifyPhoneCode, type SignUpState } from '@/app/actions/signup';
import { BlockedNotice } from '@/components/BlockedNotice';
import { Alert, Field, PasswordField, SubmitButton } from '@/components/fields';
import { FootballCheck, type ChallengeView } from './FootballCheck';

const ROBOT_ERRORS = new Set(['robotWrong', 'robotMissing', 'robotExpired', 'robotTooFast']);

/** "I have read the privacy notice" (required to create an account). */
function PrivacyBox({ href }: { href: string }) {
  const t = useTranslations('auth');
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" name="privacy" required className="mt-0.5 size-5 accent-accent" />
      <span>{t.rich('privacyAgree', { a: (c) => <a href={href} target="_blank" rel="noopener" className="font-semibold text-pitch underline underline-offset-2">{c}</a> })}</span>
    </label>
  );
}

function Names({ values }: { values?: Record<string, string> }) {
  const t = useTranslations('auth');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('firstName')} name="first_name" autoComplete="given-name" required maxLength={80} defaultValue={values?.first_name} />
      <Field label={t('lastName')} name="last_name" autoComplete="family-name" required maxLength={80} defaultValue={values?.last_name} />
    </div>
  );
}

/** Create an account with email and password. */
export function EmailSignUpForm({ challenge, privacyHref }: { challenge: ChallengeView; privacyHref: string }) {
  const t = useTranslations('auth');
  const [state, action] = useActionState<SignUpState, FormData>(signUpWithEmail, { status: 'idle', challenge });
  if (state.status === 'sent') return <Alert tone="ok"><span data-signup-sent>{t('signUpSent')}</span></Alert>;
  if (state.status === 'created') return <Alert tone="ok"><span data-signup-created>{t('signUpCreated')}</span></Alert>;
  const ch = (state.status === 'error' || state.status === 'idle') && state.challenge ? state.challenge : challenge;
  const error = state.status === 'error' ? state.error : null;
  const values = state.status === 'error' ? state.values : undefined;
  return (
    <form action={action} className="grid gap-4" data-signup="email">
      {error ? <Alert tone="error">{t(error)}</Alert> : null}
      <Names values={values} />
      <Field label={t('email')} name="email" type="email" autoComplete="email" inputMode="email" required maxLength={200} defaultValue={values?.email} />
      <PasswordField label={t('choosePassword')} name="password" autoComplete="new-password" required minLength={10} maxLength={200} hint={t('passwordHint')} />
      <PasswordField label={t('repeatPassword')} name="confirm" autoComplete="new-password" required maxLength={200} />
      <PrivacyBox href={privacyHref} />
      <FootballCheck key={ch.token} challenge={ch as ChallengeView} error={!!error && ROBOT_ERRORS.has(error)} />
      <SubmitButton label={t('signUp')} pendingLabel={t('signingUp')} />
    </form>
  );
}

/**
 * Phone number: step 1 sends a code by text message, step 2 checks it. mode 'signup' creates the account (names,
 * privacy, robot check); mode 'signin' signs an existing member in.
 */
export function PhoneForm({ mode, challenge, privacyHref, next }: { mode: 'signup' | 'signin'; challenge?: ChallengeView | null; privacyHref: string; next?: string }) {
  const t = useTranslations('auth');
  const [sent, send] = useActionState<SignUpState, FormData>(sendPhoneCode, { status: 'idle', challenge });
  const [checked, verify] = useActionState<SignUpState, FormData>(verifyPhoneCode, { status: 'idle' });
  if (checked.status === 'done') return <Alert tone={checked.message === 'accountCreated' ? 'ok' : 'error'}><span data-phone-done={checked.message}>{t(checked.message)}</span></Alert>;
  if (checked.status === 'blocked') return <BlockedNotice />;
  const codeStep = checked.status === 'code' ? checked : sent.status === 'code' ? sent : null;
  if (codeStep) {
    return (
      <form action={verify} className="grid gap-4" data-phone-step="code">
        <input type="hidden" name="mode" value={mode} /><input type="hidden" name="phone" value={codeStep.phone} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Alert tone="info">{t('codeSent', { phone: codeStep.phone })}</Alert>
        {codeStep.error ? <Alert tone="error">{t(codeStep.error)}</Alert> : null}
        {checked.status === 'error' ? <Alert tone="error">{t(checked.error)}</Alert> : null}
        <Field label={t('smsCode')} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus dir="ltr" hint={t('smsCodeHint')} />
        <SubmitButton label={t('verifyCode')} pendingLabel={t('verifying')} />
        <p className="text-center text-sm"><a href={mode === 'signup' ? '/signup?with=phone' : '/login/phone'} className="font-semibold text-pitch underline underline-offset-2">{t('codeAgain')}</a></p>
      </form>
    );
  }
  const ch = sent.status === 'error' || sent.status === 'idle' ? sent.challenge ?? challenge : challenge;
  const error = sent.status === 'error' ? sent.error : null;
  const values = sent.status === 'error' ? sent.values : undefined;
  return (
    <form action={send} className="grid gap-4" data-phone-step="number" data-signup={mode === 'signup' ? 'phone' : undefined}>
      <input type="hidden" name="mode" value={mode} />
      {error ? <Alert tone="error">{t(error)}</Alert> : null}
      {mode === 'signup' ? <Names values={values} /> : null}
      <Field label={t('phone')} name="phone" type="tel" autoComplete="tel" inputMode="tel" required maxLength={20} placeholder="+358 40 123 4567" defaultValue={values?.phone} dir="ltr" hint={t('phoneHint')} autoFocus={mode === 'signin'} />
      {mode === 'signup' ? <PrivacyBox href={privacyHref} /> : null}
      {mode === 'signup' && ch ? <FootballCheck key={ch.token} challenge={ch as ChallengeView} error={!!error && ROBOT_ERRORS.has(error)} /> : null}
      <SubmitButton label={t('sendCode')} pendingLabel={t('sendingCode')} />
      {mode === 'signin' ? <p className="text-center text-sm"><Link href="/login" className="font-semibold text-pitch underline underline-offset-2">{t('useEmailInstead')}</Link></p> : null}
    </form>
  );
}
