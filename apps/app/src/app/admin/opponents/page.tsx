import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OpponentsView } from '@/components/staff/OpponentsView';
import { requireArea } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('opp'))('title') };
}

/** Admin → Teams & events → Opponents (components/staff/OpponentsView). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  return <OpponentsView sp={await searchParams} scope={{ area: 'admin' }} />;
}
