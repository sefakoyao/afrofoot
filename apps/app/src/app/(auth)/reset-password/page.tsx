import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getSupabase } from '@/lib/supabase/server';
import { getMember, homeFor } from '@/lib/auth';
import { Alert } from '@/components/fields';
import { ResetForm } from './ResetForm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('resetTitle') };
}

/** Reached from the recovery email through /auth/confirm, which signs the user in for this step. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const t = await getTranslations('auth');
  const { error } = await searchParams;
  const supabase = await getSupabase();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const member = user ? await getMember() : null;
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold">{t('resetTitle')}</h1>
      {user && !error ? (
        <>
          <p className="mb-5 mt-1 text-muted">{t('resetLead')}</p>
          <ResetForm home={member?.status === 'active' ? homeFor(member.role) : '/login'} />
        </>
      ) : (
        <div className="mt-4 grid gap-4">
          <Alert tone="error">{t('linkInvalid')}</Alert>
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110">{t('requestNewLink')}</Link>
          <p className="text-center text-sm"><Link href="/login" className="font-semibold text-pitch underline underline-offset-2">{t('backToSignIn')}</Link></p>
        </div>
      )}
    </>
  );
}
