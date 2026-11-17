import { isPlayerRole } from '@afrofoot/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { homeFor, requireMember } from '@/lib/auth';
import { ProfileForm } from './ProfileForm';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('account'))('title') };
}

export default async function AccountPage() {
  const member = await requireMember('/account');
  const [t, tr] = await Promise.all([getTranslations('account'), getTranslations('role')]);
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)] gap-5">
      <Link href={homeFor(member.role)} className="text-sm font-semibold text-pitch underline underline-offset-2">← {t('back')}</Link>
      <section className="rounded-card border border-line bg-raised p-6">
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 text-muted">{t('lead')}</p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {member.email ? <div><dt className="text-muted">{t('email')}</dt><dd className="font-semibold"><bdi>{member.email}</bdi></dd><dd className="text-xs text-muted">{t('emailNote')}</dd></div>
            : <div><dt className="text-muted">{t('signInPhone')}</dt><dd className="font-semibold" dir="ltr" style={{ textAlign: 'start' }}><bdi>{member.phone}</bdi></dd><dd className="text-xs text-muted">{t('signInPhoneNote')}</dd></div>}
          <div><dt className="text-muted">{t('role')}</dt><dd className="font-semibold">{tr(member.role)}</dd></div>
        </dl>
      </section>
      <section className="rounded-card border border-line bg-raised p-6">
        <ProfileForm showPhone={!isPlayerRole(member.role)} initial={{ first_name: member.firstName, last_name: member.lastName, phone: member.phone ?? '', locale: member.locale }} />
      </section>
      <section className="rounded-card border border-line bg-raised p-6">
        <h2 className="font-display text-lg font-extrabold">{t('passwordTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('passwordLead')}</p>
        <Link href="/reset-password" className="mt-3 inline-flex min-h-11 items-center rounded-full border-2 border-fg px-5 font-display font-bold hover:bg-fg hover:text-raised">{t('changePassword')}</Link>
      </section>
    </div>
  );
}
