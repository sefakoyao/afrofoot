import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PosterView } from '@/components/staff/PosterView';
import { requireArea } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('poster'))('title') };
}

/** Admin → Website → Matchday poster (components/staff/PosterView). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  return <PosterView sp={await searchParams} scope={{ area: 'admin' }} />;
}
