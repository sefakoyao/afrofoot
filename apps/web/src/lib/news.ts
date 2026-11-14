import type { Translations } from '@afrofoot/i18n';
import { getPublicClient } from './supabase';

export interface Post { id: string; slug: string; title: string; excerpt: string | null; body_md?: string; cover_path: string | null; published_at: string; translations: Translations | null }

/** Club photos used until a post has its own cover picture. */
const FALLBACKS = ['/images/hero-team.jpg', '/images/montel-deal.jpg'];

/** Cover picture: the uploaded file in the public-media bucket, else a club photo. `remote` tells the caller to use a plain <img>. */
export function cover(post: Pick<Post, 'cover_path'>, index: number): { src: string; remote: boolean } {
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

export async function getPost(slug: string): Promise<Post | null> {
  const db = getPublicClient();
  if (!db) return null;
  const { data } = await db.from('news_posts').select(`${POST_COLUMNS},body_md`).eq('status', 'published').eq('slug', slug).maybeSingle();
  return (data as Post | null) ?? null;
}
