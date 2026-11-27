'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { NextRequest, after } from 'next/server';
import sharp from 'sharp';
import { z } from 'zod';
import { GET as renderAnnouncement } from '@/app/api/content/announce/route';
import { GET as renderMatchday } from '@/app/api/content/xi/route';
import { requireMember } from '@/lib/auth';
import { AUTO_PLATFORMS, publishDue } from '@/lib/social/publish';
import { getSupabase } from '@/lib/supabase/server';
import { serviceClient } from '@/lib/supabase/service';
import { helsinkiToIso } from '@/lib/time';

export type PublishState = { status: 'idle' } | { status: 'ok'; slug: string; posts: number; later: boolean } | { status: 'error'; error: string };

const SITE = 'https://www.afrofoot.club';
const input = z.object({
  source: z.enum(['announce', 'xi']),
  q: z.string().max(2000),
  title: z.string().trim().min(3, 'title').max(160, 'title'),
  text: z.string().trim().max(2000, 'text'),
  when: z.enum(['now', 'later']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal('')),
});

/**
 * Publish the poster on the page (Matchday poster, Player announcement): render it (the portrait size; a story becomes
 * portrait, which every platform accepts), store it as a JPEG in the club's public images (public-media/posters/published/),
 * then public.publish_poster (migration 0074) makes the news article with the poster as its picture, queues a post per
 * chosen platform with the poster as the image, and puts an open tryout on the club calendar. Posts due now are sent
 * right after the answer; later ones by the 10-minute job. Only people who may publish (admins, communications people).
 */
export async function publishPoster(_: PublishState, fd: FormData): Promise<PublishState> {
  await requireMember('/admin');
  const p = input.safeParse(Object.fromEntries(['source', 'q', 'title', 'text', 'when', 'date', 'time'].map((k) => [k, String(fd.get(k) ?? '')])));
  if (!p.success) return { status: 'error', error: p.error.issues[0]?.message === 'title' ? 'title' : p.error.issues[0]?.message === 'text' ? 'text' : 'invalid' };
  const v = p.data;
  const platforms = fd.getAll('platform').map(String).filter((x): x is (typeof AUTO_PLATFORMS)[number] => (AUTO_PLATFORMS as readonly string[]).includes(x));
  const captions = Object.fromEntries(platforms.map((x) => [x, String(fd.get(`cap_${x}`) ?? '').trim().slice(0, 2200)]).filter(([, c]) => c));
  let postAt: string | null = null;
  if (v.when === 'later') {
    if (!v.date || !v.time) return { status: 'error', error: 'time' };
    postAt = helsinkiToIso(v.date, v.time);
  }
  const supabase = await getSupabase();
  if (!supabase) return { status: 'error', error: 'failed' };
  const { data: may } = await supabase.rpc('can_publish');
  if (may !== true) return { status: 'error', error: 'notAllowed' };

  // 1. the poster as the reader will see it (no preview marks: download=1), in the portrait size unless square
  const q = new URLSearchParams(v.q);
  if (q.get('format') !== 'square') q.set('format', 'portrait');
  q.set('download', '1');
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const path = v.source === 'xi' ? '/api/content/xi' : '/api/content/announce';
  const res = await (v.source === 'xi' ? renderMatchday : renderAnnouncement)(new NextRequest(new URL(`${path}?${q}`, origin)));
  if (!res.ok) return { status: 'error', error: 'render' };
  const jpeg = await sharp(Buffer.from(await res.arrayBuffer())).flatten({ background: '#0b0b0b' }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();

  // 2. stored with the club's public images (the publisher's right was checked above; communications people may not
  //    write to storage themselves, so the app does it)
  const image = `posters/published/${randomUUID()}.jpg`;
  const store = serviceClient() ?? supabase;
  const up = await store.storage.from('public-media').upload(image, jpeg, { contentType: 'image/jpeg', upsert: false });
  if (up.error) { console.error('[publish] storage refused', { message: up.error.message }); return { status: 'error', error: 'storage' }; }

  // 3. the article, the social posts and (open tryout) the calendar
  const kind = v.source === 'xi' ? 'matchday' : (q.get('kind') ?? 'welcome');
  const event = kind === 'tryout' && /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') ?? '') && /^\d{2}:\d{2}$/.test(q.get('start') ?? '')
    ? { starts_at: helsinkiToIso(q.get('date')!, q.get('start')!), ends_at: /^\d{2}:\d{2}$/.test(q.get('end') ?? '') ? helsinkiToIso(q.get('date')!, q.get('end')!) : '', place: [q.get('place'), q.get('address')].filter(Boolean).join(', ') }
    : null;
  const { data: postId, error } = await supabase.rpc('publish_poster', {
    p_kind: kind, p_title: v.title, p_text: v.text, p_image: image, p_platforms: platforms, p_captions: captions, p_post_at: postAt, p_event: event, p_site_url: SITE,
  });
  if (error || !postId) {
    console.error('[publish] refused', { code: error?.code, message: error?.message });
    await store.storage.from('public-media').remove([image]);
    return { status: 'error', error: /280/.test(error?.message ?? '') ? 'x280' : /60 days/.test(error?.message ?? '') ? 'time' : error?.code === '42501' ? 'notAllowed' : 'failed' };
  }
  const { data: post } = await supabase.from('news_posts').select('slug').eq('id', postId as string).maybeSingle();
  revalidatePath('/admin/content/social');
  // posts due now go out straight after the answer (the 10-minute job sends them otherwise)
  if (!postAt && platforms.length) after(async () => { const db = serviceClient(); if (db) await publishDue(db, 5).catch((e) => console.error('[publish] send now', e)); });
  return { status: 'ok', slug: post?.slug ?? '', posts: platforms.length, later: !!postAt };
}
