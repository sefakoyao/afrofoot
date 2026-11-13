import { getTranslations, setRequestLocale } from 'next-intl/server';
import { localized, LOCALE_LABELS, type Locale, type Translations } from '@afrofoot/i18n';
import { Card, Hero, Section } from '@/components/Page';
import { getPublicClient } from '@/lib/supabase';

interface Post { id: string; slug: string; title: string; excerpt: string | null; published_at: string; translations: Translations | null }

async function getPosts(): Promise<Post[]> {
  const db = getPublicClient();
  if (!db) return [];
  // Row Level Security already limits this to published posts; the filter keeps the intent visible.
  const { data } = await db.from('news_posts').select('id,slug,title,excerpt,published_at,translations').eq('status', 'published').order('published_at', { ascending: false }).limit(30);
  return (data ?? []) as Post[];
}

export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('site');
  const l = (locale in LOCALE_LABELS ? locale : 'en') as Locale;
  const date = new Intl.DateTimeFormat(LOCALE_LABELS[l].intl, { dateStyle: 'long', timeZone: 'Europe/Helsinki' });
  const posts = await getPosts();
  return (
    <>
      <Hero title={t('newsw')} />
      <Section>
        {posts.length === 0 ? <p className="text-muted">{t('none')}</p> : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <Card key={p.id}>
                <time className="text-sm text-muted" dateTime={p.published_at}>{date.format(new Date(p.published_at))}</time>
                <h3 className="mt-1 font-display text-xl font-extrabold">{localized(p.title, p.translations, l, 'title')}</h3>
                {p.excerpt ? <p className="mt-1 text-muted">{localized(p.excerpt, p.translations, l, 'excerpt')}</p> : null}
              </Card>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
