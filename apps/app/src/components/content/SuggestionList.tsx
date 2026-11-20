import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { addEditor, findTopics, removeEditor, saveContentSettings } from '@/app/actions/content';
import { NavIcon } from '@/components/NavIcon';
import { draftingAvailable } from '@/lib/content/draft';
import { contentEnvReport, webUrl } from '@/lib/env';
import { getSupabase } from '@/lib/supabase/server';
import { ContentBanner, KindBadge, btn, input } from './shared';

type Row = { id: string; kind: string; title: string; excerpt: string | null; status: string; checks: string[]; post_at: string | null; created_at: string; news_post_id: string | null;
  news_posts: { slug: string } | null };
type Social = { news_post_id: string; platform: string; status: string };
const TABS = ['new', 'approved', 'rejected'] as const;

/**
 * Website → Suggestions (content assistant, migration 0064): the articles drafted from the club's data, waiting for an
 * approver; "Find new topics now"; and for admins the posting time and the communications people.
 */
export async function SuggestionList({ base, isAdmin, sp }: { base: string; isAdmin: boolean; sp: Record<string, string | string[] | undefined> }) {
  const [t, locale, supabase] = await Promise.all([getTranslations('content'), getLocale(), getSupabase()]);
  if (!supabase) return null;
  const tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as (typeof TABS)[number]) : 'new';
  const tag = isLocale(locale) ? LOCALE_LABELS[locale].intl : 'en-GB';
  const when = new Intl.DateTimeFormat(tag, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const [{ data: rows }, { data: counts }] = await Promise.all([
    supabase.from('article_suggestions').select('id, kind, title, excerpt, status, checks, post_at, created_at, news_post_id, news_posts(slug)').eq('status', tab).order('created_at', { ascending: false }).limit(50),
    supabase.from('article_suggestions').select('status'),
  ]);
  const list = (rows ?? []) as unknown as Row[];
  const count = (s: string) => ((counts ?? []) as { status: string }[]).filter((r) => r.status === s).length;
  const postIds = list.map((r) => r.news_post_id).filter((x): x is string => !!x);
  const { data: socialRows } = postIds.length ? await supabase.from('social_posts').select('news_post_id, platform, status').in('news_post_id', postIds) : { data: [] };
  const social = (socialRows ?? []) as Social[];
  const ready = draftingAvailable();

  // admins: settings
  let settings: { post_time: string } = { post_time: 'best' };
  let editors: { profile_id: string; name: string }[] = [], people: { id: string; name: string }[] = [];
  if (isAdmin) {
    const [{ data: s }, { data: ed }, { data: pr }] = await Promise.all([
      supabase.from('site_settings').select('value').eq('key', 'content').maybeSingle(),
      supabase.from('content_editors').select('profile_id, profiles!content_editors_profile_id_fkey(first_name, last_name, email)'),
      supabase.from('profiles').select('id, first_name, last_name, email, role').eq('status', 'active').not('role', 'in', '(super_admin,club_admin)').order('last_name').limit(500),
    ]);
    settings = { post_time: String((s?.value as { post_time?: string } | null)?.post_time ?? 'best') };
    const nm = (p: { first_name: string | null; last_name: string | null; email: string | null } | null) => (p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || '' : '');
    editors = ((ed ?? []) as unknown as { profile_id: string; profiles: { first_name: string | null; last_name: string | null; email: string | null } | null }[]).map((e) => ({ profile_id: e.profile_id, name: nm(e.profiles) }));
    const taken = new Set(editors.map((e) => e.profile_id));
    people = ((pr ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]).filter((p) => !taken.has(p.id)).map((p) => ({ id: p.id, name: nm(p) }));
  }
  const fixed = settings.post_time !== 'best';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
        </div>
        <Link href={`${base}/news`} className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-fg px-4 font-bold hover:bg-fg hover:text-raised"><NavIcon name="list" />{t('allNews')}</Link>
      </header>
      <ContentBanner sp={sp} />

      <section className="flex flex-wrap items-center gap-3 rounded-card border-2 border-accent/40 bg-accent/5 p-4" data-find-topics>
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent"><NavIcon name="star" className="size-6" /></span>
        <p className="min-w-0 flex-1 text-sm"><span className="block font-bold">{t('autoTitle')}</span>{ready ? t('autoLead') : <span className="font-semibold text-danger">{t('noKeyLead')}</span>}</p>
        <form action={findTopics}><input type="hidden" name="base" value={base} />
          <button className={btn} disabled={!ready} data-find-now>{t('findNow')}</button></form>
        {isAdmin ? (() => { const r = contentEnvReport(); return (
          <p className="basis-full border-t border-accent/30 pt-2 text-xs text-muted" data-env-status>
            {t('envStatus', { env: r.vercelEnv, commit: r.commit || '–' })}{' '}
            {r.settings.map((x) => <span key={x.name} className={`me-2 inline-block rounded-full px-2 py-0.5 font-mono font-bold ${x.set && x.looksRight ? 'bg-accent/20 text-pitch' : 'bg-danger/10 text-danger'}`} data-env={x.name}>
              {x.name}: {x.set ? (x.looksRight ? t('envSet') : t('envOdd')) : t('envMissing')}</span>)}
          </p>); })() : null}
      </section>

      <nav className="flex gap-2 border-b border-line" aria-label={t('tabsLabel')}>
        {TABS.map((x) => (
          <Link key={x} href={`${base}?tab=${x}`} aria-current={x === tab ? 'page' : undefined}
            className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-4 px-3 font-display font-extrabold ${x === tab ? 'border-accent' : 'border-transparent text-muted hover:text-fg'}`}>
            {t(`tab_${x}`)}<span className="rounded-full bg-line px-2 text-xs">{count(x)}</span>
          </Link>
        ))}
      </nav>

      {list.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-muted" data-no-suggestions>{t(`none_${tab}`)}</p> : (
        <ul className="grid gap-3">
          {list.map((s) => {
            const posts = social.filter((p) => p.news_post_id === s.news_post_id);
            return (
              <li key={s.id} className="rounded-card border border-line bg-raised p-4 transition hover:border-accent" data-suggestion={s.title}>
                <div className="flex flex-wrap items-center gap-2">
                  <KindBadge kind={s.kind} label={t(`kind_${s.kind}` as 'kind_event')} />
                  <span className="text-xs text-muted">{t('drafted', { when: when.format(new Date(s.created_at)) })}</span>
                  {s.status === 'new' && s.checks.length ? <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-ink-950" data-checks>{t('toCheck', { count: s.checks.length })}</span> : null}
                </div>
                <Link href={`${base}/s/${s.id}`} className="mt-2 block font-display text-lg font-extrabold hover:text-pitch">{s.title}</Link>
                {s.excerpt ? <p className="mt-1 text-sm text-muted">{s.excerpt}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  {s.status === 'new' ? <>
                    {s.post_at ? <span className="text-muted">{t('bestTime', { when: when.format(new Date(s.post_at)) })}</span> : null}
                    <Link href={`${base}/s/${s.id}`} className={`${btn} ms-auto inline-flex items-center`}>{t('review')}</Link>
                  </> : null}
                  {s.status === 'approved' && s.news_posts ? <a href={`${webUrl()}/news/${s.news_posts.slug}`} target="_blank" rel="noopener" className="font-semibold text-pitch underline underline-offset-2" data-article-link>{t('openArticle')}</a> : null}
                  {s.status === 'approved' ? posts.map((p) => (
                    <span key={p.platform} className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.status === 'posted' ? 'bg-accent/20 text-pitch' : p.status === 'failed' ? 'bg-danger/10 text-danger' : 'bg-line'}`} data-social-status={`${p.platform}:${p.status}`}>
                      {t(`pf_${p.platform}` as 'pf_facebook')}: {t(`ps_${p.status}` as 'ps_waiting')}</span>
                  )) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isAdmin ? (
        <details className="rounded-card border border-line bg-raised p-6" data-content-settings>
          <summary className="cursor-pointer font-display text-xl font-extrabold">{t('settingsTitle')}</summary>
          <form action={saveContentSettings} className="mt-4 grid gap-2">
            <p className="text-sm font-bold">{t('postTimeTitle')}</p>
            <label className="flex items-start gap-2 text-sm"><input type="radio" name="mode" value="best" defaultChecked={!fixed} className="mt-1 size-4 accent-accent" />
              <span><b>{t('postTimeBest')}</b><span className="block text-muted">{t('postTimeBestHint')}</span></span></label>
            <label className="flex flex-wrap items-center gap-2 text-sm"><input type="radio" name="mode" value="fixed" defaultChecked={fixed} className="size-4 accent-accent" /><b>{t('postTimeFixed')}</b>
              <input type="time" name="time" defaultValue={fixed ? settings.post_time : '18:00'} className="min-h-9 rounded-control border border-line bg-raised px-2" /></label>
            <button className={`${btn} mt-1 justify-self-start`}>{t('save')}</button>
          </form>
          <div className="mt-6 grid gap-2" data-editors>
            <p className="text-sm font-bold">{t('editorsTitle')}</p>
            <p className="text-sm text-muted">{t('editorsLead')}</p>
            <ul className="divide-y divide-line">
              {editors.map((e) => (
                <li key={e.profile_id} className="flex items-center justify-between gap-2 py-2" data-editor={e.name}>
                  <bdi className="font-semibold">{e.name}</bdi>
                  <form action={removeEditor}><input type="hidden" name="profile_id" value={e.profile_id} />
                    <button className="min-h-9 rounded-full border border-danger px-3 text-sm font-bold text-danger hover:bg-danger/10">{t('remove')}</button></form>
                </li>
              ))}
              {editors.length === 0 ? <li className="py-2 text-sm text-muted">{t('editorsNone')}</li> : null}
            </ul>
            <form action={addEditor} className="flex flex-wrap items-end gap-2">
              <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold sm:max-w-sm">{t('editorPick')}
                <select name="profile_id" required defaultValue="" className={input}><option value="" disabled>{t('choose')}</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <button className={btn}>{t('editorAdd')}</button>
            </form>
          </div>
        </details>
      ) : null}
    </div>
  );
}
