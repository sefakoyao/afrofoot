import { z } from 'zod';
import { isCountryCode } from './countries';

/**
 * Server-side validation for the public forms. Each rule mirrors a database constraint
 * (migrations 0006, 0013, 0015, 0019, 0024, 0025), so the database stays the last line of defence.
 * Error messages are i18n keys under `site.*`, not text.
 */

const trimmed = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1, 'tr_e_req').max(max, 'tr_e_req');
const optional = (max: number) => trimmed(max).transform((v) => v || undefined).optional();

export const email = z.string().trim().max(200, 'tr_e_mail').regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'tr_e_mail');

/** International format: "+", a non-zero digit, 6 to 14 more digits. Spaces, dashes and brackets are allowed and removed. */
export const phone = z.string().trim()
  .transform((v) => v.replace(/[ ()-]/g, ''))
  .refine((v) => /^\+[1-9][0-9]{6,14}$/.test(v), 'ph_err');
const optionalPhone = z.string().trim().transform((v) => v.replace(/[ ()-]/g, '')).refine((v) => v === '' || /^\+[1-9][0-9]{6,14}$/.test(v), 'ph_err').transform((v) => v || undefined).optional();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'tr_e_req').refine((v) => !Number.isNaN(Date.parse(v)), 'tr_e_req');

export const ageOn = (iso: string, now = new Date()): number => {
  const d = new Date(`${iso}T00:00:00Z`);
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
};

/** Same window as the database: 1960-01-01 up to "today minus 5 x 365 days". */
export const dob = isoDate.refine((v) => {
  const d = new Date(`${v}T00:00:00Z`).getTime();
  return d >= Date.UTC(1960, 0, 1) && d <= Date.now() - 5 * 365 * 86_400_000;
}, 'tr_e_age');

export const palloliittoUrl = trimmed(300)
  .refine((v) => v === '' || /^https:\/\/tulospalvelu\.palloliitto\.fi(\/[^\s]*)?$/.test(v), 'tr_e_url')
  .transform((v) => v || undefined).optional();

export const position = z.enum(['goalkeeper', 'defender', 'midfielder', 'forward'], { errorMap: () => ({ message: 'tr_e_req' }) });
export const locale = z.enum(['en', 'fi', 'fr', 'ar']).catch('en');

/** Under 18: a guardian name and phone are required (database trigger app.check_tryout). */
const needGuardian = (v: { dob: string; guardian_name?: string; guardian_phone?: string }) => ageOn(v.dob) >= 18 || (!!v.guardian_name && !!v.guardian_phone);

export const contactSchema = z.object({
  name: required(120), email,
  topic: z.enum(['general', 'join', 'partnership', 'media']).catch('general'),
  message: z.string().trim().min(5, 'tr_e_req').max(4000, 'tr_e_req'),
  company: optional(120),
  locale,
});

export const tryoutSchema = z.object({
  first_name: required(80), last_name: required(80), dob, email, phone, position,
  previous_team: optional(120), palloliitto_url: palloliittoUrl,
  guardian_name: optional(120), guardian_phone: optionalPhone, message: optional(2000),
  consent: z.literal('on', { errorMap: () => ({ message: 'tr_e_c' }) }),
  locale,
}).refine(needGuardian, { message: 'tr_e_g' });

export const enrolmentSchema = z.object({
  first_name: required(80), last_name: required(80), dob, email, phone, position,
  nationality: z.string().trim().toUpperCase().refine((v) => v === '' || isCountryCode(v), 'tr_e_req').transform((v) => v || undefined).optional(),
  address: optional(200), city: optional(80),
  previous_team: optional(120), palloliitto_url: palloliittoUrl,
  guardian_name: optional(120), guardian_phone: optionalPhone,
  plan: z.enum(['m', 'q', 'y'], { errorMap: () => ({ message: 'en_e_plan' }) }),
  payment_method: z.enum(['mobilepay', 'bank_transfer', 'invoice'], { errorMap: () => ({ message: 'en_e_plan' }) }),
  terms: z.literal('on', { errorMap: () => ({ message: 'en_e_terms' }) }),
  privacy: z.literal('on', { errorMap: () => ({ message: 'en_e_terms' }) }),
  photo_consent: z.string().optional(), public_listing: z.string().optional(),
  locale,
}).refine(needGuardian, { message: 'tr_e_g' });

export const invoiceSchema = z.object({
  plan: z.enum(['m', 'q', 'y']),
  full_name: z.string().trim().min(2, 'tr_e_req').max(120, 'tr_e_req'),
  email, phone: optionalPhone, player_name: optional(120),
  address: z.string().trim().min(3, 'tr_e_req').max(200, 'tr_e_req'),
  postal_code: z.string().trim().min(2, 'tr_e_req').max(12, 'tr_e_req'),
  city: z.string().trim().min(2, 'tr_e_req').max(80, 'tr_e_req'),
  reference_note: optional(200),
  consent: z.literal('on', { errorMap: () => ({ message: 'tr_e_c' }) }),
  locale,
});
