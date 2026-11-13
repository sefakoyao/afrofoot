'use client';

import { useActionState, useState } from 'react';
import { submitContact, submitEnrolment, submitInvoice, submitSponsor, submitTryout } from '@/app/actions';
import { IDLE, type FormState } from '@/lib/formState';
import { ageOn } from '@/lib/schemas';
import { Check, DatePicker, Field, Honeypot, type Labels, PhoneInput, Result, Select, SubmitRow, TextArea, TextInput } from './fields';

interface Common { labels: Labels; locale: string; intl: string }
type Action = (s: FormState, fd: FormData) => Promise<FormState>;
const grid = 'grid gap-3 sm:grid-cols-2';
const useForm = (a: Action) => useActionState(a, IDLE);

const POSITIONS = [['goalkeeper', 'position_gk'], ['defender', 'position_df'], ['midfielder', 'position_mf'], ['forward', 'position_fw']] as const;
const PositionSelect = ({ labels }: { labels: Labels }) => (
  <Select name="position" required defaultValue="">
    <option value="">{labels.none}</option>
    {POSITIONS.map(([v, k]) => <option key={v} value={v}>{labels[k]}</option>)}
  </Select>
);

export function ContactForm({ labels, locale }: Common) {
  const [state, action, pending] = useForm(submitContact);
  return (
    <form action={action} className="relative">
      <input type="hidden" name="locale" value={locale} /><Honeypot />
      <div className={grid}>
        <Field label={labels.ct_name} required><TextInput name="name" autoComplete="name" maxLength={120} required /></Field>
        <Field label={labels.tr_email} required><TextInput name="email" type="email" autoComplete="email" required /></Field>
        <Field label={labels.ct_topic} wide>
          <Select name="topic" defaultValue="general">
            <option value="general">{labels.ct_t_g}</option><option value="join">{labels.ct_t_j}</option>
            <option value="partnership">{labels.ct_t_p}</option><option value="media">{labels.ct_t_m}</option>
          </Select>
        </Field>
        <Field label={labels.tr_msg} required wide><TextArea name="message" rows={5} maxLength={4000} required /></Field>
      </div>
      <Result state={state} labels={labels} okKey="ct_ok" />
      <SubmitRow pending={pending} label={labels.ct_send} />
    </form>
  );
}

export function SponsorForm({ labels, locale, packages }: Common & { packages: string[] }) {
  const [state, action, pending] = useForm(submitSponsor);
  return (
    <form action={action} className="relative">
      <input type="hidden" name="locale" value={locale} /><Honeypot />
      <div className={grid}>
        <Field label={labels.sp_company} required><TextInput name="company" maxLength={120} required /></Field>
        <Field label={labels.sp_contact} required><TextInput name="name" maxLength={120} autoComplete="name" required /></Field>
        <Field label={labels.tr_email} required><TextInput name="email" type="email" autoComplete="email" required /></Field>
        <Field label={labels.sp_pkg}><Select name="package">{packages.map((p) => <option key={p}>{p}</option>)}</Select></Field>
        <Field label={labels.tr_msg} wide><TextArea name="message" rows={4} maxLength={3900} /></Field>
      </div>
      <Result state={state} labels={labels} okKey="sp_ok" />
      <SubmitRow pending={pending} label={labels.sp_send} />
    </form>
  );
}

/** Guardian block, shown only while the entered birth date makes the player under 18. */
function Guardian({ labels, show, required }: { labels: Labels; show: boolean; required: boolean }) {
  return (
    <div hidden={!show} className="mt-4">
      <p className="font-semibold">{labels.tr_g}</p>
      <div className={grid}>
        <Field label={labels.tr_gn} required={required}><TextInput name="guardian_name" /></Field>
        <Field label={labels.tr_gp} required={required}><PhoneInput name="guardian_phone" labels={labels} /></Field>
      </div>
    </div>
  );
}

const minor = (iso: string) => iso !== '' && ageOn(iso) < 18;

