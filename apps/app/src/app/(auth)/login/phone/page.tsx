import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PhoneForm } from '@/components/signup/SignUpForms';
import { getMember, homeFor } from '@/lib/auth';
import { phoneEnabled } from '@/lib/auth-providers';
import { webUrl } from '@/lib/env';
import { safeNext } from '@/lib/paths';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('phoneSignInTitle') };
}

/** Sign in with a phone number: a code by text message (members who signed up with their phone have no password). */
export default async function PhoneSignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const member = await getMember();
  if (member?.status === 'active') redirect(homeFor(member.role));
  if (!(await phoneEnabled())) redirect('/login');
  const t = await getTranslations('auth');
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold">{t('phoneSignInTitle')}</h1>
      <p className="mb-5 mt-1 text-muted">{t('phoneSignInLead')}</p>
      <PhoneForm mode="signin" privacyHref={`${webUrl()}/privacy`} next={safeNext(q.next) ?? undefined} />
      <p className="mt-6 text-center text-sm">{t('noAccount')} <Link href="/signup?with=phone" className="font-semibold text-pitch underline underline-offset-2">{t('signUp')}</Link></p>
    </>
  );
}
