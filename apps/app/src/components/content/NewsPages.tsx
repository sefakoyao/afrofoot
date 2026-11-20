import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { saveNews } from '@/app/actions/content';
import { webUrl } from '@/lib/env';
import { getSupabase } from '@/lib/supabase/server';
import { ContentBanner, area, btn, input, toLocalInput } from './shared';

type Post = { id: string; slug: string; title: string; excerpt: string | null; body_md: string; status: string; published_at: string | null; updated_at: string; translations: Record<string, Record<string, string>> };
const LANGS = [['fi', 'Suomi'], ['fr', 'Français'], ['ar', 'العربية']] as const;
const PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const;

/** Website → News: every article (published and drafts), newest first. */
export async function NewsList({ base, sp }: { base: string; sp: Record<string, string | string[] | undefined> }) {
  const [t, locale, supabase] = await Promise.all([getTranslations('content'), getLocale(), getSupabase()]);
  if (!supabase) return null;
  const tag = isLocale(locale) ? LOCALE_LABELS[locale].intl : 'en-GB';
  const day = new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE });
  const { data } = await supabase.from('news_posts').select('id, slug, title, status, published_at, updated_at').order('updated_at', { ascending: false }).limit(100);
  const posts = (data ?? []) as Post[];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Link href={base} className="text-sm font-semibold text-pitch underline underline-offset-2">← {t('title')}</Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-2xl font-extrabold">{t('newsTitle')}</h1><p className="mt-1 text-muted">{t('newsLead')}</p></div>
        <Link href={`${base}/news/new`} className={`${btn} inline-flex items-center`} data-new-article>+ {t('newArticle')}</Link>
      </header>
      <ContentBanner sp={sp} />
      <ul className="divide-y divide-line rounded-card border border-line bg-raised">
        {posts.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 p-4" data-news={p.title}>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.status === 'published' ? 'bg-accent/20 text-pitch' : 'bg-line'}`}>{t(`st_${p.status}` as 'st_draft')}</span>
            <Link href={`${base}/news/${p.id}`} className="min-w-0 flex-1 font-semibold hover:text-pitch">{p.title}</Link>
            <span className="text-xs text-muted">{p.published_at ? day.format(new Date(p.published_at)) : day.format(new Date(p.updated_at))}</span>
          </li>
        ))}
        {posts.length === 0 ? <li className="p-4 text-muted">{t('newsNone')}</li> : null}
      </ul>
    </div>
  );
}

/** Write or edit an article by hand: four languages, publish, and (when publishing) share on social media. */
export async function NewsEditor({ base, id, sp }: { base: string; id: string; sp: Record<string, string | string[] | undefined> }) {
  const [t, supabase] = await Promise.all([getTranslations('content'), getSupabase()]);
  if (!supabase) return null;
  let p: Post | null = null;
  if (id !== 'new') {
    if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
    const { data } = await supabase.from('news_posts').select('id, slug, title, excerpt, body_md, status, published_at, updated_at, translations').eq('id', id).maybeSingle();
    if (!data) notFound();
    p = data as Post;
  }
  const { data: shared } = p ? await supabase.from('social_posts').select('platform, status').eq('news_post_id', p.id).neq('status', 'cancelled') : { data: [] };
  const sharedOn = new Set(((shared ?? []) as { platform: string }[]).map((x) => x.platform));
  const tr = (l: string, f: string) => p?.translations?.[l]?.[f] ?? '';
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Link href={`${base}/news`} className="text-sm font-semibold text-pitch underline underline-offset-2">← {t('newsTitle')}</Link>
      <h1 className="font-display text-2xl font-extrabold">{p ? p.title : t('newArticle')}</h1>
      <ContentBanner sp={sp} />
      {p?.status === 'published' ? <a href={`${webUrl()}/news/${p.slug}`} target="_blank" rel="noopener" className="font-semibold text-pitch underline underline-offset-2">{t('openArticle')}</a> : null}
      <form action={saveNews} className="grid gap-5" data-news-form>
        <input type="hidden" name="base" value={base} /><input type="hidden" name="id" value={p?.id ?? 'new'} />
        <section className="grid gap-3 rounded-card border border-line bg-raised p-5">
          <label className="grid gap-1 text-sm font-semibold">{t('fTitle')} (English) *<input name="title" required minLength={3} maxLength={160} defaultValue={p?.title} className={input} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('fSlug')}<input name="slug" maxLength={80} defaultValue={p?.slug} placeholder={t('fSlugHint')} className={input} dir="ltr" /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('fExcerpt')}<textarea name="excerpt" maxLength={300} rows={2} defaultValue={p?.excerpt ?? ''} className={area} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t('fBody')} *<textarea name="body_md" required minLength={20} rows={10} defaultValue={p?.body_md} className={area} /></label>
          {LANGS.map(([l, name]) => (
            <details key={l} className="rounded-card bg-surface p-3">
              <summary className="cursor-pointer font-bold">{name}</summary>
              <div className="mt-3 grid gap-3" dir={l === 'ar' ? 'rtl' : undefined} lang={l}>
                <label className="grid gap-1 text-sm font-semibold">{t('fTitle')}<input name={`title_${l}`} maxLength={160} defaultValue={tr(l, 'title')} className={input} /></label>
                <label className="grid gap-1 text-sm font-semibold">{t('fExcerpt')}<textarea name={`excerpt_${l}`} maxLength={300} rows={2} defaultValue={tr(l, 'excerpt')} className={area} /></label>
                <label className="grid gap-1 text-sm font-semibold">{t('fBody')}<textarea name={`body_${l}`} rows={8} defaultValue={tr(l, 'body_md')} className={area} /></label>
              </div>
            </details>
          ))}
        </section>
        <section className="grid gap-3 rounded-card border-2 border-accent bg-raised p-5">
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="publish" defaultChecked={p?.status === 'published'} className="size-5 accent-accent" />{t('publishOnSite')}</label>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-bold">{t('shareTitle')}</legend>
            <div className="flex flex-wrap gap-3">{PLATFORMS.map((x) => (
              <label key={x} className="flex items-center gap-2 text-sm"><input type="checkbox" name="share" value={x} disabled={sharedOn.has(x)} defaultChecked={!p && x !== 'tiktok'} className="size-5 accent-accent" />
                {t(`pf_${x}` as 'pf_facebook')}{sharedOn.has(x) ? <span className="text-xs text-muted">({t('alreadyShared')})</span> : null}</label>))}</div>
            <label className="grid gap-1 text-sm font-semibold">{t('shareCaption')}<textarea name="caption" rows={5} maxLength={2200} placeholder={t('shareCaptionHint')} className={area} dir="auto" /></label>
            <label className="grid gap-1 text-sm font-semibold sm:max-w-xs">{t('postAt')}<input type="datetime-local" name="post_at" defaultValue={toLocalInput(null)} className={input} /></label>
          </fieldset>
          <button className={`${btn} min-h-11 justify-self-start px-6`}>{t('saveArticle')}</button>
        </section>
      </form>
    </div>
  );
}
