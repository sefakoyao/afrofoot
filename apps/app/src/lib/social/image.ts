import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTranslations } from 'next-intl/server';
import sharp from 'sharp';
import { cardImage } from '@/lib/content/card';

/**
 * The picture of a queued social post: the published poster when the post has one (migration 0074), otherwise (0071) the club's branded card (lib/content/card.tsx) as a square JPEG,
 * with the article's headline and, for a match report, the score. Only for a published article and a post that is not
 * cancelled; null otherwise. Served to Meta at /api/social/image/[id], uploaded directly to LinkedIn and X.
 */
type Row = { status: string; image_path?: string | null; news_posts: { title: string; status: string } | null; article_suggestions: { kind: string; facts: Record<string, unknown> } | null };

export async function postImage(db: SupabaseClient, id: string): Promise<{ jpeg: Buffer; title: string } | null> {
  const first = await db.from('social_posts').select('status, image_path, news_posts(title, status), article_suggestions(kind, facts)').eq('id', id).maybeSingle();
  const { data } = first.error?.code === '42703' ? await db.from('social_posts').select('status, news_posts(title, status), article_suggestions(kind, facts)').eq('id', id).maybeSingle() : first;   // before 0074
  const row = data as unknown as Row | null;
  if (!row || row.status === 'cancelled' || row.news_posts?.status !== 'published') return null;
  // a published poster (migration 0074): the poster itself is the picture
  if (row.image_path) {
    const { data: file } = await db.storage.from('public-media').download(row.image_path);
    if (file) return { jpeg: Buffer.from(await file.arrayBuffer()), title: row.news_posts.title };
  }
  const s = row.article_suggestions;
  const t = await getTranslations({ locale: 'en', namespace: 'content' });
  const kind = s ? t(`kind_${s.kind}` as 'kind_event') : '';
  const score = s?.kind === 'match_report' && s.facts.goals_for != null ? `${s.facts.goals_for}–${s.facts.goals_against}` : '';
  const png = Buffer.from(await cardImage({ title: row.news_posts.title, kind, score }).arrayBuffer());
  const jpeg = await sharp(png).flatten({ background: '#0b0b0b' }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return { jpeg, title: row.news_posts.title };
}
