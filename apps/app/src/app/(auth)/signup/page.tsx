import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/fields';
import { SocialSignIn } from '@/components/SocialSignIn';
import { EmailSignUpForm, PhoneForm } from '@/components/signup/SignUpForms';
import { getMember, homeFor } from '@/lib/auth';
import { enabledProviders, phoneEnabled } from '@/lib/auth-providers';
import { webUrl } from '@/lib/env';
import { newChallenge } from '@/lib/robot-check';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('signUpTitle') };
}

/**
 * Create an account: email and password, or a phone number (code by text message) once Phone is switched on in Supabase.
 * Google / Facebook below when set up. Every new account waits for approval; the football robot check guards both forms.
 */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const member = await getMember();
  if (member?.status === 'active') redirect(homeFor(member.role));
  const [t, phone, providers] = await Promise.all([getTranslations('auth'), phoneEnabled(), enabledProviders()]);
  const withPhone = phone && q.with === 'phone';
  const challenge = newChallenge();
  const privacyHref = `${webUrl()}/privacy`;
  const tab = (active: boolean) => `flex min-h-11 flex-1 items-center justify-center rounded-full px-4 font-bold transition active:scale-[.98] ${active ? 'bg-ink-950 text-white' : 'text-fg hover:bg-accent/10'}`;
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold">{t('signUpTitle')}</h1>
      <p className="mb-5 mt-1 text-muted">{t('signUpLead')}</p>
      {!challenge ? <Alert tone="info"><span data-signup-closed>{t('signUpClosed')}</span></Alert> : (
        <>
          {phone ? (
            <nav aria-label={t('signUpWith')} className="mb-5 flex gap-1 rounded-full border border-line bg-surface p-1 text-sm">
              <Link href="/signup" aria-current={!withPhone ? 'page' : undefined} className={tab(!withPhone)} data-tab="email">{t('withEmail')}</Link>
              <Link href="/signup?with=phone" aria-current={withPhone ? 'page' : undefined} className={tab(withPhone)} data-tab="phone">{t('withPhone')}</Link>
            </nav>
          ) : null}
          {withPhone ? <PhoneForm mode="signup" challenge={challenge} privacyHref={privacyHref} /> : <EmailSignUpForm challenge={challenge} privacyHref={privacyHref} />}
          <SocialSignIn providers={providers} />
        </>
      )}
      <p className="mt-6 text-center text-sm">{t('haveAccount')} <Link href="/login" className="font-semibold text-pitch underline underline-offset-2" data-signin-link>{t('signIn')}</Link></p>
    </>
  );
}
