import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SuggestionList } from '@/components/content/SuggestionList';
import { requireArea } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> { return { title: (await getTranslations('content'))('title') }; }
/** Admin → Website → Suggestions (content assistant, migration 0064). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  return <SuggestionList base="/admin/content" isAdmin sp={await searchParams} />;
}
