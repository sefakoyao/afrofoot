import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTranslations } from 'next-intl/server';
import { AUTO_PLATFORMS, switchedOn } from '@/lib/social/publish';

const NAMES: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', x: 'X' };

/** What the Publish panel (components/admin/PublishPanel) needs: may this person publish, the platforms, the texts. */
export async function publishPanel(db: SupabaseClient) {
  const [t, { data: may }, on] = await Promise.all([getTranslations('publish'), db.rpc('can_publish'), switchedOn(db).catch(() => [] as string[])]);
  const keys = ['title', 'heading', 'lead', 'postTitle', 'postText', 'platforms', 'notConnected', 'captions', 'captionHint', 'when', 'now', 'later',
    'date', 'time', 'publish', 'publishing', 'storyNote', 'done', 'doneLater', 'openArticle', 'openSocial', 'sampleNote'] as const;
  const labels = Object.fromEntries(keys.map((k) => [k, t(k)])) as Record<(typeof keys)[number], string>;
  const errors = Object.fromEntries(['title', 'text', 'time', 'render', 'storage', 'x280', 'notAllowed', 'invalid', 'failed'].map((k) => [k, t(`e_${k}`)]));
  return {
    allowed: may === true,
    platforms: AUTO_PLATFORMS.map((id) => ({ id, label: NAMES[id] ?? id, on: (on as string[]).includes(id) })),
    labels: { ...labels, errors },
    siteUrl: 'https://www.afrofoot.club',
  };
}
