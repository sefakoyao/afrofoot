'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getMember } from '@/lib/auth';
import { findAndDraft } from '@/lib/content/run';
import { webUrl } from '@/lib/env';
import { getSupabase } from '@/lib/supabase/server';
import { helsinkiToIso } from '@/lib/time';

/**
 * Content assistant (migration 0064): find topics and draft them, edit / approve / reject suggestions, write news by hand,
 * and (admins) the posting time and the communications people. The database decides who may (app.can_publish, RLS).
 */
const uuid = z.string().uuid();
const BASES = ['/admin/content', '/content'] as const;
const PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const;

function base(fd: FormData): string { const b = String(fd.get('base') ?? ''); return (BASES as readonly string[]).includes(b) ? b : '/content'; }
function go(path: string, result: string, extra: Record<string, string> = {}): never {
  const u = new URLSearchParams({ result, ...extra });
  redirect(`${path}${path.includes('?') ? '&' : '?'}${u}`);
}
async function db(fd: FormData) {
  const member = await getMember();
  const supabase = await getSupabase();
  if (!member || member.status !== 'active' || !supabase) go(base(fd), 'c_error');
  return supabase;
}
function fail(path: string, what: string, error: { code?: string; message?: string }): never {
  console.error(`[content] ${what} refused`, { code: error.code, message: error.message });
  go(path, error.code === '42501' ? 'c_notAllowed' : error.code === '23505' ? 'c_duplicate' : error.code === '22023' ? 'c_invalid' : 'c_error');
}
const refresh = () => { revalidatePath('/admin', 'layout'); revalidatePath('/content', 'layout'); };

/** "Find new topics now": up to 3 drafts per click (each takes Claude a little while). */
export async function findTopics(fd: FormData): Promise<void> {
  const supabase = await db(fd);
  const r = await findAndDraft(supabase, 3);
  refresh();
  if (r.error === 'no_key') go(base(fd), 'c_noKey');
  if (r.error === 'bad_key') go(base(fd), 'c_badKey');
  go(base(fd), r.drafted ? 'c_drafted' : r.found ? 'c_draftFailed' : 'c_noTopics', { n: String(r.drafted), left: String(Math.max(0, r.found - r.drafted - r.failed)) });
}

// ---------- suggestions ----------
const text = (min: number, max: number, key: string) => z.string().trim().min(min, key).max(max, key);
const optional = (max: number) => z.string().trim().max(max, 'c_long').transform((v) => v || undefined);
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'c_time').transform((v) => helsinkiToIso(v.slice(0, 10), v.slice(11, 16)));

const articleSchema = z.object({
  title: text(3, 160, 'c_title'), excerpt: optional(300), body_md: text(20, 20000, 'c_body'),
  title_fi: optional(160), excerpt_fi: optional(300), body_fi: optional(20000),
  title_fr: optional(160), excerpt_fr: optional(300), body_fr: optional(20000),
  title_ar: optional(160), excerpt_ar: optional(300), body_ar: optional(20000),
});
function translations(a: z.infer<typeof articleSchema>) {
  const t: Record<string, Record<string, string>> = {};
  for (const l of ['fi', 'fr', 'ar'] as const) {
    const o = Object.fromEntries(Object.entries({ title: a[`title_${l}`], excerpt: a[`excerpt_${l}`], body_md: a[`body_${l}`] }).filter(([, v]) => v)) as Record<string, string>;
    if (Object.keys(o).length) t[l] = o;
  }
  return t;
}
const fields = (fd: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, String(fd.get(k) ?? '')]));
const ARTICLE_KEYS = ['title', 'excerpt', 'body_md', 'title_fi', 'excerpt_fi', 'body_fi', 'title_fr', 'excerpt_fr', 'body_fr', 'title_ar', 'excerpt_ar', 'body_ar'];

async function saveDraft(fd: FormData, id: string, back: string) {
  const a = articleSchema.safeParse(fields(fd, ARTICLE_KEYS));
  if (!a.success) go(back, a.error.issues[0]?.message ?? 'c_invalid');
  const social = Object.fromEntries(PLATFORMS.map((p) => [p, String(fd.get(`social_${p}`) ?? '').trim().slice(0, 2200)]));
  const supabase = await db(fd);
  const { data, error } = await supabase.from('article_suggestions')
    .update({ title: a.data.title, excerpt: a.data.excerpt ?? null, body_md: a.data.body_md, translations: translations(a.data), social, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'new').select('id');
  if (error) fail(back, 'save suggestion', error);
  if (!data?.length) go(back, 'c_notOpen');
  return { supabase, social };
}

export async function saveSuggestion(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) go(base(fd), 'c_invalid');
  const back = `${base(fd)}/s/${id.data}`;
  await saveDraft(fd, id.data, back);
  refresh(); go(back, 'c_saved');
}

/** Saves the edits, publishes the article and queues the chosen social posts at the chosen time. */
export async function approveSuggestion(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) go(base(fd), 'c_invalid');
  const back = `${base(fd)}/s/${id.data}`;
  const when = localDateTime.safeParse(String(fd.get('post_at') ?? ''));
  if (!when.success) go(back, 'c_time');
  const platforms = fd.getAll('platforms').map(String).filter((p): p is (typeof PLATFORMS)[number] => (PLATFORMS as readonly string[]).includes(p));
  const { supabase, social } = await saveDraft(fd, id.data, back);
  for (const p of platforms) if (!social[p]) go(back, 'c_caption');
  const { error } = await supabase.rpc('approve_suggestion', { p_id: id.data, p_post_at: when.data, p_platforms: platforms, p_captions: social, p_site_url: webUrl() });
  if (error) fail(back, 'approve', error);
  refresh(); go(base(fd), 'c_approved', { n: String(platforms.length) });
}

