import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getMember, homeFor } from '@/lib/auth';
import { webUrl } from '@/lib/env';
import { safeNext } from '@/lib/paths';
import { LoginForm } from './LoginForm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('signIn') };
}

/** ?reason= comes from the middleware, area guards and email links; only known values are shown. */
const REASONS: Record<string, string> = { blocked: 'blocked', pending: 'pending', suspended: 'suspended', link: 'linkProblem', unavailable: 'unavailable' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const member = await getMember();
  if (member?.status === 'active') redirect(homeFor(member.role)); // already signed in
  const t = await getTranslations('auth');
  const reason = typeof q.reason === 'string' ? REASONS[q.reason] : undefined;
  const next = safeNext(q.next) ?? undefined;
  return (
    <>
      <h1 className="font-display text-2xl font-extrabold">{t('signInTitle')}</h1>
      <p className="mb-5 mt-1 text-muted">{t('signInLead')}</p>
      <LoginForm next={next} notice={reason ?? (member ? member.status : undefined)} webUrl={webUrl()} />
    </>
  );
}
