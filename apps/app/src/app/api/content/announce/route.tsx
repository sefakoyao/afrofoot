import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { isAdminRole } from '@afrofoot/db';
import { ANNOUNCE_KINDS, ANNOUNCE_LIMITS, DEFAULT_MESSAGE, TRYOUT_DEFAULTS, FED_ID, SAMPLE_PLAYER, loadAnnouncePlayer, loadPalloliittoPlayer, samplePlayer, type AnnounceKind } from '@/lib/announce';
import { getMember } from '@/lib/auth';
import { FONT_BLACK_WOFF, FONT_BOLD } from '@/lib/invoice/assets';
import { CREST_RATIO, DEFAULT_SHADE, DEFAULT_STRENGTH, EFFECTS, clubBand, photoPlaceholder, type Effect } from '@/lib/poster-art';
import { NEVERA_OTF } from '@/lib/poster-font';
import { POSTER_FORMATS, UPLOAD_PATH, type PosterFormat } from '@/lib/poster';
import { getSupabase } from '@/lib/supabase/server';
import { TONES, tryoutPoster, type Tone } from './tryout';

/**
 * A player announcement poster as a PNG (Admin → Website → Player announcement): "New signing" (welcome) or "Thank you"
 * (farewell) for one player, in the matchday poster's style (the club tab, the crest, the title in Nevera, the rest in
 * Figtree). Query: kind, player (id or "sample"), format, photo (media:posters/player/…), msg (the editable message;
 * empty = the default line), from and until (new signing: previous club, contract end), download=1. Admins only.
 * Players who removed themselves from the club website cannot be announced (lib/announce.ts).
 */
export const dynamic = 'force-dynamic';

const GREEN = '#3DAF2C', GOLD = '#EDF70F', INK = '#0b0b0b';
const FONTS = [
  { name: 'Figtree', weight: 700 as const, style: 'normal' as const, data: Buffer.from(FONT_BOLD, 'base64') },
  { name: 'Figtree', weight: 900 as const, style: 'normal' as const, data: Buffer.from(FONT_BLACK_WOFF, 'base64') },
  { name: 'Nevera', weight: 400 as const, style: 'normal' as const, data: Buffer.from(NEVERA_OTF, 'base64') },
];
const POSITION: Record<string, string> = { goalkeeper: 'GOALKEEPER', defender: 'DEFENDER', midfielder: 'MIDFIELDER', forward: 'FORWARD' };
const clean = (v: string | null, max: number) => (v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
async function dataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try { const r = await fetch(url); return r.ok ? `data:${r.headers.get('content-type') ?? 'image/png'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}` : null; } catch { return null; }
}

