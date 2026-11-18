import { cache } from 'react';
import type { Translations } from '@afrofoot/i18n';
import { getPublicClient } from './supabase';

export interface Post { id: string; slug: string; title: string; excerpt: string | null; body_md?: string; cover_path: string | null; published_at: string; translations: Translations | null }

/** Club photos used until a post has its own cover picture. */
const FALLBACKS = ['/images/hero-team.jpg', '/images/montel-deal.jpg'];

/**
 * Cover picture: a picture shipped with the site ("/news/…", e.g. the articles imported from the old website), the uploaded
 * file in the public-media bucket, else a club photo. `remote` tells the caller to use a plain <img>.
 */
export function cover(post: Pick<Post, 'cover_path'>, index: number): { src: string; remote: boolean } {
  if (post.cover_path?.startsWith('/news/')) return { src: post.cover_path, remote: false };
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (post.cover_path && base) return { src: `${base}/storage/v1/object/public/public-media/${post.cover_path}`, remote: true };
  return { src: FALLBACKS[index % FALLBACKS.length]!, remote: false };
}

export const POST_COLUMNS = 'id,slug,title,excerpt,cover_path,published_at,translations';

export async function getPosts(limit: number): Promise<Post[]> {
  const db = getPublicClient();
  if (!db) return [];
  // Row Level Security already limits this to published posts; the filter keeps the intent visible.
  const { data } = await db.from('news_posts').select(POST_COLUMNS).eq('status', 'published').order('published_at', { ascending: false }).limit(limit);
  return (data ?? []) as Post[];
}

/** Articles per page on the News page. */
export const NEWS_PER_PAGE = 9;

/** One page of the archive, newest first, and how many pages there are (page 1 = /news, page n = /news/page/n). */
export async function getPostsPage(page: number): Promise<{ posts: Post[]; total: number; pages: number }> {
  const db = getPublicClient();
  if (!db || !Number.isInteger(page) || page < 1) return { posts: [], total: 0, pages: 0 };
  const from = (page - 1) * NEWS_PER_PAGE;
  const { data, count } = await db.from('news_posts').select(POST_COLUMNS, { count: 'exact' }).eq('status', 'published')
    .order('published_at', { ascending: false }).range(from, from + NEWS_PER_PAGE - 1);
  const total = count ?? 0;
  return { posts: (data ?? []) as Post[], total, pages: Math.max(1, Math.ceil(total / NEWS_PER_PAGE)) };
}

/** One published post; cached per request, so the page and its metadata share one query. */
export const getPost = cache(async (slug: string): Promise<Post | null> => {
  const db = getPublicClient();
  if (!db) return null;
  const { data } = await db.from('news_posts').select(`${POST_COLUMNS},body_md`).eq('status', 'published').eq('slug', slug).maybeSingle();
  return (data as Post | null) ?? null;
});
