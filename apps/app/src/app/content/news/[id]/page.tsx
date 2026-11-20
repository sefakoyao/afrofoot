import { NewsEditor } from '@/components/content/NewsPages';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <NewsEditor base="/content" id={(await params).id} sp={await searchParams} />;
}
