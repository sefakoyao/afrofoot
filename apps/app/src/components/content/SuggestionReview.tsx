import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { approveSuggestion, rejectSuggestion, saveSuggestion } from '@/app/actions/content';
import { getSupabase } from '@/lib/supabase/server';
import { CaptionField } from './CaptionField';
import { ContentBanner, KindBadge, area, btn, input, toLocalInput } from './shared';
import { SocialPreview } from './SocialPreview';

type S = { id: string; kind: string; title: string; excerpt: string | null; body_md: string; translations: Record<string, Record<string, string>>; social: Record<string, string>;
  checks: string[]; facts: Record<string, unknown>; post_at: string | null; status: string; model: string | null; created_at: string };
const LANGS = [['fi', 'Suomi'], ['fr', 'Français'], ['ar', 'العربية']] as const;
const PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const;
const LIMIT: Record<(typeof PLATFORMS)[number], number> = { facebook: 2200, instagram: 2200, tiktok: 2200 };

/** One suggestion: the article in four languages, the three posts with a preview, what to check, and approve / reject. */
export async function SuggestionReview({ base, id, sp }: { base: string; id: string; sp: Record<string, string | string[] | undefined> }) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [t, locale, supabase] = await Promise.all([getTranslations('content'), getLocale(), getSupabase()]);
  if (!supabase) notFound();
  const { data } = await supabase.from('article_suggestions').select('id, kind, title, excerpt, body_md, translations, social, checks, facts, post_at, status, model, created_at').eq('id', id).maybeSingle();
  if (!data) notFound();
  const s = data as S;
  const open = s.status === 'new';
  const tag = isLocale(locale) ? LOCALE_LABELS[locale].intl : 'en-GB';
  const when = new Intl.DateTimeFormat(tag, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const score = s.kind === 'match_report' && s.facts.goals_for != null ? `${s.facts.goals_for}–${s.facts.goals_against}` : '';
  const q = new URLSearchParams({ t: s.title, k: t(`kind_${s.kind}` as 'kind_event'), ...(score ? { s: score } : {}) });
  const tr = (l: string, f: string) => s.translations?.[l]?.[f] ?? '';
  const ro = !open || undefined;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Link href={base} className="text-sm font-semibold text-pitch underline underline-offset-2">← {t('title')}</Link>
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2"><KindBadge kind={s.kind} label={t(`kind_${s.kind}` as 'kind_event')} />
          {!open ? <span className="rounded-full bg-line px-2 py-0.5 text-xs font-bold">{t(`tab_${s.status}` as 'tab_new')}</span> : null}</div>
        <h1 className="font-display text-2xl font-extrabold">{s.title}</h1>
        <p className="text-sm text-muted">{t('draftedBy', { model: 'Claude' })}</p>
      </header>
      <ContentBanner sp={sp} />

      {s.checks.length ? (
        <section className="rounded-card bg-gold p-4 text-ink-950" aria-labelledby="checks-h" data-check-list>
          <h2 id="checks-h" className="font-display font-extrabold">{t('checksTitle')}</h2>
          <ul className="mt-1 list-disc ps-5 text-sm">{s.checks.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>
      ) : null}

      <form className="grid gap-5" data-review-form>
        <input type="hidden" name="base" value={base} /><input type="hidden" name="id" value={s.id} />
        <section className="rounded-card border border-line bg-raised p-5" aria-labelledby="article-h">
          <h2 id="article-h" className="font-display text-xl font-extrabold">{t('articleTitle')}</h2>
          <p className="text-sm text-muted">{t('articleLead')}</p>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1 text-sm font-semibold">{t('fTitle')} (English)<input name="title" required minLength={3} maxLength={160} defaultValue={s.title} readOnly={ro} className={input} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('fExcerpt')}<textarea name="excerpt" maxLength={300} rows={2} defaultValue={s.excerpt ?? ''} readOnly={ro} className={area} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('fBody')}<textarea name="body_md" required minLength={20} rows={10} defaultValue={s.body_md} readOnly={ro} className={area} data-body-en /></label>
            {LANGS.map(([l, name]) => (
              <details key={l} className="rounded-card bg-surface p-3" data-lang={l}>
                <summary className="cursor-pointer font-bold">{name}{tr(l, 'title') ? <span className="ms-2 font-normal text-muted">· {tr(l, 'title')}</span> : null}</summary>
                <div className="mt-3 grid gap-3" dir={l === 'ar' ? 'rtl' : undefined} lang={l}>
                  <label className="grid gap-1 text-sm font-semibold">{t('fTitle')}<input name={`title_${l}`} maxLength={160} defaultValue={tr(l, 'title')} readOnly={ro} className={input} /></label>
                  <label className="grid gap-1 text-sm font-semibold">{t('fExcerpt')}<textarea name={`excerpt_${l}`} maxLength={300} rows={2} defaultValue={tr(l, 'excerpt')} readOnly={ro} className={area} /></label>
                  <label className="grid gap-1 text-sm font-semibold">{t('fBody')}<textarea name={`body_${l}`} rows={8} defaultValue={tr(l, 'body_md')} readOnly={ro} className={area} /></label>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-card border border-line bg-raised p-5" aria-labelledby="social-h">
          <h2 id="social-h" className="font-display text-xl font-extrabold">{t('socialTitle')}</h2>
          <p className="text-sm text-muted">{t('socialLead')}</p>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            {PLATFORMS.map((p) => (
              <div key={p} className="grid content-start gap-2">
                <label className="flex items-center gap-2 font-bold"><input type="checkbox" name="platforms" value={p} defaultChecked disabled={ro} className="size-5 accent-accent" />{t(`pf_${p}` as 'pf_facebook')}</label>
                <CaptionField name={`social_${p}`} defaultValue={s.social?.[p] ?? ''} max={LIMIT[p]} readOnly={!open} label={t('captionFor', { platform: t(`pf_${p}` as 'pf_facebook') })} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{t('linkHint')}</p>
          <h3 className="mt-5 text-sm font-bold">{t('previewTitle')}</h3>
          <div className="mt-2">
            <SocialPreview captions={{ facebook: s.social?.facebook ?? '', instagram: s.social?.instagram ?? '', tiktok: s.social?.tiktok ?? '' }}
              cardUrl={`/api/content/card?${q}`} tallUrl={`/api/content/card?${q}&tall=1`} labels={{ club: 'Afro Foot Club', justNow: t('justNow') }} />
          </div>
          <p className="mt-2 text-xs text-muted">{t('previewNote')}</p>
        </section>

        {open ? (
          <section className="grid gap-3 rounded-card border-2 border-accent bg-raised p-5" aria-labelledby="approve-h">
            <h2 id="approve-h" className="font-display text-xl font-extrabold">{t('approveTitle')}</h2>
            <label className="grid gap-1 text-sm font-semibold sm:max-w-xs">{t('postAt')}
              <input type="datetime-local" name="post_at" required defaultValue={toLocalInput(s.post_at)} className={input} data-post-at />
              <span className="text-xs font-normal text-muted">{s.post_at ? t('postAtHint', { when: when.format(new Date(s.post_at)) }) : null}</span></label>
            <p className="text-sm">{t('approveLead')}</p>
            <div className="flex flex-wrap gap-2">
              <button formAction={approveSuggestion} className={`${btn} min-h-11 px-6`} data-approve>{t('approve')}</button>
              <button formAction={saveSuggestion} className="min-h-11 rounded-full border-2 border-fg px-5 font-bold" data-save>{t('saveOnly')}</button>
            </div>
          </section>
        ) : null}
      </form>

      {open ? (
        <form action={rejectSuggestion} className="flex flex-wrap items-end gap-2 rounded-card border border-line bg-raised p-4" data-reject-form>
          <input type="hidden" name="base" value={base} /><input type="hidden" name="id" value={s.id} />
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold">{t('rejectReason')}<input name="reason" maxLength={300} className={input} /></label>
          <button className="min-h-10 rounded-full border border-danger px-4 font-bold text-danger hover:bg-danger/10" data-reject>{t('reject')}</button>
        </form>
      ) : null}

      <details className="rounded-card border border-line bg-raised p-4 text-sm">
        <summary className="cursor-pointer font-bold">{t('factsTitle')}</summary>
        <p className="mt-1 text-muted">{t('factsLead')}</p>
        <pre className="mt-2 overflow-x-auto rounded-control bg-surface p-3 text-xs" dir="ltr">{JSON.stringify(s.facts, null, 2)}</pre>
      </details>
    </div>
  );
}
