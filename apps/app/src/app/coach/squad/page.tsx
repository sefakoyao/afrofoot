import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SquadView } from '@/components/staff/SquadView';
import { coachScope } from '@/lib/staff';

export async function generateMetadata(): Promise<Metadata> { return { title: (await getTranslations('squad'))('title') }; }

/** Coach → Teams & events → Squad planner: the teams this coach coaches (components/staff/SquadView). */
export default async function CoachSquadPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [scope, sp] = await Promise.all([coachScope(), searchParams]);
  return <SquadView sp={sp} scope={scope} />;
}
