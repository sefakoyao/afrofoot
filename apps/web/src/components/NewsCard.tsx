import Image from 'next/image';
import { localized, type Locale } from '@afrofoot/i18n';
import { Link } from '@/i18n/routing';
import { cover, type Post } from '@/lib/news';

export function NewsCard({ post, index, locale, date, readMore }: { post: Post; index: number; locale: Locale; date: string; readMore: string }) {
  const img = cover(post, index);
  const title = localized(post.title, post.translations, locale, 'title');
  const excerpt = post.excerpt ? localized(post.excerpt, post.translations, locale, 'excerpt') : null;
  return (
    <article className="group flex flex-col overflow-hidden rounded-card border border-line bg-raised shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl motion-reduce:transition-none">
      <Link href={`/news/${post.slug}`} className="relative block aspect-[16/9] overflow-hidden" tabIndex={-1} aria-hidden>
        {img.remote
          // eslint-disable-next-line @next/next/no-img-element -- remote storage URL, host differs per environment
          ? <img src={img.src} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none" />
          : <Image src={img.src} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none" />}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <time className="text-sm text-muted" dateTime={post.published_at}>{date}</time>
        <h3 className="mt-1 font-display text-xl font-extrabold leading-snug">{title}</h3>
        {excerpt ? <p className="mt-2 line-clamp-3 text-muted">{excerpt}</p> : null}
        <Link href={`/news/${post.slug}`} className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-accent px-5 py-2 font-display font-bold text-on-accent transition hover:brightness-110 hover:gap-3">
          {readMore} <span aria-hidden className="rtl:rotate-180">→</span>
        </Link>
      </div>
    </article>
  );
}
