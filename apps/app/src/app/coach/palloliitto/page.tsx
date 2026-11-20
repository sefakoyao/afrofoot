import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PalloliittoView } from '@/components/staff/PalloliittoView';
import { coachScope } from '@/lib/staff';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('fed'))('linkTitle') };
}

/** Coach → Teams & events → Palloliitto players, read only (components/staff/PalloliittoView). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [scope, sp] = await Promise.all([coachScope(), searchParams]);
  return <PalloliittoView sp={sp} scope={scope} />;
}
