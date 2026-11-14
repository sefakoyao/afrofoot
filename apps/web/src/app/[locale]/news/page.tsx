import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { NewsCard } from '@/components/NewsCard';
import { Hero, Section } from '@/components/Page';
import { getPosts } from '@/lib/news';

export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('site');
  const l = (locale in LOCALE_LABELS ? locale : 'en') as Locale;
  const date = new Intl.DateTimeFormat(LOCALE_LABELS[l].intl, { dateStyle: 'long', timeZone: 'Europe/Helsinki' });
  const posts = await getPosts(30);
  return (
    <>
      <Hero title={t('newsw')} />
      <Section>
        {posts.length === 0 ? <p className="text-muted">{t('news_empty')}</p> : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p, i) => <NewsCard key={p.id} post={p} index={i} locale={l} date={date.format(new Date(p.published_at))} readMore={t('readmore')} />)}
          </div>
        )}
      </Section>
    </>
  );
}
