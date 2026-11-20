import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TasksView } from '@/components/staff/TasksView';
import { coachScope } from '@/lib/staff';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('tasks'))('adminTitle') };
}

/** Coach → Teams & events → Tasks of the coach's next games and trainings, and the task types (components/staff/TasksView). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [scope, sp] = await Promise.all([coachScope(), searchParams]);
  return <TasksView sp={sp} scope={scope} />;
}
