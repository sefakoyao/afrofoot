import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ShirtsView } from '@/components/staff/ShirtsView';
import { coachScope } from '@/lib/staff';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('shirt'))('adminTitle') };
}

/** Coach → Teams & events → Shirt numbers of the coach's teams (components/staff/ShirtsView). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [scope, sp] = await Promise.all([coachScope(), searchParams]);
  return <ShirtsView sp={sp} scope={scope} />;
}
