import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ProfileView } from '@/components/profile/ProfileView';
import { homeFor, requireMember } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('account'))('title') };
}

/**
 * My account (the name in the header): the member's one profile page (components/profile/ProfileView). A coach and a
 * player-coach see the same page; a player-coach's player details are on it too, as on the player area's Profile tab.
 */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ website?: string; reminders?: string; result?: string }> }) {
  const member = await requireMember('/account');
  const t = await getTranslations('account');
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5">
      <Link href={homeFor(member.role)} className="text-sm font-semibold text-pitch underline underline-offset-2">← {t('back')}</Link>
      <ProfileView member={member} sp={await searchParams} back="/account" />
    </div>
  );
}
