import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PosterPreview } from '@/components/admin/PosterPreview';
import { ANNOUNCE_KINDS, ANNOUNCE_LIMITS, DEFAULT_MESSAGE, SAMPLE_PLAYER, announceablePlayers, type AnnounceKind } from '@/lib/announce';
import { requireArea } from '@/lib/auth';
import { supabaseEnv } from '@/lib/env';
import { POSTER_FORMATS, type PosterFormat } from '@/lib/poster';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> { return { title: (await getTranslations('announce'))('title') }; }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const chip = 'flex min-h-10 cursor-pointer flex-col items-center justify-center rounded-control border-2 border-line px-3 py-1 text-sm font-bold peer-checked:border-accent peer-checked:bg-accent/10 peer-focus-visible:ring-2 peer-focus-visible:ring-accent';
const tile = 'flex overflow-hidden rounded-control border-2 border-line bg-cover bg-center peer-checked:border-accent peer-checked:ring-2 peer-checked:ring-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent';
const field = 'min-h-11 w-full min-w-0 rounded-control border border-line bg-raised px-3 font-normal';

/**
 * Admin → Website → Player announcement: a "New signing" or "Farewell" poster for one player, with an editable message
 * (empty = the default line), the previous club and contract end for a new signing, a player photo from the Matchday
 * poster's uploads, and a live preview (/api/content/announce). Only players shown publicly can be chosen.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, supabase] = await Promise.all([getTranslations('announce'), getSupabase()]);
  if (!supabase) return null;
  const players = await announceablePlayers(supabase);
  const { data: files } = await supabase.storage.from('public-media').list('posters/player', { limit: 30, sortBy: { column: 'created_at', order: 'desc' } });
  const photos = (files ?? []).filter((f) => /\.(jpg|jpeg|png)$/.test(f.name)).map((f) => `posters/player/${f.name}`);
  const base = supabaseEnv()?.url;
  const url = (p: string) => (base ? `${base}/storage/v1/object/public/public-media/${p}` : '');

  const kind: AnnounceKind = (ANNOUNCE_KINDS as readonly string[]).includes(one(sp.kind)) ? (one(sp.kind) as AnnounceKind) : 'welcome';
  const player = one(sp.player) === SAMPLE_PLAYER || players.some((p) => p.id === one(sp.player)) ? one(sp.player) : SAMPLE_PLAYER;
  const format: PosterFormat = (Object.keys(POSTER_FORMATS) as PosterFormat[]).includes(one(sp.format) as PosterFormat) ? (one(sp.format) as PosterFormat) : 'portrait';
  const photo = photos.some((p) => `media:${p}` === one(sp.photo)) ? one(sp.photo) : '';
  const msg = one(sp.msg).slice(0, ANNOUNCE_LIMITS.message), from = one(sp.from).slice(0, ANNOUNCE_LIMITS.from), until = one(sp.until).slice(0, ANNOUNCE_LIMITS.until);
  const q = new URLSearchParams({ kind, player, format, ...(photo ? { photo } : {}), ...(msg ? { msg } : {}), ...(from ? { from } : {}), ...(until ? { until } : {}) });
  const pick = (name: string, value: string, checked: boolean, inner: React.ReactNode) => (
    <label className="relative"><input type="radio" name={name} value={value} defaultChecked={checked} className="peer sr-only" />{inner}</label>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
      </header>
      {/* fields that belong to one kind only: shown by the chosen kind */}
      <style>{`[data-announce-form]:has(input[name=kind][value=farewell]:checked) [data-only=welcome],[data-announce-form]:has(input[name=kind][value=welcome]:checked) [data-only=farewell]{display:none}[data-announce]:not(:has(option[value=sample]:checked)) [data-sample-note]{display:none}`}</style>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start" data-announce>
        <form id="announce-form" method="get" className="grid min-w-0 gap-4 rounded-card border border-line bg-raised p-5" data-announce-form>
          <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{t('kind')}</legend>
            <div className="grid grid-cols-2 gap-2">{ANNOUNCE_KINDS.map((k) => pick('kind', k, k === kind, <span className={chip}>{t(`k_${k}`)}</span>))}</div>
          </fieldset>
          <label className="grid gap-1 text-sm font-semibold">{t('player')}
            <select name="player" defaultValue={player} className={field} data-announce-player>
              <option value={SAMPLE_PLAYER}>{t('samplePlayer')}</option>
              {players.map((p) => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
            </select>
            <span className="text-xs font-normal text-muted">{t('publicNote')}</span></label>
          <label className="grid gap-1 text-sm font-semibold">{t('message')}
            <textarea name="msg" rows={3} maxLength={ANNOUNCE_LIMITS.message} defaultValue={msg} className={`${field} py-2`} dir="auto" data-announce-msg />
            <span className="text-xs font-normal text-muted" data-only="welcome">{t('messageHint', { text: DEFAULT_MESSAGE.welcome })}</span>
            <span className="text-xs font-normal text-muted" data-only="farewell">{t('messageHint', { text: DEFAULT_MESSAGE.farewell })}</span></label>
          <div className="grid gap-3 sm:grid-cols-2" data-only="welcome">
            <label className="grid gap-1 text-sm font-semibold">{t('from')}<input name="from" maxLength={ANNOUNCE_LIMITS.from} defaultValue={from} className={field} placeholder={t('fromHint')} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('until')}<input name="until" maxLength={ANNOUNCE_LIMITS.until} defaultValue={until} className={field} placeholder={t('untilHint')} /></label>
          </div>
          <p className="text-xs text-muted" data-only="farewell">{t('statsNote')}</p>
          <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{t('format')}</legend>
            <div className="flex flex-wrap gap-2">{(Object.keys(POSTER_FORMATS) as PosterFormat[]).map((f) => pick('format', f, f === format,
              <span className={chip}>{t(`f_${f}`)}<span className="text-xs font-normal text-muted">{POSTER_FORMATS[f].w}×{POSTER_FORMATS[f].h}</span></span>))}</div>
          </fieldset>
          <fieldset className="grid gap-2" data-announce-photo><legend className="text-sm font-semibold">{t('photo')}</legend>
            <div className="grid grid-cols-3 gap-2">
              {pick('photo', '', !photo, <span className={`${tile} aspect-[4/5] items-center justify-center bg-surface text-xs font-bold`}>{t('none')}</span>)}
              {photos.map((p) => pick('photo', `media:${p}`, `media:${p}` === photo, <span className={`${tile} aspect-[4/5]`} style={{ backgroundImage: `url(${url(p)})` }} />))}
            </div>
            <span className="text-xs text-muted">{t('photoHint')} <a href="/admin/content/poster#up-h" className="font-semibold text-pitch underline">{t('photoLink')}</a></span>
          </fieldset>
          <noscript><button className="min-h-11 justify-self-start rounded-full border-2 border-fg px-5 font-bold">{t('update')}</button></noscript>
        </form>
        <section className="grid justify-items-center gap-3 rounded-card border border-line bg-raised p-5" aria-label={t('preview')}>
          <PosterPreview formId="announce-form" initial={q.toString()} alt={t('previewAlt')} download={t('download')} loading={t('loading')} story={format === 'story'} endpoint="/api/content/announce" />
          <p className="max-w-xl rounded-card bg-gold p-2 text-center text-xs font-semibold text-ink-950" data-sample-note>{t('sampleNote')}</p>
        </section>
      </div>
    </div>
  );
}
