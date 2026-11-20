import { NewsList } from '@/components/content/NewsPages';
import { requireArea } from '@/lib/auth';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  return <NewsList base="/admin/content" sp={await searchParams} />;
}
