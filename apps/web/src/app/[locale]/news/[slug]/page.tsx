import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { localized, LOCALE_LABELS, type Locale } from '@afrofoot/i18n';
import { Section } from '@/components/Page';
import { Link } from '@/i18n/routing';
import { cover, getPost } from '@/lib/news';

export default async function NewsPostPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const post = await getPost(slug);
  if (!post) notFound();
  const t = await getTranslations('site');
  const l = (locale in LOCALE_LABELS ? locale : 'en') as Locale;
  const date = new Intl.DateTimeFormat(LOCALE_LABELS[l].intl, { dateStyle: 'long', timeZone: 'Europe/Helsinki' }).format(new Date(post.published_at));
  const img = cover(post, 0);
  // Plain text only: paragraphs are split on blank lines and rendered as text, never as HTML.
  const paragraphs = (post.body_md ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <Section>
      <article className="mx-auto max-w-3xl">
        <Link href="/news" className="font-semibold text-pitch underline">← {t('allnews')}</Link>
        <time className="mt-6 block text-sm text-muted" dateTime={post.published_at}>{date}</time>
        <h1 className="mt-1 font-display text-4xl font-black leading-tight md:text-5xl">{localized(post.title, post.translations, l, 'title')}</h1>
        <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-card">
          {img.remote
            // eslint-disable-next-line @next/next/no-img-element -- remote storage URL, host differs per environment
            ? <img src={img.src} alt="" className="size-full object-cover" />
            : <Image src={img.src} alt="" fill sizes="(min-width: 768px) 768px, 100vw" className="object-cover" priority />}
        </div>
        {post.excerpt ? <p className="mt-6 text-xl text-muted">{localized(post.excerpt, post.translations, l, 'excerpt')}</p> : null}
        <div className="mt-6 grid gap-4 text-lg leading-relaxed">{paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div>
      </article>
    </Section>
  );
}
