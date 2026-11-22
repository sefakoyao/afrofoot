import { z } from 'zod';
import { postImage } from '@/lib/social/image';
import { serviceClient } from '@/lib/supabase/service';

/**
 * The picture Facebook and Instagram download for a queued post (migration 0071, lib/social/image.ts): a square JPEG
 * (Instagram only accepts JPEG). Public, like the post itself will be, but only for a published article and a post that
 * is not cancelled.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  const db = serviceClient();
  if (!id.success || !db) return new Response('Not found', { status: 404 });
  const img = await postImage(db, id.data);
  if (!img) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(img.jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' } });
}
