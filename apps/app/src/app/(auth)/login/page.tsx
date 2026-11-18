import { FifaBadge } from '@afrofoot/ui/fifa-badge';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getMember, homeFor } from '@/lib/auth';
import { safeNext } from '@/lib/paths';
import { SocialSignIn } from '@/components/SocialSignIn';
import Link from 'next/link';
import { enabledProviders, phoneEnabled } from '@/lib/auth-providers';
import { webUrl } from '@/lib/env';
import { LoginForm } from './LoginForm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('signIn') };
}

/** ?reason= comes from the middleware, area guards and email links; only known values are shown. */
const REASONS: Record<string, string> = {
  blocked: 'blocked', pending: 'pending', suspended: 'suspended', link: 'linkProblem', unavailable: 'unavailable',
  oauthCancelled: 'oauthCancelled', oauthFailed: 'oauthFailed', oauthNoEmail: 'oauthNoEmail',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const member = await getMember();
  if (member?.status === 'active') redirect(homeFor(member.role)); // already signed in
  const t = await getTranslations('auth');
  const reason = typeof q.reason === 'string' ? REASONS[q.reason] : undefined;
  const next = safeNext(q.next) ?? undefined;
  const [providers, phone] = await Promise.all([enabledProviders(), phoneEnabled()]);
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold">{t('signInTitle')}</h1>
      <p className="mb-5 mt-1 text-muted">{t('signInLead')}</p>
      <LoginForm next={next} notice={reason ?? (member ? member.status : undefined)} />
      {phone ? (
        <Link href={next ? `/login/phone?next=${encodeURIComponent(next)}` : '/login/phone'} data-phone-signin
          className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-fg px-6 font-display font-bold hover:bg-fg hover:text-raised">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" strokeLinecap="round" /></svg>
          {t('usePhone')}
        </Link>
      ) : null}
      <SocialSignIn providers={providers} next={next} />
      <div className="mt-6 rounded-card border border-line bg-surface p-4 text-center" data-signup-cta>
        <p className="font-semibold">{t('noAccount')}</p>
        <Link href="/signup" className="mt-2 inline-flex min-h-11 items-center rounded-full bg-ink-950 px-6 font-display font-bold text-white hover:brightness-125" data-signup-link>{t('signUp')}</Link>
      </div>
      <p className="mt-5 text-center"><FifaBadge label={t('fifaId')} tone="light" /></p>
      <p className="mt-3 text-center text-xs text-muted"><a href={`${webUrl()}/privacy`} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-pitch" data-privacy-link>{t('privacy')}</a></p>
    </>
  );
}
