'use client';

import { type FormEvent, startTransition, useActionState, useState } from 'react';
import { publishPoster, type PublishState } from '@/app/actions/publish';

type Platform = { id: string; label: string; on: boolean };
type Labels = Record<'title' | 'heading' | 'lead' | 'postTitle' | 'postText' | 'platforms' | 'notConnected' | 'captions' | 'captionHint' | 'when' | 'now' | 'later'
  | 'date' | 'time' | 'publish' | 'publishing' | 'storyNote' | 'done' | 'doneLater' | 'openArticle' | 'openSocial' | 'sampleNote', string> & { errors: Record<string, string> };

/**
 * "Publish" under a poster preview (Matchday poster, Player announcement): the article's title and text, the platforms
 * (switched on ones ticked), optional captions, now or later. The poster's current choices are read from the poster form
 * at the moment of publishing, so what is published is what the preview shows.
 */
export function PublishPanel({ formId, source, defaults, platforms, labels, siteUrl, sample }: {
  formId: string; source: 'announce' | 'xi'; defaults: { title: string; text: string }; platforms: Platform[]; labels: Labels; siteUrl: string; sample: boolean;
}) {
  const [state, action, pending] = useActionState<PublishState, FormData>(publishPoster, { status: 'idle' });
  const [when, setWhen] = useState<'now' | 'later'>('now');
  // submitted by hand (not as a form action) so the choices stay in the form when publishing fails and is tried again
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const poster = document.getElementById(formId) as HTMLFormElement | null;
    const q = new URLSearchParams();
    if (poster) for (const [k, v] of new FormData(poster)) if (typeof v === 'string' && v !== '') q.set(k, v);
    fd.set('q', q.toString());
    startTransition(() => action(fd));
  };
  const field = 'min-h-11 w-full min-w-0 rounded-control border border-line bg-raised px-3 font-normal';
  return (
    <section className="grid w-full gap-3 rounded-card border-2 border-accent bg-raised p-5 text-start" aria-labelledby="pub-h" data-publish>
      <div>
        <h2 id="pub-h" className="font-display text-xl font-extrabold">{labels.heading}</h2>
        <p className="mt-1 text-sm text-muted">{labels.lead}</p>
      </div>
      {sample ? <p className="rounded-card bg-gold p-3 text-sm font-semibold text-ink-950" data-publish-sample>{labels.sampleNote}</p> : (
        <form onSubmit={submit} className="grid gap-3">
          <input type="hidden" name="source" value={source} />
          <label className="grid gap-1 text-sm font-semibold">{labels.postTitle}
            <input name="title" required minLength={3} maxLength={160} defaultValue={defaults.title} className={field} data-publish-title /></label>
          <label className="grid gap-1 text-sm font-semibold">{labels.postText}
            <textarea name="text" rows={3} maxLength={2000} defaultValue={defaults.text} className={`${field} py-2`} dir="auto" data-publish-text /></label>
          <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{labels.platforms}</legend>
            <div className="flex flex-wrap gap-2">
              {platforms.map((p) => (
                <label key={p.id} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-2 border-line px-3 text-sm font-bold has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                  <input type="checkbox" name="platform" value={p.id} defaultChecked={p.on} className="size-4 accent-accent" data-publish-platform={p.id} />
                  {p.label}{p.on ? null : <span className="text-xs font-normal text-muted">({labels.notConnected})</span>}
                </label>
              ))}
            </div>
          </fieldset>
          <details className="rounded-control bg-surface p-3">
            <summary className="cursor-pointer text-sm font-semibold">{labels.captions}</summary>
            <p className="mt-1 text-xs text-muted">{labels.captionHint}</p>
            <div className="mt-2 grid gap-2">
              {platforms.map((p) => (
                <label key={p.id} className="grid gap-1 text-xs font-semibold">{p.label}
                  <textarea name={`cap_${p.id}`} rows={p.id === 'x' ? 2 : 3} maxLength={p.id === 'x' ? 280 : 2200} className={`${field} py-2 text-sm`} dir="auto" /></label>
              ))}
            </div>
          </details>
          <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{labels.when}</legend>
            <div className="flex flex-wrap gap-2">
              {(['now', 'later'] as const).map((w) => (
                <label key={w} className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-2 border-line px-4 text-sm font-bold has-[:checked]:border-accent has-[:checked]:bg-accent/10">
                  <input type="radio" name="when" value={w} checked={when === w} onChange={() => setWhen(w)} className="size-4 accent-accent" />{labels[w]}</label>
              ))}
            </div>
            {when === 'later' ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-semibold">{labels.date}<input type="date" name="date" required className={field} /></label>
                <label className="grid gap-1 text-xs font-semibold">{labels.time}<input type="time" name="time" required className={field} /></label>
              </div>
            ) : <><input type="hidden" name="date" value="" /><input type="hidden" name="time" value="" /></>}
          </fieldset>
          <p className="text-xs text-muted">{labels.storyNote}</p>
          {state.status === 'error' ? <p role="alert" className="rounded-control bg-danger/10 p-3 text-sm font-semibold text-danger" data-publish-error={state.error}>{labels.errors[state.error] ?? labels.errors.failed}</p> : null}
          {state.status === 'ok' ? (
            <div role="status" className="grid gap-2 rounded-control bg-accent/15 p-3 text-sm font-semibold text-pitch" data-publish-done>
              <p>{state.later ? labels.doneLater : labels.done}</p>
              <p className="flex flex-wrap gap-3">
                <a href={`${siteUrl}/news/${state.slug}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" data-publish-article>{labels.openArticle}</a>
                {state.posts ? <a href="/admin/content/social" className="underline underline-offset-2">{labels.openSocial}</a> : null}
              </p>
            </div>
          ) : null}
          <button disabled={pending} className="inline-flex min-h-12 items-center justify-center justify-self-start rounded-full bg-accent px-7 font-display font-bold text-on-accent hover:brightness-110 disabled:opacity-60" data-publish-button>
            {pending ? labels.publishing : labels.publish}</button>
        </form>
      )}
    </section>
  );
}
