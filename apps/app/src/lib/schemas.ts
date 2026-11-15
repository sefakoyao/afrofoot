import { z } from 'zod';

/**
 * Server-side validation for the auth forms. Limits mirror Supabase Auth: minimum_password_length = 10 (supabase/config.toml)
 * and bcrypt's 72-byte maximum; email length mirrors profiles.email. Error messages are i18n keys under `auth.*`.
 */
export const email = z.string().trim().toLowerCase().min(1, 'invalidEmail').max(200, 'invalidEmail')
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'invalidEmail');

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;
export const newPassword = z.string().min(10, 'passwordTooShort').refine((v) => utf8Bytes(v) <= 72, 'passwordTooLong');

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'passwordRequired').max(200, 'invalidCredentials'),
  next: z.string().optional(),
});

export const forgotSchema = z.object({ email });

export const resetSchema = z.object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'passwordMismatch', path: ['confirm'] });

/** Own profile, mirroring the profiles constraints: names up to 80 characters, phone with country code (0024), locale en/fi/fr/ar (0012). */
export const profileSchema = z.object({
  first_name: z.string().trim().min(1, 'e_name').max(80, 'e_name'),
  last_name: z.string().trim().min(1, 'e_name').max(80, 'e_name'),
  phone: z.string().trim().max(30, 'e_phone').transform((v) => v.replace(/[ ()-]/g, ''))
    .refine((v) => v === '' || /^\+[1-9][0-9]{6,14}$/.test(v), 'e_phone').transform((v) => v || null),
  locale: z.enum(['en', 'fi', 'fr', 'ar']),
});
