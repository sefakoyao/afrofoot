import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { NewsList } from '@/components/NewsList';
import { Hero, Section } from '@/components/Page';
import { getPostsPage } from '@/lib/news';
import { localePath, pageMeta } from '@/lib/seo';

// Rebuilt at most once a minute, like page 1.
export const revalidate = 60;

const pageNumber = (raw: string) => (/^\d{1,4}$/.test(raw) ? Number(raw) : NaN);

export async function generateMetadata({ params }: { params: Promise<{ locale: string; n: string }> }): Promise<Metadata> {
  const { locale, n } = await params;
  const page = pageNumber(n);
  if (!(page >= 2)) return {};
  const t = await getTranslations({ locale, namespace: 'site' });
  return pageMeta({ locale, path: `/news/page/${page}`, title: `${t('n_news')} – ${t('news_page', { n: page })}`, description: t('seo_news') });
}

/** News, page 2 and later (9 articles each). Page 1 is /news; a page past the end does not exist. */
export default async function NewsPageN({ params }: { params: Promise<{ locale: string; n: string }> }) {
  const { locale, n } = await params;
  setRequestLocale(locale);
  const page = pageNumber(n);
  const l = (locale in LOCALE_LABELS ? locale : 'en') as Locale;
  if (page === 1) redirect(localePath(l, '/news'));
  if (!(page >= 2)) notFound();
  const { posts, pages } = await getPostsPage(page);
  if (page > pages || posts.length === 0) notFound();
  const t = await getTranslations('site');
  return (
    <>
      <Hero title={t('n_news')} lead={t('news_pageOf', { n: page, total: pages })} />
      <Section>
        <NewsList posts={posts} page={page} pages={pages} locale={l} />
      </Section>
    </>
  );
}
