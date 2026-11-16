'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { savePlayerProfile, type PlayerProfileState } from '@/app/actions/player';
import { Alert, Field, SubmitButton, inputClass } from '@/components/fields';
import { RELATIONS, isRelation } from '@/lib/relations';

const IDLE: PlayerProfileState = { status: 'idle' };
type Values = Record<'preferred_foot' | 'height_cm' | 'weight_kg' | 'phone' | 'emergency_name' | 'emergency_relation' | 'emergency_phone', string>;

export function PlayerProfileForm({ initial }: { initial: Values }) {
  const t = useTranslations('pp');
  const [state, action] = useActionState(savePlayerProfile, IDLE);
  const err = state.status === 'error' ? state.error : null;
  const v = { ...initial, ...(state.status === 'error' ? state.values : {}) } as Values; // keep what was typed after an error
  const bad = (k: string) => err === k || undefined;
  const tr = useTranslations('relation');
  // a value from the list, or "other" with what was written (also for values typed before the list existed)
  const initialPick = !v.emergency_relation ? '' : isRelation(v.emergency_relation) ? v.emergency_relation : 'other';
  const [pick, setPick] = useState(initialPick);
  return (
    <form action={action} className="grid gap-5">
      {state.status === 'ok' ? <Alert tone="ok">{t('saved')}</Alert> : null}
      {err ? <Alert tone="error">{t(err)}</Alert> : null}

      <fieldset className="grid gap-4">
        <legend className="mb-1 font-display text-lg font-extrabold">{t('sportTitle')}</legend>
        <div className="grid gap-1">
          <label htmlFor="preferred_foot" className="text-sm font-semibold">{t('foot')}</label>
          <select key={v.preferred_foot} id="preferred_foot" name="preferred_foot" defaultValue={v.preferred_foot} className={inputClass}>
            <option value="">–</option>
            <option value="right">{t('foot_right')}</option><option value="left">{t('foot_left')}</option><option value="both">{t('foot_both')}</option>
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('height')} name="height_cm" inputMode="numeric" defaultValue={v.height_cm} maxLength={3} aria-invalid={bad('e_height')} />
          <Field label={t('weight')} name="weight_kg" inputMode="numeric" defaultValue={v.weight_kg} maxLength={3} aria-invalid={bad('e_weight')} />
        </div>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-1 font-display text-lg font-extrabold">{t('contactTitle')}</legend>
        <Field label={t('phone')} name="phone" type="tel" inputMode="tel" dir="ltr" defaultValue={v.phone} autoComplete="tel" placeholder="+358 40 123 4567"
          hint={t('phoneHint')} maxLength={30} aria-invalid={bad('e_phone')} />
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-1 font-display text-lg font-extrabold">{t('emergencyTitle')}</legend>
        <p className="-mt-2 text-sm text-muted">{t('emergencyLead')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('emergencyName')} name="emergency_name" defaultValue={v.emergency_name} maxLength={120} autoComplete="off" aria-invalid={bad('e_emergency')} />
          <div className="grid gap-1">
            <label htmlFor="emergency_relation" className="text-sm font-semibold">{t('emergencyRelation')}</label>
            <select id="emergency_relation" name="emergency_relation" value={pick} onChange={(e) => setPick(e.target.value)} className={inputClass} data-relation>
              <option value="">{t('relationChoose')}</option>
              {RELATIONS.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
              <option value="other">{tr('other')}</option>
            </select>
            {pick === 'other' ? (
              <input name="emergency_relation_other" aria-label={t('relationOther')} placeholder={t('relationOther')} maxLength={60}
                defaultValue={isRelation(v.emergency_relation) || v.emergency_relation === 'other' ? '' : v.emergency_relation} className={`${inputClass} mt-2`} data-relation-other />
            ) : null}
          </div>
        </div>
        <Field label={t('emergencyPhone')} name="emergency_phone" type="tel" inputMode="tel" dir="ltr" defaultValue={v.emergency_phone} placeholder="+358 40 123 4567"
          maxLength={30} aria-invalid={bad('e_emergencyPhone')} />
      </fieldset>

      <div className="sm:w-60"><SubmitButton label={t('save')} pendingLabel={t('saving')} /></div>
    </form>
  );
}
