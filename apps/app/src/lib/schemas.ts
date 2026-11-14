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
