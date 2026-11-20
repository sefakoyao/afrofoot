import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PalloliittoView } from '@/components/staff/PalloliittoView';
import { requireArea } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('fed'))('linkTitle') };
}

/** Admin → Teams & events → Palloliitto players (components/staff/PalloliittoView). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  return <PalloliittoView sp={await searchParams} scope={{ area: 'admin' }} />;
}
