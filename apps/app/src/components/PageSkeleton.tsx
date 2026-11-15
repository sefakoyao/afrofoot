import { getTranslations } from 'next-intl/server';

/**
 * Shown the instant a page inside an area is opened (loading.tsx), while the server reads its data: grey cards in the
 * shape of a page, so the tap is answered at once. Screen readers hear "Loading…".
 */
export async function PageSkeleton({ cards = 3 }: { cards?: number }) {
  const t = await getTranslations('common');
  return (
    <div className="grid gap-4" role="status" aria-live="polite" data-page-skeleton>
      <span className="sr-only">{t('loading')}</span>
      <div aria-hidden className="h-7 w-48 animate-pulse rounded-full bg-line motion-reduce:animate-none" />
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} aria-hidden className="grid gap-3 rounded-card border border-line bg-raised p-5">
          <div className="h-4 w-1/3 animate-pulse rounded-full bg-line motion-reduce:animate-none" />
          <div className="h-4 w-5/6 animate-pulse rounded-full bg-line/70 motion-reduce:animate-none" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-line/70 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
