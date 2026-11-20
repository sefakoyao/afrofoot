import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { helsinkiToday } from '@/lib/time';
import { draftArticle, draftingAvailable } from './draft';
import { suggestPostTime } from './timing';

export type RunResult = { found: number; drafted: number; failed: number; error?: string };

/**
 * Finds new topics in the club's data (content_candidates, migration 0064) and drafts up to `limit` of them with Claude,
 * saving each as a suggestion for an approver. Runs as the signed-in approver ("Find new topics") or the scheduled job.
 * A topic that fails to draft is tried again next time (nothing is saved for it).
 */
export async function findAndDraft(db: SupabaseClient, limit = 3): Promise<RunResult> {
  if (!draftingAvailable()) return { found: 0, drafted: 0, failed: 0, error: 'no_key' };
  const [{ data, error }, { data: setting }] = await Promise.all([
    db.rpc('content_candidates'),
    db.from('site_settings').select('value').eq('key', 'content').maybeSingle(),
  ]);
  if (error) { console.error('[content] topics refused', { code: error.code, message: error.message }); return { found: 0, drafted: 0, failed: 0, error: 'db' }; }
  const topics = (data ?? []) as { kind: string; source_key: string; facts: Record<string, unknown> }[];
  const postTime = String((setting?.value as { post_time?: string } | null)?.post_time ?? 'best');
  let drafted = 0, failed = 0, lastError: string | undefined;
  for (const topic of topics.slice(0, limit)) {
    const r = await draftArticle(topic.kind, topic.facts, helsinkiToday());
    if ('error' in r) { failed++; lastError = r.error; if (r.error === 'bad_key' || r.error === 'no_key') break; continue; }
    const d = r.draft;
    const { error: e } = await db.from('article_suggestions').insert({
      kind: topic.kind, source_key: topic.source_key, facts: topic.facts, model: r.model,
      title: d.title_en, excerpt: d.excerpt_en, body_md: d.body_en,
      translations: { fi: { title: d.title_fi, excerpt: d.excerpt_fi, body_md: d.body_fi }, fr: { title: d.title_fr, excerpt: d.excerpt_fr, body_md: d.body_fr }, ar: { title: d.title_ar, excerpt: d.excerpt_ar, body_md: d.body_ar } },
      social: { facebook: d.facebook, instagram: d.instagram, tiktok: d.tiktok },
      checks: d.checks, post_at: suggestPostTime(topic.kind, topic.facts, postTime),
    });
    if (e) { failed++; lastError = 'db'; console.error('[content] saving a suggestion refused', { code: e.code, message: e.message }); } else drafted++;
  }
  return { found: topics.length, drafted, failed, error: lastError };
}
