import type { Metadata } from 'next';
import { staticPageMeta } from '@/lib/seo';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { NewsList } from '@/components/NewsList';
import { Hero, Section } from '@/components/Page';
import { getPostsPage } from '@/lib/news';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return staticPageMeta((await params).locale, '/news', 'n_news', 'seo_news');
}

// Rebuilt at most once a minute, so new articles show without a deploy.
export const revalidate = 60;

/** News, page 1: the 9 newest articles; the rest on /news/page/2, 3 … */
export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('site');
  const l = (locale in LOCALE_LABELS ? locale : 'en') as Locale;
  const { posts, pages } = await getPostsPage(1);
  return (
    <>
      <Hero title={t('n_news')} />
      <Section>
        {posts.length === 0 ? <p className="text-muted">{t('news_empty')}</p> : <NewsList posts={posts} page={1} pages={pages} locale={l} />}
      </Section>
    </>
  );
}
