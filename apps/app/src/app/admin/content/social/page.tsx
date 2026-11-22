import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { cancelPost, postNow, retryPost, saveSocialSettings } from '@/app/actions/social';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { checkConnection } from '@/lib/social/meta';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> { return { title: (await getTranslations('social'))('title') }; }

type Post = { id: string; platform: 'facebook' | 'instagram' | 'tiktok'; caption: string; status: string; post_at: string | null; posted_at: string | null; external_url: string | null; error: string | null; news_posts: { title: string } | null };
const PF = { facebook: 'bg-[#1877F2] text-white', instagram: 'bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white', tiktok: 'bg-ink-950 text-white' } as const;
const CHIP: Record<string, string> = { posted: 'bg-accent/15 text-pitch', failed: 'bg-danger/10 text-danger', posting: 'bg-gold text-ink-950', waiting: 'bg-line/60', scheduled: 'bg-line/60', cancelled: 'bg-line/60 text-muted' };

/**
 * Admin → Website → Social media (content assistant step 2, migration 0071): the Facebook Page and Instagram account the
 * server key reaches, automatic posting on / off per platform, whether the 10-minute job is set up, and every queued post
 * with its outcome (posted with a link, failed with the reason, waiting) and Post now / Retry / Cancel.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, locale, supabase, conn] = await Promise.all([getTranslations('social'), getLocale(), getSupabase(), checkConnection()]);
  const [settings, job, posts] = supabase ? await Promise.all([
    supabase.from('site_settings').select('value').eq('key', 'social_posting').maybeSingle(),
    supabase.rpc('social_job_status'),
    supabase.from('social_posts').select('id, platform, caption, status, post_at, posted_at, external_url, error, news_posts(title)').order('post_at', { ascending: false, nullsFirst: false }).limit(60),
  ]) : [null, null, null];
  const on = (settings?.data?.value ?? {}) as Record<string, boolean>;
  const j = ((job?.data ?? []) as { secret_set: boolean; http_ready: boolean; scheduled: boolean }[])[0];
  const jobReady = !!j && j.secret_set && j.http_ready && j.scheduled;
  const rows = (posts?.data ?? []) as unknown as Post[];
  const tag = isLocale(locale) ? LOCALE_LABELS[locale].intl : 'en-GB';
  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat(tag, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE }).format(new Date(iso)) : '');
  const reason = (e?: string) => (!e ? '' : e.startsWith('missing:') ? t('missing', { names: e.slice(8) }) : e === 'noInstagram' ? t('noInstagram') : t('refused', { reason: e }));
  const btn = 'inline-flex min-h-10 items-center rounded-full border border-line bg-raised px-4 text-sm font-bold hover:border-accent';
  const dot = (ok: boolean) => <span className={`size-2.5 shrink-0 rounded-full ${ok ? 'bg-accent' : 'bg-danger'}`} aria-hidden />;

  const card = (p: 'facebook' | 'instagram' | 'tiktok', status: React.ReactNode, toggle: boolean) => (
    <li className="grid content-start gap-3 rounded-card border border-line bg-raised p-4" data-connection={p}>
      <span className={`w-fit rounded-full px-3 py-0.5 text-xs font-bold ${PF[p]}`}>{t(`pf_${p}`)}</span>
      <div className="text-sm">{status}</div>
      {toggle ? (
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" name={p} defaultChecked={on[p] === true} className="size-5 accent-accent" data-auto={p} />{t('auto')}
        </label>
      ) : null}
    </li>
  );

  return (
    <div className="grid gap-5">
      <header className="rounded-card border border-line bg-raised p-5">
        <h1 className="font-display text-3xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 text-muted">{t('lead')}</p>
      </header>
      <ResultBanner ns="social" result={sp.result} />

      <form action={saveSocialSettings} className="grid gap-3 rounded-card border border-line bg-raised p-5" aria-labelledby="conn-h">
        <h2 id="conn-h" className="font-display text-xl font-extrabold">{t('connections')}</h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {card('facebook', conn.facebook.ok
            ? <p className="flex items-center gap-2 font-semibold">{dot(true)}<span>{t('connectedTo')} {conn.facebook.link ? <a href={conn.facebook.link} target="_blank" rel="noreferrer" className="text-pitch underline">{conn.facebook.name}</a> : conn.facebook.name}</span></p>
            : <p className="flex items-start gap-2">{dot(false)}<span>{reason(conn.facebook.error)}</span></p>, conn.facebook.ok)}
          {card('instagram', conn.instagram.ok
            ? <p className="flex items-center gap-2 font-semibold">{dot(true)}<span>{t('connectedTo')} @{conn.instagram.username}</span></p>
            : <p className="flex items-start gap-2">{dot(false)}<span>{reason(conn.instagram.error)}</span></p>, conn.instagram.ok)}
          {card('tiktok', <p className="text-muted">{t('tiktokLater')}</p>, false)}
        </ul>
        <p className={`flex items-start gap-2 text-sm ${jobReady ? '' : 'text-danger'}`} data-job={jobReady ? 'ready' : 'missing'}>{dot(jobReady)}<span>{jobReady ? t('jobReady') : t('jobMissing')}</span></p>
        <p className="text-xs text-muted">{t('setupHint')}</p>
        {conn.facebook.ok || conn.instagram.ok ? <button className="w-fit rounded-full bg-accent px-5 py-2.5 font-bold text-on-accent">{t('save')}</button> : null}
      </form>

      <section className="grid gap-3" aria-labelledby="posts-h">
        <h2 id="posts-h" className="font-display text-xl font-extrabold">{t('posts')}</h2>
        {rows.length === 0 ? <p className="rounded-card border border-line bg-raised p-4 text-muted">{t('none')}</p> : (
          <ul className="grid gap-3">
            {rows.map((p) => {
              const open = ['waiting', 'scheduled', 'failed'].includes(p.status);
              const canPost = open && p.platform !== 'tiktok';
              return (
                <li key={p.id} className="grid gap-2 rounded-card border border-line bg-raised p-4" data-social-post={p.id} data-status={p.status} data-platform={p.platform}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PF[p.platform]}`}>{t(`pf_${p.platform}`)}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${CHIP[p.status] ?? ''}`}>{p.status === 'waiting' && (p.platform === 'tiktok' || !on[p.platform]) ? t('st_waitingConnection') : t(`st_${p.status}` as 'st_posted')}</span>
                    <span className="text-sm text-muted">{p.status === 'posted' ? when(p.posted_at) : when(p.post_at)}</span>
                  </div>
                  <p className="font-bold">{p.news_posts?.title}</p>
                  <p className="line-clamp-3 whitespace-pre-line text-sm text-muted" dir="auto">{p.caption}</p>
                  {p.status === 'failed' && p.error ? <p className="rounded-card bg-danger/10 p-2 text-sm text-danger" data-error>{t('why', { reason: p.error })}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {p.external_url ? <a href={p.external_url} target="_blank" rel="noreferrer" className={btn} data-view>{t('view')}</a> : null}
                    {canPost ? <form action={postNow}><input type="hidden" name="id" value={p.id} /><button className={btn} data-post-now>{t('postNow')}</button></form> : null}
                    {p.status === 'failed' ? <form action={retryPost}><input type="hidden" name="id" value={p.id} /><button className={btn} data-retry>{t('retry')}</button></form> : null}
                    {open ? <form action={cancelPost}><input type="hidden" name="id" value={p.id} /><button className={`${btn} text-danger`} data-cancel>{t('cancel')}</button></form> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
