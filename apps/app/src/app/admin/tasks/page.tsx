import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TasksView } from '@/components/staff/TasksView';
import { requireArea } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('tasks'))('adminTitle') };
}

/** Admin → Teams & events → Tasks (components/staff/TasksView). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  return <TasksView sp={await searchParams} scope={{ area: 'admin' }} />;
}
