import { SuggestionReview } from '@/components/content/SuggestionReview';
import { requireArea } from '@/lib/auth';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  return <SuggestionReview base="/admin/content" id={(await params).id} sp={await searchParams} />;
}
