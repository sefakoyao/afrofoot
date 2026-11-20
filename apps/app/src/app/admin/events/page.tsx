import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EventsView } from '@/components/staff/EventsView';
import { requireArea } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('events'))('adminTitle') };
}

/** Admin → Teams & events → Events: the whole club (components/staff/EventsView). */
export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  return <EventsView sp={await searchParams} scope={{ area: 'admin' }} />;
}
