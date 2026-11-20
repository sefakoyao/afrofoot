import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SuggestionList } from '@/components/content/SuggestionList';

export async function generateMetadata(): Promise<Metadata> { return { title: (await getTranslations('content'))('title') }; }
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <SuggestionList base="/content" isAdmin={false} sp={await searchParams} />;
}
