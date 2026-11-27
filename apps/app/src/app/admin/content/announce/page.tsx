import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { removePosterPhoto, uploadPosterPhoto } from '@/app/actions/poster';
import { PosterPreview } from '@/components/admin/PosterPreview';
import { TONES } from '@/app/api/content/announce/tryout';
import { DEFAULT_SHADE, DEFAULT_STRENGTH, EFFECTS, effect, type Effect } from '@/lib/poster-art';
import { ANNOUNCE_KINDS, ANNOUNCE_LIMITS, DEFAULT_MESSAGE, TRYOUT_DEFAULTS, SAMPLE_PLAYER, announceablePlayers, palloliittoOnlyPlayers, type AnnounceKind } from '@/lib/announce';
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
 * poster's uploads, and a live preview (/api/content/announce). Players hidden from the club website are not listed.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, tp, supabase] = await Promise.all([getTranslations('announce'), getTranslations('poster'), getSupabase()]);
  if (!supabase) return null;
  const [players, fedOnly] = await Promise.all([announceablePlayers(supabase), palloliittoOnlyPlayers(supabase)]);
  const { data: files } = await supabase.storage.from('public-media').list('posters/player', { limit: 30, sortBy: { column: 'created_at', order: 'desc' } });
  const photos = (files ?? []).filter((f) => /\.(jpg|jpeg|png)$/.test(f.name)).map((f) => `posters/player/${f.name}`);
  // the tryout poster's own photo: the club's background photos (uploaded here or on the Matchday poster) and player photos
  const { data: bgFiles } = await supabase.storage.from('public-media').list('posters/bg', { limit: 30, sortBy: { column: 'created_at', order: 'desc' } });
  const bgPhotos = [...(bgFiles ?? []).filter((f) => /\.(jpg|jpeg|png)$/.test(f.name)).map((f) => `posters/bg/${f.name}`), ...photos];
  const base = supabaseEnv()?.url;
  const url = (p: string) => (base ? `${base}/storage/v1/object/public/public-media/${p}` : '');

  const kind: AnnounceKind = (ANNOUNCE_KINDS as readonly string[]).includes(one(sp.kind)) ? (one(sp.kind) as AnnounceKind) : 'welcome';
  const player = one(sp.player) === SAMPLE_PLAYER || players.some((p) => p.id === one(sp.player)) || fedOnly.some((p) => p.id === one(sp.player)) ? one(sp.player) : SAMPLE_PLAYER;
  const format: PosterFormat = (Object.keys(POSTER_FORMATS) as PosterFormat[]).includes(one(sp.format) as PosterFormat) ? (one(sp.format) as PosterFormat) : 'portrait';
  const photo = photos.some((p) => `media:${p}` === one(sp.photo)) ? one(sp.photo) : '';
  const msg = one(sp.msg).slice(0, ANNOUNCE_LIMITS.message), from = one(sp.from).slice(0, ANNOUNCE_LIMITS.from), until = one(sp.until).slice(0, ANNOUNCE_LIMITS.until);
  // the tryout poster's own fields (an event: date, times, place; empty lines use the defaults, "-" leaves one out)
  const tf = Object.fromEntries((['date', 'start', 'end', 'place', 'address', 'who', 'bring', 'signup'] as const).map((k) => [k, one(sp[k]).slice(0, 80)])) as Record<'date' | 'start' | 'end' | 'place' | 'address' | 'who' | 'bring' | 'signup', string>;
  const bg = bgPhotos.some((p) => `media:${p}` === one(sp.bg)) ? one(sp.bg) : '';
  const tone = (TONES as readonly string[]).includes(one(sp.tone)) ? one(sp.tone) : 'natural';
  const fx: Effect = (EFFECTS as readonly string[]).includes(one(sp.fx)) ? (one(sp.fx) as Effect) : 'none';
  const pct = (k: string, d: number, max = 100) => (sp[k] !== undefined ? String(Math.max(0, Math.min(max, Math.round(Number(one(sp[k])) || 0)))) : String(d));
  const strength = pct('strength', DEFAULT_STRENGTH), shade = pct('shade', DEFAULT_SHADE, 90);
  const ball = one(sp.ball) === '1' || one(sp.ball) === '0' ? one(sp.ball) : bg ? '0' : '1';
  const result = one(sp.result);
  const q = new URLSearchParams({ kind, player, format, ...(kind === 'tryout' ? { bg, tone, fx, strength, shade, ball } : {}), ...(photo ? { photo } : {}), ...(msg ? { msg } : {}), ...(from ? { from } : {}), ...(until ? { until } : {}),
    ...Object.fromEntries(Object.entries(tf).filter(([, v]) => v)) });
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
      <style>{`${ANNOUNCE_KINDS.map((k) => `[data-announce-form]:has(input[name=kind][value=${k}]:checked) [data-only]:not([data-only~=${k}])`).join(',')}{display:none}[data-announce-form]:has(input[name=kind][value=tryout]:checked)~section [data-sample-note]{display:none}[data-announce]:not(:has(option[value=sample]:checked)) [data-sample-note]{display:none}`}</style>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start" data-announce>
        <form id="announce-form" method="get" className="grid min-w-0 gap-4 rounded-card border border-line bg-raised p-5" data-announce-form>
          <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{t('kind')}</legend>
            <div className="grid grid-cols-3 gap-2">{ANNOUNCE_KINDS.map((k) => pick('kind', k, k === kind, <span className={chip}>{t(`k_${k}`)}</span>))}</div>
          </fieldset>
          <label className="grid gap-1 text-sm font-semibold" data-only="welcome farewell">{t('player')}
            <select name="player" defaultValue={player} className={field} data-announce-player>
              <option value={SAMPLE_PLAYER}>{t('samplePlayer')}</option>
              {players.length ? <optgroup label={t('groupApp')}>{players.map((p) => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}</optgroup> : null}
              {fedOnly.length ? <optgroup label={t('groupFed')}>{fedOnly.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup> : null}
            </select>
            <span className="text-xs font-normal text-muted">{players.length || fedOnly.length ? t('publicNote') : t('noPlayers')}</span></label>
          <div className="grid gap-3" data-only="tryout" data-tryout-fields>
            <label className="grid gap-1 text-sm font-semibold">{t('tDate')}<input type="date" name="date" defaultValue={tf.date} className={field} data-tryout-date /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm font-semibold">{t('tStart')}<input type="time" name="start" defaultValue={tf.start} className={field} /></label>
              <label className="grid gap-1 text-sm font-semibold">{t('tEnd')}<input type="time" name="end" defaultValue={tf.end} className={field} /></label>
            </div>
            <label className="grid gap-1 text-sm font-semibold">{t('tPlace')}<input name="place" maxLength={ANNOUNCE_LIMITS.place} defaultValue={tf.place} className={field} placeholder={t('tPlaceHint')} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('tAddress')}<input name="address" maxLength={ANNOUNCE_LIMITS.address} defaultValue={tf.address} className={field} placeholder={t('tAddressHint')} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('tWho')}<input name="who" maxLength={ANNOUNCE_LIMITS.who} defaultValue={tf.who} className={field} placeholder={TRYOUT_DEFAULTS.who} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('tBring')}<input name="bring" maxLength={ANNOUNCE_LIMITS.bring} defaultValue={tf.bring} className={field} placeholder={TRYOUT_DEFAULTS.bring} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('tSignup')}<input name="signup" maxLength={ANNOUNCE_LIMITS.signup} defaultValue={tf.signup} className={field} placeholder={TRYOUT_DEFAULTS.signup} /></label>
            <p className="text-xs text-muted">{t('tLinesHint')}</p>
          </div>
          <label className="grid gap-1 text-sm font-semibold">{t('message')}
            <textarea name="msg" rows={3} maxLength={ANNOUNCE_LIMITS.message} defaultValue={msg} className={`${field} py-2`} dir="auto" data-announce-msg />
            <span className="text-xs font-normal text-muted" data-only="welcome">{t('messageHint', { text: DEFAULT_MESSAGE.welcome })}</span>
            <span className="text-xs font-normal text-muted" data-only="farewell">{t('messageHint', { text: DEFAULT_MESSAGE.farewell })}</span>
            <span className="text-xs font-normal text-muted" data-only="tryout">{t('messageHint', { text: DEFAULT_MESSAGE.tryout })}</span></label>
          <div className="grid gap-3 sm:grid-cols-2" data-only="welcome">
            <label className="grid gap-1 text-sm font-semibold">{t('from')}<input name="from" maxLength={ANNOUNCE_LIMITS.from} defaultValue={from} className={field} placeholder={t('fromHint')} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t('until')}<input name="until" maxLength={ANNOUNCE_LIMITS.until} defaultValue={until} className={field} placeholder={t('untilHint')} /></label>
          </div>
          <p className="text-xs text-muted" data-only="farewell">{t('statsNote')}</p>
          <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{t('format')}</legend>
            <div className="flex flex-wrap gap-2">{(Object.keys(POSTER_FORMATS) as PosterFormat[]).map((f) => pick('format', f, f === format,
              <span className={chip}>{t(`f_${f}`)}<span className="text-xs font-normal text-muted">{POSTER_FORMATS[f].w}×{POSTER_FORMATS[f].h}</span></span>))}</div>
          </fieldset>
          <div className="grid gap-4" data-only="tryout" id="tryout-photo">
            <fieldset className="grid gap-2" data-tryout-bg><legend className="text-sm font-semibold">{t('tBackground')}</legend>
              <div className="grid grid-cols-3 gap-2">
                {pick('bg', '', !bg, <span className={`${tile} aspect-[4/5] items-end bg-[#145010]`}><span className="w-full bg-black/70 px-1 py-0.5 text-center text-[11px] font-bold text-white">{t('tPitch')}</span></span>)}
                {bgPhotos.map((p) => pick('bg', `media:${p}`, `media:${p}` === bg, <span className={`${tile} aspect-[4/5]`} style={{ backgroundImage: `url(${url(p)})` }} />))}
              </div>
              <span className="text-xs text-muted">{t('tUploadHint')}</span>
            </fieldset>
            <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{t('tTone')}</legend>
              <div className="grid grid-cols-3 gap-2">{TONES.map((x) => pick('tone', x, x === tone, <span className={chip}>{t(`tone_${x}`)}</span>))}</div>
            </fieldset>
            <fieldset className="grid gap-2" data-pick-effect><legend className="text-sm font-semibold">{tp('effect')}</legend>
              <div className="grid grid-cols-5 gap-1.5">{EFFECTS.map((e) => { const art = effect(e, 160, 200, 100, 0.55); return pick('fx', e, e === fx,
                <span className={`${tile} aspect-[4/5] flex-col items-stretch justify-end bg-ink-950 bg-cover`} style={art ? { backgroundImage: `url(${art})` } : undefined}>
                  <span className="bg-black/70 px-0.5 py-0.5 text-center text-[10px] font-bold leading-tight text-white">{tp(`fx_${e}`)}</span></span>); })}</div>
              <label className="grid gap-1 text-sm font-semibold">{tp('strength')}
                <input type="range" name="strength" min={0} max={100} step={5} defaultValue={strength} className="w-full accent-accent" /></label>
            </fieldset>
            <label className="grid gap-1 text-sm font-semibold">{tp('shade')}
              <input type="range" name="shade" min={0} max={90} step={5} defaultValue={shade} className="w-full accent-accent" />
              <span className="text-xs font-normal text-muted">{tp('shadeHint')}</span></label>
            <fieldset className="grid gap-2"><legend className="text-sm font-semibold">{t('tBall')}</legend>
              <div className="grid grid-cols-2 gap-2">{pick('ball', '1', ball === '1', <span className={chip}>{t('tBallOn')}</span>)}{pick('ball', '0', ball === '0', <span className={chip}>{t('tBallOff')}</span>)}</div>
            </fieldset>
          </div>
          <fieldset className="grid gap-2" data-announce-photo data-only="welcome farewell"><legend className="text-sm font-semibold">{t('photo')}</legend>
            <div className="grid grid-cols-3 gap-2">
              {pick('photo', '', !photo, <span className={`${tile} aspect-[4/5] items-center justify-center bg-surface text-xs font-bold`}>{t('none')}</span>)}
              {photos.map((p) => pick('photo', `media:${p}`, `media:${p}` === photo, <span className={`${tile} aspect-[4/5]`} style={{ backgroundImage: `url(${url(p)})` }} />))}
            </div>
            <span className="text-xs text-muted">{t('photoHint')} <a href="/admin/content/poster#up-h" className="font-semibold text-pitch underline">{t('photoLink')}</a></span>
          </fieldset>
          <noscript><button className="min-h-11 justify-self-start rounded-full border-2 border-fg px-5 font-bold">{t('update')}</button></noscript>
        </form>
        <section className="grid justify-items-center gap-3 rounded-card border border-line bg-raised p-5" aria-label={t('preview')}>
          {result ? <p role={result === 'p_uploaded' || result === 'p_removed' ? 'status' : 'alert'} className={`w-full rounded-card p-3 text-sm font-semibold ${result === 'p_uploaded' || result === 'p_removed' ? 'bg-accent/15 text-pitch' : 'bg-danger/10 text-danger'}`} data-upload-result>{tp(result as 'p_uploaded')}</p> : null}
          <PosterPreview formId="announce-form" initial={q.toString()} alt={t('previewAlt')} download={t('download')} loading={t('loading')} story={format === 'story'} endpoint="/api/content/announce" />
          <p className="max-w-xl rounded-card bg-gold p-2 text-center text-xs font-semibold text-ink-950" data-sample-note>{t('sampleNote')}</p>
          {kind === 'tryout' ? (
            <div className="grid w-full gap-2 border-t border-line pt-4" data-tryout-upload>
              <h2 className="font-display text-lg font-extrabold">{t('tUploadTitle')}</h2>
              <form action={uploadPosterPhoto} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="keep" value={q.toString()} /><input type="hidden" name="page" value="announce" /><input type="hidden" name="kind" value="bg" />
                <input type="file" name="photo" accept="image/jpeg,image/png" required className="min-w-0 text-sm" />
                <button className="min-h-10 rounded-full border-2 border-fg px-4 font-bold">{tp('upload')}</button>
              </form>
              <p className="text-xs text-muted">{t('tUploadLead')}</p>
              {bg && bg.startsWith('media:posters/bg/') ? (
                <form action={removePosterPhoto}><input type="hidden" name="path" value={bg.slice(6)} /><input type="hidden" name="keep" value={q.toString()} /><input type="hidden" name="page" value="announce" />
                  <button className="min-h-9 rounded-full border border-danger px-3 text-xs font-bold text-danger hover:bg-danger/10">{t('tRemovePhoto')}</button></form>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
