import type { MetadataRoute } from 'next';
import { LOCALES } from '@afrofoot/i18n';
import { getPosts } from '@/lib/news';
import { SITE_URL, languageAlternates, localePath } from '@/lib/seo';

// Rebuilt at most once an hour, so new articles are listed without a deploy.
export const revalidate = 3600;

const PAGES: { path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/news', priority: 0.8, changeFrequency: 'daily' },
  { path: '/calendar', priority: 0.8, changeFrequency: 'daily' },
  { path: '/join', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/team', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/women', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/juniors', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/membership', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/sponsors', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.2, changeFrequency: 'yearly' },
];

const abs = (path: string) => SITE_URL + (path === '/' ? '' : path);
const languages = (path: string) => Object.fromEntries(Object.entries(languageAlternates(path)).map(([l, p]) => [l, abs(p)]));

/** /sitemap.xml: every page and published article in all four languages, each with its language versions. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts(1000);
  const entries: MetadataRoute.Sitemap = [];
  for (const page of PAGES) {
    for (const l of LOCALES) entries.push({ url: abs(localePath(l, page.path)), changeFrequency: page.changeFrequency, priority: page.priority, alternates: { languages: languages(page.path) } });
  }
  for (const post of posts) {
    const path = `/news/${post.slug}`;
    for (const l of LOCALES) entries.push({ url: abs(localePath(l, path)), lastModified: post.published_at, changeFrequency: 'yearly', priority: 0.6, alternates: { languages: languages(path) } });
  }
  return entries;
}
