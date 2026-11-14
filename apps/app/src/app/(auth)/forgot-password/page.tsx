import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForgotForm } from './ForgotForm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('forgotTitle') };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth');
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold">{t('forgotTitle')}</h1>
      <p className="mb-5 mt-1 text-muted">{t('forgotLead')}</p>
      <ForgotForm />
    </>
  );
}
