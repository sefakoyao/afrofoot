import { NewsEditor } from '@/components/content/NewsPages';
import { requireArea } from '@/lib/auth';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  return <NewsEditor base="/admin/content" id={(await params).id} sp={await searchParams} />;
}