export async function rejectSuggestion(fd: FormData): Promise<void> {
  const p = z.object({ id: uuid, reason: z.string().trim().max(300) }).safeParse({ id: fd.get('id'), reason: String(fd.get('reason') ?? '') });
  if (!p.success) go(base(fd), 'c_invalid');
  const supabase = await db(fd);
  const member = await getMember();
  const { data, error } = await supabase.from('article_suggestions')
    .update({ status: 'rejected', reject_reason: p.data.reason || null, decided_by: member?.id, decided_at: new Date().toISOString() }).eq('id', p.data.id).eq('status', 'new').select('id');
  if (error) fail(base(fd), 'reject', error);
  if (!data?.length) go(base(fd), 'c_notOpen');
  refresh(); go(base(fd), 'c_rejected');
}

// ---------- news written by hand ----------
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'news';

export async function saveNews(fd: FormData): Promise<void> {
  const raw = String(fd.get('id') ?? '');
  const id = raw === 'new' ? null : uuid.safeParse(raw).success ? raw : undefined;
  if (id === undefined) go(`${base(fd)}/news`, 'c_invalid');
  const back = `${base(fd)}/news/${id ?? 'new'}`;
  const a = articleSchema.safeParse(fields(fd, ARTICLE_KEYS));
  if (!a.success) go(back, a.error.issues[0]?.message ?? 'c_invalid');
  const publish = fd.get('publish') === 'on';
  const slugIn = String(fd.get('slug') ?? '').trim();
  const slug = slugIn ? slugify(slugIn) : slugify(a.data.title);
  const supabase = await db(fd);
  const member = await getMember();
  const { data: existing } = id ? await supabase.from('news_posts').select('status, published_at').eq('id', id).maybeSingle() : { data: null };
  const row = {
    slug, title: a.data.title, excerpt: a.data.excerpt ?? null, body_md: a.data.body_md, translations: translations(a.data),
    status: publish ? 'published' : 'draft', published_at: publish ? (existing?.published_at ?? new Date().toISOString()) : existing?.published_at ?? null,
    updated_at: new Date().toISOString(),
  };
  const res = id
    ? await supabase.from('news_posts').update(row).eq('id', id).select('id').single()
    : await supabase.from('news_posts').insert({ ...row, author_id: member?.id }).select('id').single();
  if (res.error) fail(back, 'save news', res.error);
  const postId = res.data.id as string;
  // share on social media when the article is published: one waiting post per ticked platform
  const platforms = fd.getAll('share').map(String).filter((p) => (PLATFORMS as readonly string[]).includes(p));
  const caption = String(fd.get('caption') ?? '').trim().replace(/\{link\}/g, `${webUrl()}/news/${slug}`).slice(0, 2200);
  if (publish && platforms.length) {
    if (!caption) go(`${base(fd)}/news/${postId}`, 'c_caption');
    const when = localDateTime.safeParse(String(fd.get('post_at') ?? ''));
    const { error } = await supabase.from('social_posts').insert(platforms.map((p) => ({ news_post_id: postId, platform: p, caption, status: 'waiting', post_at: when.success ? when.data : new Date().toISOString() })));
    if (error && error.code !== '23505') fail(`${base(fd)}/news/${postId}`, 'share', error);
  }
  refresh(); go(`${base(fd)}/news/${postId}`, publish ? 'c_published' : 'c_draftSaved');
}

// ---------- settings (admins) ----------
export async function saveContentSettings(fd: FormData): Promise<void> {
  const p = z.object({ mode: z.enum(['best', 'fixed']), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional() }).safeParse({ mode: fd.get('mode'), time: fd.get('time') || undefined });
  if (!p.success || (p.data.mode === 'fixed' && !p.data.time)) go('/admin/content', 'c_time');
  const supabase = await db(fd);
  const { error } = await supabase.from('site_settings').upsert({ key: 'content', value: { post_time: p.data.mode === 'best' ? 'best' : p.data.time }, is_public: true });
  if (error) fail('/admin/content', 'settings', error);
  refresh(); go('/admin/content', 'c_settingsSaved');
}

export async function addEditor(fd: FormData): Promise<void> {
  const p = uuid.safeParse(fd.get('profile_id'));
  if (!p.success) go('/admin/content', 'c_pickPerson');
  const supabase = await db(fd);
  const { error } = await supabase.from('content_editors').insert({ profile_id: p.data });
  if (error) fail('/admin/content', 'add editor', error);
  refresh(); go('/admin/content', 'c_editorAdded');
}

export async function removeEditor(fd: FormData): Promise<void> {
  const p = uuid.safeParse(fd.get('profile_id'));
  if (!p.success) go('/admin/content', 'c_invalid');
  const supabase = await db(fd);
  const { error } = await supabase.from('content_editors').delete().eq('profile_id', p.data);
  if (error) fail('/admin/content', 'remove editor', error);
  refresh(); go('/admin/content', 'c_editorRemoved');
}