export function TryoutForm({ labels, locale, intl }: Common) {
  const [state, action, pending] = useForm(submitTryout);
  const [isMinor, setMinor] = useState(false);
  return (
    <form action={action} className="relative">
      <input type="hidden" name="locale" value={locale} /><Honeypot />
      <div className={grid}>
        <Field label={labels.tr_first} required><TextInput name="first_name" autoComplete="given-name" required /></Field>
        <Field label={labels.tr_last} required><TextInput name="last_name" autoComplete="family-name" required /></Field>
        <Field label={labels.tr_dob} required><DatePicker name="dob" labels={labels} locale={intl} required onChange={(v) => setMinor(minor(v))} /></Field>
        <Field label={labels.tr_pos} required><PositionSelect labels={labels} /></Field>
        <Field label={labels.tr_prev}><TextInput name="previous_team" maxLength={120} /></Field>
        <Field label={labels.tr_url} wide hint={labels.tr_url_h}><TextInput name="palloliitto_url" inputMode="url" placeholder="https://tulospalvelu.palloliitto.fi/…" /></Field>
        <Field label={labels.tr_email} required><TextInput name="email" type="email" autoComplete="email" required /></Field>
        <Field label={labels.tr_phone} required><PhoneInput name="phone" labels={labels} required /></Field>
      </div>
      <Guardian labels={labels} show={isMinor} required={isMinor} />
      <Field label={labels.tr_msg} wide><TextArea name="message" rows={3} maxLength={2000} /></Field>
      <Check name="consent" label={labels.tr_consent} required />
      <Result state={state} labels={labels} okKey="tr_ok" />
      <SubmitRow pending={pending} label={labels.tr_send} />
    </form>
  );
}

const PLAN_KEYS = { m: 'per_m', q: 'per_q', y: 'per_y' } as const;
const METHODS = [['mobilepay', 'm_mp'], ['bank_transfer', 'm_wire'], ['invoice', 'm_inv']] as const;

export interface PlanView { code: 'm' | 'q' | 'y'; amountEur: number }

/** Four-step enrolment: player, contact, plan and payment, summary. Every field stays in the form so all steps submit together. */
export function EnrolmentForm({ labels, locale, intl, plans, countries }: Common & { plans: PlanView[]; countries: { code: string; name: string; common: boolean }[] }) {
  const [state, action, pending] = useForm(submitEnrolment);
  const [step, setStep] = useState(1);
  const [isMinor, setMinor] = useState(false);
  const [plan, setPlan] = useState('');
  const [method, setMethod] = useState('');
  const [stepError, setStepError] = useState<string | undefined>('');
  const steps = [labels.en_s1, labels.en_s2, labels.en_s3, labels.en_s4];

  const next = (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.form!;
    const scope = form.querySelector<HTMLElement>(`[data-step="${step}"]`)!;
    const bad = [...scope.querySelectorAll<HTMLInputElement>('input[required],select[required]')].some((el) => !el.value);
    if (step === 3 && (!plan || !method)) { setStepError(labels.en_e_plan); return; }
    if (bad) { setStepError(labels.tr_e_req); return; }
    setStepError(''); setStep((s) => s + 1);
  };

  if (state.status === 'ok') return <div className="py-8 text-center"><p className="font-display text-2xl font-extrabold text-pitch">{labels.en_done_h}</p><p className="mt-2">{labels.en_done}</p></div>;

  return (
    <form action={action} className="relative">
      <input type="hidden" name="locale" value={locale} /><Honeypot />
      <input type="hidden" name="plan" value={plan} /><input type="hidden" name="payment_method" value={method} />
      <ol className="mb-4 flex flex-wrap gap-2 text-sm font-semibold" aria-label={labels.en_step}>
        {steps.map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? 'step' : undefined}
            className={`rounded-full px-3 py-1 ${step === i + 1 ? 'bg-accent text-on-accent' : 'bg-line/60 text-muted'}`}>{i + 1}. {s}</li>
        ))}
      </ol>

      <div data-step="1" hidden={step !== 1} className={grid}>
        <Field label={labels.tr_first} required><TextInput name="first_name" autoComplete="given-name" required /></Field>
        <Field label={labels.tr_last} required><TextInput name="last_name" autoComplete="family-name" required /></Field>
        <Field label={labels.tr_dob} required><DatePicker name="dob" labels={labels} locale={intl} required onChange={(v) => setMinor(minor(v))} /></Field>
        <Field label={labels.en_nat}>
          <Select name="nationality" autoComplete="country" defaultValue="">
            <option value="">{labels.none}</option>
            {countries.filter((c) => c.common).map((c) => <option key={`c${c.code}`} value={c.code}>{c.name}</option>)}
            <option disabled>──────────</option>
            {countries.filter((c) => !c.common).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label={labels.tr_pos} required><PositionSelect labels={labels} /></Field>
        <Field label={labels.tr_prev}><TextInput name="previous_team" maxLength={120} /></Field>
        <Field label={labels.tr_url} wide hint={labels.tr_url_h}><TextInput name="palloliitto_url" inputMode="url" placeholder="https://tulospalvelu.palloliitto.fi/…" /></Field>
      </div>

      <div data-step="2" hidden={step !== 2}>
        <div className={grid}>
          <Field label={labels.tr_email} required><TextInput name="email" type="email" autoComplete="email" required /></Field>
          <Field label={labels.tr_phone} required><PhoneInput name="phone" labels={labels} required /></Field>
          <Field label={labels.en_addr}><TextInput name="address" autoComplete="street-address" maxLength={200} /></Field>
          <Field label={labels.en_city}><TextInput name="city" autoComplete="address-level2" maxLength={80} /></Field>
        </div>
        <Guardian labels={labels} show={isMinor} required={isMinor} />
      </div>

      <div data-step="3" hidden={step !== 3}>
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted">{labels.en_plan}</h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-3" role="group">
          {plans.map((p) => (
            <button key={p.code} type="button" aria-pressed={plan === p.code} onClick={() => setPlan(p.code)}
              className={`rounded-card border-2 p-3 text-start ${plan === p.code ? 'border-accent bg-accent/10' : 'border-line'}`}>
              <b className="block">{labels[PLAN_KEYS[p.code]]}</b><span>{p.amountEur} €</span>
            </button>
          ))}
        </div>
        <h4 className="mt-5 text-xs font-bold uppercase tracking-widest text-muted">{labels.pay_method}</h4>
        <div className="mt-2 grid gap-2 sm:grid-cols-3" role="group">
          {METHODS.map(([v, k]) => (
            <button key={v} type="button" aria-pressed={method === v} onClick={() => setMethod(v)}
              className={`rounded-card border-2 p-3 text-start ${method === v ? 'border-accent bg-accent/10' : 'border-line'}`}><b>{labels[k]}</b></button>
          ))}
        </div>
      </div>

      <div data-step="4" hidden={step !== 4}>
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted">{labels.en_plan}</dt><dd className="font-semibold">{plan ? labels[PLAN_KEYS[plan as 'm']] : '–'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">{labels.pay_method}</dt><dd className="font-semibold">{METHODS.find(([v]) => v === method) ? labels[METHODS.find(([v]) => v === method)![1]] : '–'}</dd></div>
        </dl>
        <Check name="terms" label={labels.en_terms} required />
        <Check name="privacy" label={labels.en_priv} required />
        <Check name="photo_consent" label={labels.en_photo} />
        <Check name="public_listing" label={labels.en_pub} />
      </div>

      {stepError ? <p role="alert" className="mt-4 text-sm font-semibold text-danger">{stepError}</p> : null}
      <Result state={state} labels={labels} okKey="en_done" />
      <p className="mt-3 text-xs text-muted">{labels.tr_req}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {step > 1 ? <button type="button" onClick={() => { setStepError(''); setStep(step - 1); }} className="rounded-full border-2 border-fg px-5 py-2 font-display font-bold">{labels.en_back}</button> : null}
        {step < 4
          ? <button type="button" onClick={next} className="rounded-full bg-accent px-6 py-2.5 font-display font-bold text-on-accent hover:brightness-110">{labels.en_next}</button>
          : <button type="submit" disabled={pending} className="rounded-full bg-accent px-6 py-2.5 font-display font-bold text-on-accent hover:brightness-110 disabled:opacity-60">{labels.en_submit}</button>}
      </div>
    </form>
  );
}

