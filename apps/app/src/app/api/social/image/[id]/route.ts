import { getTranslations } from 'next-intl/server';
import sharp from 'sharp';
import { z } from 'zod';
import { cardImage } from '@/lib/content/card';
import { serviceClient } from '@/lib/supabase/service';

/**
 * The picture Facebook and Instagram download for a queued post (migration 0071): the club's branded picture as a JPEG
 * (Instagram only accepts JPEG), square. Public, like the post itself will be, but only for an article that is published
 * and a post that is not cancelled; it shows the article's headline and, for a result, the score.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = { status: string; news_posts: { title: string; status: string } | null; article_suggestions: { kind: string; facts: Record<string, unknown> } | null };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  const db = serviceClient();
  if (!id.success || !db) return new Response('Not found', { status: 404 });
  const { data } = await db.from('social_posts').select('status, news_posts(title, status), article_suggestions(kind, facts)').eq('id', id.data).maybeSingle();
  const row = data as unknown as Row | null;
  if (!row || row.status === 'cancelled' || row.news_posts?.status !== 'published') return new Response('Not found', { status: 404 });
  const s = row.article_suggestions;
  const t = await getTranslations({ locale: 'en', namespace: 'content' });
  const kind = s ? t(`kind_${s.kind}` as 'kind_event') : '';
  const score = s?.kind === 'match_report' && s.facts.goals_for != null ? `${s.facts.goals_for}–${s.facts.goals_against}` : '';
  const png = Buffer.from(await cardImage({ title: row.news_posts.title, kind, score }).arrayBuffer());
  const jpeg = await sharp(png).flatten({ background: '#0b0b0b' }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' } });
}
