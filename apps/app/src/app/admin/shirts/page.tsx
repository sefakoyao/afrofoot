import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ShirtsView } from '@/components/staff/ShirtsView';
import { requireArea } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('shirt'))('adminTitle') };
}

/** Admin → Teams & events → Shirt numbers (components/staff/ShirtsView). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  return <ShirtsView sp={await searchParams} scope={{ area: 'admin' }} />;
}
