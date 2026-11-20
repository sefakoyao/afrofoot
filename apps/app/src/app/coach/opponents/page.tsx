import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OpponentsView } from '@/components/staff/OpponentsView';
import { coachScope } from '@/lib/staff';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('opp'))('title') };
}

/** Coach → Teams & events → Opponents: the names in use, read only (components/staff/OpponentsView). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [scope, sp] = await Promise.all([coachScope(), searchParams]);
  return <OpponentsView sp={sp} scope={scope} />;
}
