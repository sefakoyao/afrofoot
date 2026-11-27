import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { localized, LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { Section } from '@/components/Page';
import { Link } from '@/i18n/routing';
import { ArticleBody } from '@/components/ArticleBody';
import { cover, getPost } from '@/lib/news';
import { SITE_NAME, SITE_URL, jsonLd, localePath, pageMeta, plainText } from '@/lib/seo';

// Rebuilt at most once a minute, so articles added or edited in the database show without a deploy.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  const l = (locale in LOCALE_LABELS ? locale : 'en') as Locale;
  const title = localized(post.title, post.translations, l, 'title');
  const excerpt = post.excerpt ? localized(post.excerpt, post.translations, l, 'excerpt') : '';
  const img = cover(post, 0);
  return pageMeta({
    locale, path: `/news/${slug}`, title,
    description: excerpt || plainText(post.body_md ?? '') || title,
    image: { url: img.src, alt: title },
    article: { publishedTime: post.published_at },
  });
}

export default async function NewsPostPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = await getPost(slug);
  if (!post) notFound();
  const t = await getTranslations('site');
  const l = (locale in LOCALE_LABELS ? locale : 'en') as Locale;
  const date = new Intl.DateTimeFormat(LOCALE_LABELS[l].intl, { dateStyle: 'long', timeZone: 'Europe/Helsinki' }).format(new Date(post.published_at));
  const img = cover(post, 0);
  const title = localized(post.title, post.translations, l, 'title');
  const abs = (u: string) => (u.startsWith('http') ? u : SITE_URL + u);
  const article = {
    '@context': 'https://schema.org', '@type': 'NewsArticle',
    headline: title.slice(0, 110), datePublished: post.published_at, image: [abs(img.src)], inLanguage: l,
    mainEntityOfPage: SITE_URL + localePath(l, `/news/${post.slug}`),
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: `${SITE_URL}/afc-logo.png` } },
  };
  return (
    <Section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(article) }} />
      <article className="mx-auto max-w-3xl">
        <Link href="/news" className="font-semibold text-pitch underline">← {t('allnews')}</Link>
        <time className="mt-6 block text-sm text-muted" dateTime={post.published_at}>{date}</time>
        <h1 dir="auto" className="mt-1 font-display text-4xl font-black leading-tight md:text-5xl">{title}</h1>
        {img.poster ? (
          // a published poster: the whole picture, at its own size
          // eslint-disable-next-line @next/next/no-img-element -- remote storage URL, host differs per environment
          <img src={img.src} alt={title} className="mx-auto mt-6 w-full max-w-xl rounded-card shadow-xl" data-news-poster />
        ) : <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-card">
          {img.remote
            // eslint-disable-next-line @next/next/no-img-element -- remote storage URL, host differs per environment
            ? <img src={img.src} alt="" className="size-full object-cover" />
            : <Image src={img.src} alt="" fill sizes="(min-width: 768px) 768px, 100vw" className="object-cover" priority />}
        </div>}
        {post.excerpt ? <p dir="auto" className="mt-6 text-xl text-muted">{localized(post.excerpt, post.translations, l, 'excerpt')}</p> : null}
        <ArticleBody markdown={post.body_md ?? ''} />
      </article>
    </Section>
  );
}
