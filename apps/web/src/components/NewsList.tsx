import { getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { Link } from '@/i18n/routing';
import { NewsCard } from './NewsCard';
import type { Post } from '@/lib/news';

export const newsPageHref = (n: number) => (n <= 1 ? '/news' : `/news/page/${n}`);

/** Page numbers to show: first, last, the current one and its neighbours; "…" for the gaps. */
function numbers(page: number, pages: number): (number | '…')[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) { if (n - prev > 1) out.push('…'); out.push(n); prev = n; }
  return out;
}

/** One page of news (9 articles) and the links to the other pages: ‹ Previous · 1 2 3 … · Next ›. */
export async function NewsList({ posts, page, pages, locale }: { posts: Post[]; page: number; pages: number; locale: Locale }) {
  const t = await getTranslations('site');
  const date = new Intl.DateTimeFormat(LOCALE_LABELS[locale].intl, { dateStyle: 'long', timeZone: 'Europe/Helsinki' });
  const pill = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-4 font-display font-bold';
  return (
    <>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" data-news-list={page}>
        {posts.map((p, i) => <NewsCard key={p.id} post={p} index={(page - 1) * 9 + i} locale={locale} date={date.format(new Date(p.published_at))} readMore={t('readmore')} />)}
      </div>
      {pages > 1 ? (
        <nav aria-label={t('news_pages')} className="mt-10 flex flex-wrap items-center justify-center gap-2" data-news-pager>
          {page > 1
            ? <Link href={newsPageHref(page - 1)} rel="prev" className={`${pill} border-2 border-fg hover:bg-fg hover:text-raised`} data-pager="prev"><span aria-hidden="true" className="me-1 rtl:-scale-x-100">‹</span>{t('news_prev')}</Link>
            : null}
          {numbers(page, pages).map((n, i) => n === '…'
            ? <span key={`gap${i}`} aria-hidden="true" className="px-1 text-muted">…</span>
            : n === page
              ? <span key={n} aria-current="page" className={`${pill} bg-accent text-on-accent`} data-pager-current={n}><span className="sr-only">{t('news_page', { n })}</span><span aria-hidden="true">{n}</span></span>
              : <Link key={n} href={newsPageHref(n)} aria-label={t('news_page', { n })} className={`${pill} border border-line bg-raised hover:border-accent`} data-pager-page={n}>{n}</Link>)}
          {page < pages
            ? <Link href={newsPageHref(page + 1)} rel="next" className={`${pill} bg-accent text-on-accent hover:brightness-110`} data-pager="next">{t('news_next')}<span aria-hidden="true" className="ms-1 rtl:-scale-x-100">›</span></Link>
            : null}
        </nav>
      ) : null}
    </>
  );
}
