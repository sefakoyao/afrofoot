import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { removePosterPhoto, uploadPosterPhoto } from '@/app/actions/poster';
import { requireArea } from '@/lib/auth';
import { supabaseEnv } from '@/lib/env';
import { POSTER_FORMATS, POSTER_LAYOUTS, POSTER_TITLES, UPLOAD_KINDS, posterGames, type PosterFormat, type PosterLayout, type UploadKind } from '@/lib/poster';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> { return { title: (await getTranslations('poster'))('title') }; }
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const btn = 'inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110';
const tile = 'flex cursor-pointer overflow-hidden rounded-control border-4 border-transparent bg-cover bg-center shadow-sm peer-checked:border-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent';
const chip = 'flex min-h-10 cursor-pointer flex-col items-center justify-center rounded-control border-2 border-line px-3 py-1 text-sm font-bold peer-checked:border-accent peer-checked:bg-accent/10 peer-focus-visible:ring-2 peer-focus-visible:ring-accent';

/** Small drawings of the three layouts, for the layout picker. */
function LayoutSketch({ l }: { l: PosterLayout }) {
  const bar = 'h-1.5 rounded-full bg-white/80';
  return (
    <span className="flex aspect-[4/5] w-full flex-col gap-1 rounded bg-gradient-to-br from-[#1a1a1a] to-[#0d2409] p-2" aria-hidden>
      <span className="h-2 w-2/3 rounded-full bg-white" />
      {l === 'list' ? (
        <span className="flex flex-1 gap-1"><span className="flex w-3/5 flex-col justify-center gap-1 rounded bg-white/20 p-1">{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className="flex gap-0.5"><span className="size-1.5 rounded-sm bg-gold" /><span className={`${bar} flex-1`} /></span>)}</span>
          <span className="flex-1 rounded bg-accent/60" /></span>
      ) : l === 'cards' ? (
        <span className="flex flex-1 flex-col justify-center gap-1">{[3, 3, 4, 1].map((n, i) => <span key={i} className="flex justify-center gap-0.5">{Array.from({ length: n }).map((_, j) => <span key={j} className="h-3 w-3 rounded-sm bg-white/30 ring-1 ring-white/50" />)}</span>)}</span>
      ) : (
        <span className="relative flex-1 rounded bg-white/20 ring-1 ring-white/50">{[[20, 20], [50, 20], [80, 20], [30, 50], [70, 50], [25, 75], [75, 75], [50, 92]].map(([x, y], i) => <span key={i} className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" style={{ left: `${x}%`, top: `${y}%` }} />)}</span>
      )}
    </span>
  );
}

/**
 * Admin → Website → Matchday poster: the Starting XI of a game as an image for social media, in the club's colours with
 * frosted-glass panels. Three layouts, three sizes, a background, an optional featured player photo and "Presented by"
 * sponsor logo (uploaded here), and the title.
 */
export default async function PosterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, locale, supabase] = await Promise.all([getTranslations('poster'), getLocale(), getSupabase()]);
  if (!supabase) return null;
  const tag = isLocale(locale) ? LOCALE_LABELS[locale].intl : 'en-GB';
  const when = new Intl.DateTimeFormat(tag, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const games = await posterGames(supabase);
  const match = games.some((g) => g.id === one(sp.match)) ? one(sp.match) : (games.find((g) => g.kickoff > new Date().toISOString()) ?? games.at(-1))?.id ?? '';
  const format: PosterFormat = (Object.keys(POSTER_FORMATS) as PosterFormat[]).includes(one(sp.format) as PosterFormat) ? (one(sp.format) as PosterFormat) : 'portrait';
  const layout: PosterLayout = (POSTER_LAYOUTS as readonly string[]).includes(one(sp.layout)) ? (one(sp.layout) as PosterLayout) : 'list';
  const title = String(Math.min(POSTER_TITLES.length - 1, Math.max(0, Number(one(sp.title)) || 0)));

  // uploaded images, by use
  const base = supabaseEnv()?.url;
  const url = (p: string) => (base ? `${base}/storage/v1/object/public/public-media/${p}` : '');
  const lists = await Promise.all(UPLOAD_KINDS.map((k) => supabase.storage.from('public-media').list(`posters/${k}`, { limit: 30, sortBy: { column: 'created_at', order: 'desc' } })));
  const uploads = Object.fromEntries(UPLOAD_KINDS.map((k, i) => [k, (lists[i]!.data ?? []).filter((f) => /\.(jpg|jpeg|png)$/.test(f.name)).map((f) => `posters/${k}/${f.name}`)])) as Record<UploadKind, string[]>;
  const backgrounds = [
    { key: 'team', label: t('bgTeam'), thumb: '/posters/team.jpg' },
    { key: 'night', label: t('bgNight'), thumb: null },
    { key: 'pitch', label: t('bgPitch'), thumb: null },
    ...uploads.bg.map((p) => ({ key: `media:${p}`, label: t('bgUpload'), thumb: url(p) })),
  ];
  const bg = backgrounds.some((b) => b.key === one(sp.bg)) ? one(sp.bg) : 'night';
  const sponsor = uploads.sponsor.some((p) => `media:${p}` === one(sp.sponsor)) ? one(sp.sponsor) : '';
  const photo = uploads.player.some((p) => `media:${p}` === one(sp.photo)) ? one(sp.photo) : '';
  const q = new URLSearchParams({ match, layout, format, bg, title, ...(sponsor ? { sponsor } : {}), ...(photo ? { photo } : {}) });
  const result = one(sp.result);
  const SW: Record<string, string> = { night: 'linear-gradient(160deg,#1a1a1a,#0b0b0b 55%,#0d2409)', pitch: 'linear-gradient(165deg,#2c8a20,#1b5e14 55%,#0e3a0a)' };
  const ok = result === 'p_uploaded' || result === 'p_removed';

  const pick = (name: string, value: string, checked: boolean, inner: React.ReactNode, cls = '') => (
    <label className={`relative ${cls}`}><input type="radio" name={name} value={value} defaultChecked={checked} className="peer sr-only" />{inner}</label>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
      </header>
      {result ? <p role={ok ? 'status' : 'alert'} className={`rounded-card p-3 font-semibold ${ok ? 'bg-accent/15 text-pitch' : 'bg-danger/10 text-danger'}`}>{t(result as 'p_uploaded')}</p> : null}

      {games.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-muted" data-no-games>{t('noGames')}</p> : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
          <form method="get" className="grid min-w-0 gap-4 rounded-card border border-line bg-raised p-5" data-poster-form>
            <label className="grid gap-1 text-sm font-semibold">{t('game')}
              <select name="match" defaultValue={match} className="min-h-11 w-full min-w-0 rounded-control border border-line bg-raised px-3 font-normal" data-poster-match>
                {games.map((g) => <option key={g.id} value={g.id}>{when.format(new Date(g.kickoff))} · {g.team} – {g.opponent}</option>)}
              </select></label>

            <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{t('layout')}</legend>
              <div className="grid grid-cols-3 gap-2">{POSTER_LAYOUTS.map((l) => pick('layout', l, l === layout,
                <span className={`${tile} flex-col bg-raised p-1`}><LayoutSketch l={l} /><span className="pt-1 text-center text-xs font-bold">{t(`l_${l}`)}</span></span>))}</div>
            </fieldset>

            <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{t('format')}</legend>
              <div className="flex flex-wrap gap-2">{(Object.keys(POSTER_FORMATS) as PosterFormat[]).map((f) => pick('format', f, f === format,
                <span className={chip}>{t(`f_${f}`)}<span className="text-xs font-normal text-muted">{POSTER_FORMATS[f].w}×{POSTER_FORMATS[f].h}</span></span>))}</div>
            </fieldset>

            <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{t('heading')}</legend>
              <div className="flex flex-wrap gap-2">{POSTER_TITLES.map((x, i) => pick('title', String(i), String(i) === title, <span className={chip}>{x}</span>))}</div>
            </fieldset>

            <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{t('background')}</legend>
              <div className="grid grid-cols-3 gap-2">{backgrounds.map((b) => pick('bg', b.key, b.key === bg,
                <span className={`${tile} aspect-[4/5] items-end`} style={{ backgroundImage: b.thumb ? `url(${b.thumb})` : SW[b.key] }}>
                  <span className="w-full bg-black/70 px-1 py-0.5 text-center text-[11px] font-bold text-white">{b.label}</span></span>, ''))}</div>
            </fieldset>

            <fieldset className="grid gap-2" data-pick-photo><legend className="text-sm font-semibold">{t('featured')}</legend>
              <div className="grid grid-cols-3 gap-2">
                {pick('photo', '', !photo, <span className={`${tile} aspect-[4/5] items-center justify-center bg-surface text-xs font-bold`}>{t('none')}</span>)}
                {uploads.player.map((p) => pick('photo', `media:${p}`, `media:${p}` === photo, <span className={`${tile} aspect-[4/5]`} style={{ backgroundImage: `url(${url(p)})` }} />))}
              </div>
              {uploads.player.length === 0 ? <span className="text-xs text-muted">{t('featuredHint')}</span> : null}
            </fieldset>

            <fieldset className="grid gap-2" data-pick-sponsor><legend className="text-sm font-semibold">{t('sponsor')}</legend>
              <div className="grid grid-cols-3 gap-2">
                {pick('sponsor', '', !sponsor, <span className={`${tile} h-16 items-center justify-center bg-surface text-xs font-bold`}>{t('none')}</span>)}
                {uploads.sponsor.map((p) => pick('sponsor', `media:${p}`, `media:${p}` === sponsor,
                  <span className={`${tile} h-16 items-center justify-center bg-white bg-contain bg-no-repeat`} style={{ backgroundImage: `url(${url(p)})`, backgroundSize: '80% auto' }} />))}
              </div>
              {uploads.sponsor.length === 0 ? <span className="text-xs text-muted">{t('sponsorHint')}</span> : null}
            </fieldset>

            <button className={`${btn} justify-self-start`} data-poster-update>{t('update')}</button>
          </form>

          <section className="grid justify-items-center gap-3 rounded-card border border-line bg-raised p-5" aria-label={t('preview')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/content/xi?${q}`} alt={t('previewAlt')} className={`w-full rounded-card shadow-lg ${format === 'story' ? 'max-w-sm' : 'max-w-xl'}`} data-poster-img />
            <a href={`/api/content/xi?${q}&download=1`} className={btn} data-poster-download>{t('download')}</a>
            <p className="max-w-xl text-center text-xs text-muted">{t('namesNote')}</p>
          </section>
        </div>
      )}

      <section className="grid gap-3 rounded-card border border-line bg-raised p-5" aria-labelledby="up-h">
        <h2 id="up-h" className="font-display text-lg font-extrabold">{t('uploadTitle')}</h2>
        <p className="text-sm text-muted">{t('uploadLead')}</p>
        <form action={uploadPosterPhoto} className="flex flex-wrap items-end gap-3" data-poster-upload>
          <input type="hidden" name="keep" value={q.toString()} />
          <label className="grid gap-1 text-sm font-semibold">{t('uploadKind')}
            <select name="kind" defaultValue="player" className="min-h-10 rounded-control border border-line bg-raised px-3 font-normal" data-upload-kind>
              {UPLOAD_KINDS.map((k) => <option key={k} value={k}>{t(`k_${k}`)}</option>)}
            </select></label>
          <input type="file" name="photo" accept="image/jpeg,image/png" required className="min-w-0 text-sm" />
          <button className="min-h-10 rounded-full border-2 border-fg px-4 font-bold">{t('upload')}</button>
        </form>
        {UPLOAD_KINDS.some((k) => uploads[k].length) ? (
          <ul className="flex flex-wrap gap-2">{UPLOAD_KINDS.flatMap((k) => uploads[k].map((p) => (
            <li key={p}><form action={removePosterPhoto}><input type="hidden" name="path" value={p} /><input type="hidden" name="keep" value={q.toString()} />
              <button className="inline-flex min-h-9 items-center gap-2 rounded-full border border-danger px-3 text-xs font-bold text-danger hover:bg-danger/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url(p)} alt="" className="size-6 rounded object-cover" />{t('removePhoto', { name: t(`k_${k}`) })}</button></form></li>)))}</ul>
        ) : null}
      </section>
    </div>
  );
}
