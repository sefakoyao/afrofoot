import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { removePosterPhoto, uploadPosterPhoto } from '@/app/actions/poster';
import { requireArea } from '@/lib/auth';
import { POSTER_FORMATS, posterGames, type PosterFormat } from '@/lib/poster';
import { supabaseEnv } from '@/lib/env';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> { return { title: (await getTranslations('poster'))('title') }; }
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
const btn = 'inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-6 font-display font-bold text-on-accent hover:brightness-110';

/**
 * Admin → Website → Matchday poster: the Starting XI of a game as an image for social media, in the club's colours,
 * on a club photo, an uploaded photo or a plain background. Square, portrait (Instagram / Facebook) or story size.
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
  const { data: files } = await supabase.storage.from('public-media').list('posters', { limit: 30, sortBy: { column: 'created_at', order: 'desc' } });
  const uploads = (files ?? []).filter((f) => /\.(jpg|png|webp)$/.test(f.name)).map((f) => `posters/${f.name}`);
  const base = supabaseEnv()?.url;
  const backgrounds = [
    { key: 'team', label: t('bgTeam'), thumb: '/posters/team.jpg' },
    { key: 'night', label: t('bgNight'), thumb: null },
    { key: 'pitch', label: t('bgPitch'), thumb: null },
    ...uploads.map((p) => ({ key: `media:${p}`, label: t('bgUpload'), thumb: base ? `${base}/storage/v1/object/public/public-media/${p}` : null })),
  ];
  const bg = backgrounds.some((b) => b.key === one(sp.bg)) ? one(sp.bg) : 'team';
  const q = new URLSearchParams({ match, format, bg });
  const result = one(sp.result);
  const SW: Record<string, string> = { night: 'linear-gradient(160deg,#161616,#0b0b0b 55%,#0f2a0b)', pitch: 'linear-gradient(180deg,#2f8f22,#1f6e17)' };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
      </header>
      {result ? <p role={result.startsWith('p_up') || result === 'p_removed' ? 'status' : 'alert'} className={`rounded-card p-3 font-semibold ${result.startsWith('p_up') || result === 'p_removed' ? 'bg-accent/15 text-pitch' : 'bg-danger/10 text-danger'}`}>{t(result as 'p_uploaded')}</p> : null}

      {games.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-muted" data-no-games>{t('noGames')}</p> : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
          <form method="get" className="grid min-w-0 gap-4 rounded-card border border-line bg-raised p-5" data-poster-form>
            <label className="grid gap-1 text-sm font-semibold">{t('game')}
              <select name="match" defaultValue={match} className="min-h-11 w-full min-w-0 rounded-control border border-line bg-raised px-3 font-normal" data-poster-match>
                {games.map((g) => <option key={g.id} value={g.id}>{when.format(new Date(g.kickoff))} · {g.team} – {g.opponent}</option>)}
              </select></label>
            <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{t('format')}</legend>
              <div className="flex flex-wrap gap-2">{(Object.keys(POSTER_FORMATS) as PosterFormat[]).map((f) => (
                <label key={f} className="relative"><input type="radio" name="format" value={f} defaultChecked={f === format} className="peer sr-only" />
                  <span className="flex min-h-10 cursor-pointer flex-col items-center rounded-control border-2 border-line px-3 py-1 text-sm font-bold peer-checked:border-accent peer-checked:bg-accent/10 peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                    {t(`f_${f}`)}<span className="text-xs font-normal text-muted">{POSTER_FORMATS[f].w}×{POSTER_FORMATS[f].h}</span></span></label>))}</div>
            </fieldset>
            <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{t('background')}</legend>
              <div className="grid grid-cols-3 gap-2">{backgrounds.map((b) => (
                <label key={b.key} className="relative" title={b.label}><input type="radio" name="bg" value={b.key} defaultChecked={b.key === bg} className="peer sr-only" />
                  <span className="flex aspect-[4/5] cursor-pointer items-end overflow-hidden rounded-control border-4 border-transparent bg-cover bg-center shadow-sm peer-checked:border-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
                    style={{ backgroundImage: b.thumb ? `url(${b.thumb})` : SW[b.key] }}>
                    <span className="w-full bg-black/70 px-1 py-0.5 text-center text-[11px] font-bold text-white">{b.label}</span></span></label>))}</div>
            </fieldset>
            <button className={`${btn} justify-self-start`} data-poster-update>{t('update')}</button>
          </form>

          <section className="grid justify-items-center gap-3 rounded-card border border-line bg-raised p-5" aria-label={t('preview')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/content/xi?${q}`} alt={t('previewAlt')} className={`w-full rounded-card shadow-lg ${format === 'story' ? 'max-w-sm' : 'max-w-xl'}`} data-poster-img />
            <div className="flex flex-wrap justify-center gap-2">
              <a href={`/api/content/xi?${q}&download=1`} className={btn} data-poster-download>{t('download')}</a>
            </div>
            <p className="max-w-xl text-center text-xs text-muted">{t('namesNote')}</p>
          </section>
        </div>
      )}

      <section className="grid gap-3 rounded-card border border-line bg-raised p-5" aria-labelledby="up-h">
        <h2 id="up-h" className="font-display text-lg font-extrabold">{t('uploadTitle')}</h2>
        <p className="text-sm text-muted">{t('uploadLead')}</p>
        <form action={uploadPosterPhoto} className="flex flex-wrap items-end gap-2" data-poster-upload>
          <input type="hidden" name="match" value={match} /><input type="hidden" name="format" value={format} />
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required className="min-w-0 text-sm" />
          <button className="min-h-10 rounded-full border-2 border-fg px-4 font-bold">{t('upload')}</button>
        </form>
        {uploads.length ? (
          <ul className="flex flex-wrap gap-2">{uploads.map((p) => (
            <li key={p}><form action={removePosterPhoto}><input type="hidden" name="path" value={p} /><input type="hidden" name="match" value={match} /><input type="hidden" name="format" value={format} />
              <button className="min-h-9 rounded-full border border-danger px-3 text-xs font-bold text-danger hover:bg-danger/10">{t('removePhoto', { name: p.slice(8, 16) })}</button></form></li>))}</ul>
        ) : null}
      </section>
    </div>
  );
}