export function InvoiceForm({ labels, locale, plans }: Common & { plans: PlanView[] }) {
  const [state, action, pending] = useForm(submitInvoice);
  const optKey = { m: 'inv_o_m', q: 'inv_o_q', y: 'inv_o_y' } as const;
  return (
    <form action={action} className="relative">
      <input type="hidden" name="locale" value={locale} /><Honeypot />
      <div className={grid}>
        <Field label={labels.inv_plan} required wide>
          <Select name="plan" defaultValue="m">{plans.map((p) => <option key={p.code} value={p.code}>{labels[optKey[p.code]]}</option>)}</Select>
        </Field>
        <Field label={labels.ct_name} required><TextInput name="full_name" autoComplete="name" maxLength={120} required /></Field>
        <Field label={labels.tr_email} required><TextInput name="email" type="email" autoComplete="email" required /></Field>
        <Field label={labels.inv_phone}><PhoneInput name="phone" labels={labels} /></Field>
        <Field label={labels.inv_player}><TextInput name="player_name" maxLength={120} /></Field>
        <Field label={labels.inv_addr} required wide><TextInput name="address" autoComplete="street-address" maxLength={200} required /></Field>
        <Field label={labels.inv_zip} required><TextInput name="postal_code" autoComplete="postal-code" maxLength={12} required /></Field>
        <Field label={labels.inv_city} required><TextInput name="city" autoComplete="address-level2" maxLength={80} required /></Field>
        <Field label={labels.inv_ref} wide><TextInput name="reference_note" maxLength={200} /></Field>
      </div>
      <Check name="consent" label={labels.inv_consent} required />
      <Result state={state} labels={labels} okKey="inv_ok" />
      <SubmitRow pending={pending} label={labels.inv_send} />
    </form>
  );
}
