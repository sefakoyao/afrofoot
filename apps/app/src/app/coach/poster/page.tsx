import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PosterView } from '@/components/staff/PosterView';
import { coachScope } from '@/lib/staff';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('poster'))('title') };
}

/** Coach → Website → Matchday poster for the coach's teams' games (components/staff/PosterView). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [scope, sp] = await Promise.all([coachScope(), searchParams]);
  return <PosterView sp={sp} scope={scope} />;
}
