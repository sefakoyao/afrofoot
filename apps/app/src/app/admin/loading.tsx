import { PageSkeleton } from '@/components/PageSkeleton';

/** Instant placeholder while the page's data loads (also prefetched, so a tap shows it straight away). */
export default function Loading() {
  return <PageSkeleton />;
}
