import { NewsList } from '@/components/content/NewsPages';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <NewsList base="/content" sp={await searchParams} />;
}