export async function GET(req: NextRequest) {
  const member = await getMember();
  if (!member || member.status !== 'active' || !isAdminRole(member.role)) return new Response('Not allowed', { status: 403 });
  const q = req.nextUrl.searchParams;
  const kind: AnnounceKind = (ANNOUNCE_KINDS as readonly string[]).includes(q.get('kind') ?? '') ? (q.get('kind') as AnnounceKind) : 'welcome';
  const format: PosterFormat = (Object.keys(POSTER_FORMATS) as PosterFormat[]).includes(q.get('format') as PosterFormat) ? (q.get('format') as PosterFormat) : 'portrait';
  const { w: TW, h: TH } = POSTER_FORMATS[format];
  if (kind === 'tryout') {
    // an event, not a player: date, times, place and lines typed by the admin (empty lines use the defaults)
    const field = (k: keyof typeof ANNOUNCE_LIMITS) => clean(q.get(k), ANNOUNCE_LIMITS[k]);
    const opt = (k: 'who' | 'bring' | 'signup') => (q.has(k) && q.get(k) === '-' ? '' : field(k) || TRYOUT_DEFAULTS[k]);   // "-" leaves the line out
    const hhmm = (k: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(q.get(k) ?? '') ? q.get(k)! : '');
    const tPhotoPath = q.get('bg')?.startsWith('media:') ? q.get('bg')!.slice(6) : '';
    const tBase = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
    const [tPhoto, tCrest] = await Promise.all([dataUrl(UPLOAD_PATH.test(tPhotoPath) && /^posters\/(bg|player)\//.test(tPhotoPath) && tBase ? `${tBase}/storage/v1/object/public/public-media/${tPhotoPath}` : null), dataUrl(`${req.nextUrl.origin}/afc-logo.png`)]);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') ?? '') ? q.get('date')! : '';
    const pct = (k: string, d: number, max = 100) => (q.has(k) ? Math.max(0, Math.min(max, Math.round(Number(q.get(k)) || 0))) : d);
    const tone: Tone = (TONES as readonly string[]).includes(q.get('tone') ?? '') ? (q.get('tone') as Tone) : 'natural';
    const fx: Effect = (EFFECTS as readonly string[]).includes(q.get('fx') ?? '') ? (q.get('fx') as Effect) : 'none';
    const ball = q.has('ball') ? q.get('ball') === '1' : !tPhoto;   // the ball by default only without a photo
    return new ImageResponse(tryoutPoster({ format, W: TW, H: TH, origin: req.nextUrl.origin, crest: tCrest, photo: tPhoto, tone, fx, strength: pct('strength', DEFAULT_STRENGTH), shade: pct('shade', DEFAULT_SHADE, 90), ball,
      date, start: hhmm('start'), end: hhmm('end'),
      place: field('place'), address: field('address'), who: opt('who'), bring: opt('bring'), message: clean(q.get('msg'), ANNOUNCE_LIMITS.message) || DEFAULT_MESSAGE.tryout, signup: opt('signup') }),
    { width: TW, height: TH, fonts: FONTS, headers: q.get('download') === '1'
      ? { 'Content-Disposition': `attachment; filename="tryout-${date || 'date'}-${format}.png"`, 'Cache-Control': 'no-store' }
      : { 'Cache-Control': 'private, max-age=60' } });
  }
  const id = q.get('player') ?? SAMPLE_PLAYER;
  const isSample = id === SAMPLE_PLAYER;
  const isFed = FED_ID.test(id);
  if (!isSample && !isFed && !/^[0-9a-f-]{36}$/.test(id)) return new Response('Choose a player', { status: 400 });
  const supabase = await getSupabase();
  const p = isSample ? samplePlayer(kind) : !supabase ? null : isFed ? await loadPalloliittoPlayer(supabase, id) : await loadAnnouncePlayer(supabase, id);
  if (!p) return new Response('Player not found or hidden from the website', { status: 404 });
  const message = clean(q.get('msg'), ANNOUNCE_LIMITS.message) || DEFAULT_MESSAGE[kind];
  const from = clean(q.get('from'), ANNOUNCE_LIMITS.from), until = clean(q.get('until'), ANNOUNCE_LIMITS.until);

  const { w: W, h: H } = POSTER_FORMATS[format];
  const sq = format === 'square', story = format === 'story', pad = sq ? 56 : 64;
  const origin = req.nextUrl.origin;
  const photoPath = q.get('photo')?.startsWith('media:') ? q.get('photo')!.slice(6) : '';
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  const [photo, crest] = await Promise.all([dataUrl(UPLOAD_PATH.test(photoPath) && photoPath.startsWith('posters/player/') && base ? `${base}/storage/v1/object/public/public-media/${photoPath}` : null), dataUrl(`${origin}/afc-logo.png`)]);

  const welcome = kind === 'welcome';
  const title = welcome ? 'NEW SIGNING' : 'THANK YOU';
  const tag = welcome ? 'WELCOME TO THE CLUB' : 'FAREWELL';
  const country = p.nationality ? (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(p.nationality!)?.toUpperCase() ?? null; } catch { return null; } })() : null;
  const surname = p.lastName.toUpperCase(), first = p.firstName.toUpperCase();
  const nameSize = Math.round(Math.min(sq ? 96 : 118, ((sq ? 96 : 118) * 9) / Math.max(9, surname.length)));
  const crestW = sq ? 120 : 150, crestH = Math.round(crestW * CREST_RATIO);
  const photoTop = story ? 330 : sq ? 210 : 250, photoW = sq ? 600 : 760, photoH = H - photoTop - (story ? 380 : sq ? 250 : 260);
  const chip = (text: string, bg: string, fg = '#fff') => <span style={{ display: 'flex', alignItems: 'center', padding: '8px 18px', borderRadius: 10, background: bg, color: fg, fontSize: sq ? 22 : 26, fontWeight: 900, letterSpacing: 2 }}>{text}</span>;
  const stat = (v: string, l: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: sq ? 170 : 200, height: sq ? 100 : 118, borderRadius: 18, background: 'rgba(255,255,255,.1)', border: '2px solid rgba(255,255,255,.18)' }}>
      <span style={{ display: 'flex', fontSize: v.length > 4 ? (sq ? 34 : 40) : sq ? 42 : 48, fontWeight: 900, color: GOLD, lineHeight: 1 }}>{v}</span>
      <span style={{ display: 'flex', fontSize: sq ? 15 : 18, fontWeight: 900, letterSpacing: 3, marginTop: 8 }}>{l}</span>
    </div>
  );
  const seasons = p.seasons ? (p.seasons.from === p.seasons.to ? String(p.seasons.from) : `${p.seasons.from}–${String(p.seasons.to).slice(2)}`) : '–';

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: INK, color: '#fff', fontFamily: 'Figtree', fontWeight: 700,
        backgroundImage: welcome ? `radial-gradient(circle at 75% 35%, #2f9223 0%, #134a0e 40%, ${INK} 80%)` : `radial-gradient(circle at 75% 35%, #3a3a3a 0%, #1b1b1b 45%, ${INK} 85%)` }}>
        {/* the shirt number, large and faint, behind the photo */}
        {p.shirt != null ? <span style={{ position: 'absolute', left: 24, top: photoTop - 10, display: 'flex', fontSize: Math.round(H * (story ? 0.3 : 0.42)), fontWeight: 900, lineHeight: 1, letterSpacing: -20, color: welcome ? 'rgba(237,247,15,.13)' : 'rgba(255,255,255,.08)' }}>{p.shirt}</span> : null}
        {/* the player photo, fading out to the left, top and bottom */}
        {photo ? (
          <div style={{ position: 'absolute', right: 0, top: photoTop, width: photoW, height: photoH, display: 'flex', maskImage: 'linear-gradient(180deg, transparent 0%, #000 16%, #000 72%, transparent 100%)' }}>
            <img src={photo} alt="" width={photoW} height={photoH} style={{ width: photoW, height: photoH, objectFit: 'cover', objectPosition: 'center top', maskImage: 'linear-gradient(90deg, transparent 0%, #000 24%)', ...(welcome ? {} : { filter: 'grayscale(35%)' }) }} />
          </div>
        ) : q.get('download') !== '1' ? (
          <div style={{ position: 'absolute', right: pad, top: photoTop + 90, width: photoW - 160, height: photoH - 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 30 }}>
            <img src={photoPlaceholder(photoW - 160, photoH - 180)} alt="" width={photoW - 160} height={photoH - 180} style={{ position: 'absolute', left: 0, top: 0 }} />
            <span style={{ display: 'flex', fontSize: 26, fontWeight: 900, letterSpacing: 4 }}>PLAYER PHOTO</span>
            <span style={{ display: 'flex', fontSize: 18, color: 'rgba(255,255,255,.8)', marginTop: 6 }}>Preview only</span>
          </div>
        ) : null}
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: W, height: story ? 760 : sq ? 420 : 520, display: 'flex', backgroundImage: `linear-gradient(180deg, rgba(11,11,11,0), rgba(11,11,11,.92) 40%, ${INK})` }} />

        {/* the club tab, the crest, the label and the title */}
        <img src={clubBand(W, 440, 56)} alt="" width={W} height={56} style={{ position: 'absolute', left: 0, top: 0 }} />
        <span style={{ position: 'absolute', left: pad, top: 0, height: 56, display: 'flex', alignItems: 'center', fontSize: 22, fontWeight: 900, letterSpacing: 5, color: INK }}>AFRO FOOT CLUB</span>
        <img src={crest ?? `${origin}/afc-logo.png`} alt="" width={crestW} height={crestH} style={{ position: 'absolute', right: pad, top: 84, width: crestW, height: crestH, objectFit: 'contain' }} />
        <div style={{ position: 'absolute', left: pad, top: 96, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex' }}>{chip(tag, welcome ? GOLD : '#fff', INK)}</div>
          <span style={{ display: 'flex', fontFamily: 'Nevera', fontWeight: 400, fontSize: sq ? 80 : 94, lineHeight: 1, letterSpacing: 1 }}>{title}</span>
        </div>
        {isSample ? <div style={{ position: 'absolute', right: pad, top: 84 + crestH + 14, display: 'flex', background: '#fff', color: INK, fontSize: 22, fontWeight: 900, letterSpacing: 4, padding: '4px 12px', borderRadius: 6 }}>SAMPLE</div> : null}

        {/* the player: first name, surname, details; the message */}
        <div style={{ position: 'absolute', left: pad, right: pad, bottom: sq ? 80 : 96, display: 'flex', flexDirection: 'column', gap: sq ? 10 : 14 }}>
          <span style={{ display: 'flex', fontSize: sq ? 32 : 40, fontWeight: 900, letterSpacing: 6, color: GOLD }}>{first.slice(0, 24)}</span>
          <span style={{ display: 'flex', fontSize: nameSize, fontWeight: 900, lineHeight: 0.9, letterSpacing: -1 }}>{surname.slice(0, 22)}</span>
          {welcome ? (
            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
              {p.shirt != null ? chip(`#${p.shirt}`, GREEN, INK) : null}
              {p.position ? chip(POSITION[p.position] ?? p.position.toUpperCase(), 'rgba(255,255,255,.14)') : null}
              {country ? chip(country.slice(0, 20), 'rgba(255,255,255,.14)') : null}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
              {stat(seasons, 'SEASONS')}{stat(String(p.games), 'GAMES')}{stat(String(p.goals), 'GOALS')}{p.shirt != null ? stat(`#${p.shirt}`, 'SHIRT') : null}
            </div>
          )}
          {!welcome && p.source === 'palloliitto' ? <span style={{ display: 'flex', fontSize: sq ? 15 : 17, letterSpacing: 2, color: 'rgba(255,255,255,.6)' }}>OFFICIAL LEAGUE AND CUP GAMES · PALLOLIITTO</span> : null}
          {welcome && (from || until) ? (
            <span style={{ display: 'flex', fontSize: sq ? 22 : 26, color: 'rgba(255,255,255,.85)' }}>
              {[from ? `Joins from ${from}` : '', until ? `contract until ${until}` : ''].filter(Boolean).join(' · ')}
            </span>
          ) : null}
          <span style={{ display: 'flex', fontSize: sq ? 24 : 28, fontWeight: 900, color: GOLD, marginTop: 4, maxWidth: W - pad * 2 }}>{message}</span>
        </div>

        <div style={{ position: 'absolute', left: 0, bottom: 0, width: W, height: 12, display: 'flex', backgroundImage: `linear-gradient(90deg, ${GREEN}, ${GOLD})` }} />
        <span style={{ position: 'absolute', right: pad, bottom: 34, display: 'flex', fontSize: 22, color: 'rgba(255,255,255,.8)' }}>www.afrofoot.club · #afrofootclub</span>
      </div>
    ),
    { width: W, height: H, fonts: FONTS, headers: q.get('download') === '1'
      ? { 'Content-Disposition': `attachment; filename="${kind === 'welcome' ? 'new-signing' : 'farewell'}-${p.lastName.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${format}.png"`, 'Cache-Control': 'no-store' }
      : { 'Cache-Control': 'private, max-age=60' } },
  );
}
