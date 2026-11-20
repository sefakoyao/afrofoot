import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EventsView } from '@/components/staff/EventsView';
import { coachScope } from '@/lib/staff';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('events'))('adminTitle') };
}

/** Coach → Teams & events → Events: whole-club events and the coach's own teams (components/staff/EventsView). */
export default async function CoachEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [scope, sp] = await Promise.all([coachScope(), searchParams]);
  return <EventsView sp={sp} scope={scope} />;
}
