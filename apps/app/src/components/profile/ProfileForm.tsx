'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { LOCALES, LOCALE_LABELS } from '@afrofoot/i18n';
import { updateProfile, type ProfileState } from '@/app/actions/account';
import { Alert, Field, SubmitButton, inputClass } from '@/components/fields';

const IDLE: ProfileState = { status: 'idle' };

/** `showPhone` is false for players: their contact phone lives in the player profile (player_private), which coaches can see. */
export function ProfileForm({ initial, showPhone }: { initial: { first_name: string; last_name: string; phone: string; locale: string }; showPhone: boolean }) {
  const t = useTranslations('account');
  const [state, action] = useActionState(updateProfile, IDLE);
  const err = state.status === 'error' ? state.error : null;
  const v = { ...initial, ...(state.status === 'error' ? state.values : {}) }; // keep what was typed after an error
  return (
    <form action={action} className="grid gap-4">
      {state.status === 'ok' ? <Alert tone="ok">{t('saved')}</Alert> : null}
      {err ? <Alert tone="error">{t(err)}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('firstName')} name="first_name" defaultValue={v.first_name} autoComplete="given-name" required maxLength={80} aria-invalid={err === 'e_name' || undefined} />
        <Field label={t('lastName')} name="last_name" defaultValue={v.last_name} autoComplete="family-name" required maxLength={80} aria-invalid={err === 'e_name' || undefined} />
      </div>
      {showPhone ? (
        <Field label={t('phone')} name="phone" type="tel" inputMode="tel" dir="ltr" defaultValue={v.phone} autoComplete="tel" placeholder="+358 40 123 4567"
          hint={t('phoneHint')} maxLength={30} aria-invalid={err === 'e_phone' || undefined} />
      ) : <p className="text-sm text-muted">{t('phoneInPlayerProfile')}</p>}
      <div className="grid gap-1">
        <label htmlFor="locale" className="text-sm font-semibold">{t('language')}</label>
        <select key={v.locale} id="locale" name="locale" defaultValue={v.locale} className={inputClass}>
          {LOCALES.map((l) => <option key={l} value={l} lang={l}>{LOCALE_LABELS[l].native}</option>)}
        </select>
      </div>
      <div className="sm:w-60"><SubmitButton label={t('save')} pendingLabel={t('saving')} /></div>
    </form>
  );
}
