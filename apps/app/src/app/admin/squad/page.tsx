import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SquadView } from '@/components/staff/SquadView';
import { requireArea } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> { return { title: (await getTranslations('squad'))('title') }; }

/** Admin → Teams & events → Squad planner (components/staff/SquadView). */
export default async function AdminSquadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  return <SquadView sp={await searchParams} scope={{ area: 'admin' }} />;
}
