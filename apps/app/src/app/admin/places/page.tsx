import { requireArea } from '@/lib/auth';
import { PlacesManager } from '@/components/places/PlacesManager';

/** Saved places: add and edit pitches, halls and gyms (migration 0039). */
export default async function Page({ searchParams }: { searchParams: Promise<{ result?: string; place?: string }> }) {
  await requireArea('admin');
  const sp = await searchParams;
  return <PlacesManager area="admin" result={sp.result} focus={sp.place} />;
}
