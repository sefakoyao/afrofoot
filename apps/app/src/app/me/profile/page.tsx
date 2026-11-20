import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProfileView } from '@/components/profile/ProfileView';
import { requireArea } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('me'))('tabProfile') };
}

/** Player area → Profile: the same profile page as /account (components/profile/ProfileView), in the player frame. */
export default async function PlayerProfilePage({ searchParams }: { searchParams: Promise<{ website?: string; reminders?: string; result?: string }> }) {
  const member = await requireArea('me');
  return <ProfileView member={member} sp={await searchParams} back="/me/profile" />;
}
