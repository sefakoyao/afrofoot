import { SuggestionReview } from '@/components/content/SuggestionReview';

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <SuggestionReview base="/content" id={(await params).id} sp={await searchParams} />;
}
