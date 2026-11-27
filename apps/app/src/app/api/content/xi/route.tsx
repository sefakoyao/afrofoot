import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import type { ReactNode } from 'react';
import { isCoachRole } from '@afrofoot/db';
import { coachesTeam } from '@/lib/coach';
import { getMember, isVerifiedAdmin } from '@/lib/auth';
import { FONT_BLACK_WOFF, FONT_BOLD } from '@/lib/invoice/assets';
import { CREST_RATIO, DEFAULT_SHADE, DEFAULT_STRENGTH, EFFECTS, broadcastRow, clubBand, effect, photoEdge, photoPlaceholder, pitchLines, shirtIcon, type Effect } from '@/lib/poster-art';
import { NEVERA_OTF } from '@/lib/poster-font';
import { PHOTO_LAYOUTS, POSTER_BACKGROUNDS, POSTER_FORMATS, POSTER_LAYOUTS, POSTER_TITLES, SAMPLE_MATCH, UPLOAD_PATH, loadPoster, samplePoster, type PosterFormat, type PosterLayout, type PosterPlayer } from '@/lib/poster';
import { getSupabase } from '@/lib/supabase/server';

/**
 * The Starting XI poster as a PNG (Admin → Website → Matchday poster), in the crest's style: black, the green-to-yellow
 * tab with the club's name, a "football wave" across the picture. Six layouts: list (crest-shaped number shields), broadcast
 * (TV-graphics rows by line), numbers (big shirt numbers by line) and shirts (a shirt icon per player), each beside a
 * featured player photo; cards (tiles by line) and pitch (the coach's formation). The title is set in Nevera, everything else in Figtree.
 * Query: match, layout, format, bg (team | night | pitch | media:posters/bg/…), title (0–2), sponsor
 * (media:posters/sponsor/… → "Presented by"), photo (media:posters/player/…), download=1. Admins only.
 * Photos fill their frame (cropped to fit); the crest and logos keep their proportions inside their space.
 * Names of every player except those hidden from the club website (lib/poster.ts); those by shirt number and position.
 */
export const dynamic = 'force-dynamic';

// Images used on posters, kept in memory as data URLs once fetched (the team photo, the crest, uploads: uploads have
// unique names and never change), so each preview does not download them again. At most 40, oldest dropped first.
const images = new Map<string, Promise<string | null>>();
function cachedImage(url: string | null): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  let hit = images.get(url);
  if (!hit) {
    hit = fetch(url).then(async (r) => (r.ok ? `data:${r.headers.get('content-type') ?? 'image/png'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}` : null)).catch(() => null);
    hit.then((v) => { if (!v) images.delete(url); });
    images.set(url, hit);
    if (images.size > 40) images.delete(images.keys().next().value!);
  }
  return hit;
}
const GREEN = '#3DAF2C', GOLD = '#EDF70F', INK = '#0b0b0b';
const FONTS = [
  { name: 'Figtree', weight: 700 as const, style: 'normal' as const, data: Buffer.from(FONT_BOLD, 'base64') },
  { name: 'Figtree', weight: 900 as const, style: 'normal' as const, data: Buffer.from(FONT_BLACK_WOFF, 'base64') },
  { name: 'Nevera', weight: 400 as const, style: 'normal' as const, data: Buffer.from(NEVERA_OTF, 'base64') },
];
const ROLE_SHORT: Record<string, string> = { GK: 'GK', DF: 'DF', MF: 'MF', FW: 'FW' };
const LINE_WORD: Record<string, string> = { GK: 'GOALKEEPER', DF: 'DEFENCE', MF: 'MIDFIELD', FW: 'ATTACK' };
const ROLE_WORD: Record<string, string> = { GK: 'GOALKEEPER', DF: 'DEFENDER', MF: 'MIDFIELDER', FW: 'FORWARD' };
// vertical plan of each size: title size, where the line-up starts, the footer's height
const PLAN = { portrait: { title: 128, top: 378, footer: 190 }, story: { title: 150, top: 420, footer: 250 }, square: { title: 98, top: 318, footer: 150 } } as const;

export async function GET(req: NextRequest) {
  const member = await getMember();
  if (!member || member.status !== 'active' || !(isVerifiedAdmin(member) || isCoachRole(member.role))) return new Response('Not allowed', { status: 403 });
  const q = req.nextUrl.searchParams;
  const id = q.get('match') ?? '';
  const isSample = id === SAMPLE_MATCH;
  // a coach: only games of a team they coach (a player-coach can also read their own team's games as a player)
  if (!isVerifiedAdmin(member) && !isSample) {
    const db = await getSupabase();
    const ts = db && /^[0-9a-f-]{36}$/.test(id) ? (await db.from('matches').select('team_season_id').eq('id', id).maybeSingle()).data?.team_season_id : null;
    if (!db || !ts || !(await coachesTeam(db, member.id, ts))) return new Response('Not allowed', { status: 403 });
  }
  if (!isSample && !/^[0-9a-f-]{36}$/.test(id)) return new Response('Choose a game', { status: 400 });
  const format: PosterFormat = (Object.keys(POSTER_FORMATS) as PosterFormat[]).includes(q.get('format') as PosterFormat) ? (q.get('format') as PosterFormat) : 'portrait';
  const layout: PosterLayout = (POSTER_LAYOUTS as readonly string[]).includes(q.get('layout') ?? '') ? (q.get('layout') as PosterLayout) : 'list';
  const title = POSTER_TITLES[Number(q.get('title')) || 0] ?? POSTER_TITLES[0];
  const fx: Effect = (EFFECTS as readonly string[]).includes(q.get('fx') ?? '') ? (q.get('fx') as Effect) : 'wave';
  // how dark the layer over a background photo is (0 = the photo as it is, 100 = almost black); only the picture, never the effect
  const shade = q.has('shade') ? Math.max(0, Math.min(100, Math.round(Number(q.get('shade')) || 0))) : DEFAULT_SHADE;
  const a = shade / 100, al = (v: number) => Math.max(0, Math.min(0.97, v)).toFixed(2);
  const strength = q.has('strength') ? Math.max(0, Math.min(100, Math.round(Number(q.get('strength')) || 0))) : DEFAULT_STRENGTH;
  const supabase = await getSupabase();
  const d = isSample ? samplePoster() : supabase ? await loadPoster(supabase, id) : null;
  if (!d) return new Response('Game not found', { status: 404 });
  const { w: W, h: H } = POSTER_FORMATS[format];
  const P = PLAN[format], pad = format === 'square' ? 56 : 64;
  const bodyH = H - P.top - P.footer - 16;
  const origin = req.nextUrl.origin;
  const media = (v: string | null) => {
    const path = v?.startsWith('media:') ? v.slice(6) : '';
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
    return UPLOAD_PATH.test(path) && base ? `${base}/storage/v1/object/public/public-media/${path}` : null;
  };
  const bgRaw = q.get('bg') ?? 'night';
  const [photoBg, sponsor, featuredRaw, crestSrc] = await Promise.all([
    cachedImage(bgRaw === 'team' ? `${origin}/posters/team.jpg` : media(bgRaw)), cachedImage(media(q.get('sponsor'))),
    cachedImage(PHOTO_LAYOUTS.includes(layout) ? media(q.get('photo')) : null), cachedImage(`${origin}/afc-logo.png`),
  ]);
  const plain = !photoBg && (POSTER_BACKGROUNDS as readonly string[]).includes(bgRaw) ? bgRaw : 'night';
  const featured = featuredRaw;

  const when = new Date(d.kickoff);
  const tz = { timeZone: 'Europe/Helsinki' } as const;
  const dateText = new Intl.DateTimeFormat('en-GB', { ...tz, weekday: 'short', day: 'numeric', month: 'short' }).format(when).toUpperCase();
  const timeText = new Intl.DateTimeFormat('en-GB', { ...tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(when);
  const label = d.friendly ? 'FRIENDLY' : (d.division ?? 'MATCHDAY').toUpperCase().slice(0, 24);
  const venue = d.venue ? `${d.venue}${d.city ? `, ${d.city}` : ''}` : '';
  const surname = (p: PosterPlayer) => (p.name ? (p.name.trim().split(/\s+/).slice(-1)[0] ?? p.name).toUpperCase() : '');
  const nameOf = (p: PosterPlayer) => (p.name ? surname(p) : ROLE_WORD[p.role] ?? 'PLAYER');
  const bySlot = new Map(d.slots.map((s) => [s.slot, s]));
  // goalkeeper first, then defence, midfield, attack (the formation's slots)
  const starters = [...d.starters].sort((a, b) => (bySlot.get(b.slot ?? 0)?.y ?? 0) - (bySlot.get(a.slot ?? 0)?.y ?? 0) || (bySlot.get(a.slot ?? 0)?.x ?? 0) - (bySlot.get(b.slot ?? 0)?.x ?? 0));

  /** The crest-shaped shirt-number shield with the number on it: flat top, rounded point, white edge, colour band. */
  const badge = (n: number | null, size: number, gk: boolean, captain = false) => {
    const h = Math.round(size * 1.18), r = Math.round(size * 0.12);
    return (
      <div style={{ position: 'relative', display: 'flex', width: size, height: h }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: size, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          background: gk ? GOLD : INK, border: `${Math.max(2, Math.round(size * 0.05))}px solid #fff`,
          borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: size * 0.55, borderBottomRightRadius: size * 0.55 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: size, height: Math.round(h * 0.16), display: 'flex', backgroundImage: `linear-gradient(90deg, ${GREEN}, ${GOLD})` }} />
          <span style={{ display: 'flex', marginTop: size * 0.1, fontSize: size * 0.46, fontWeight: 900, color: gk ? INK : '#fff' }}>{n ?? '–'}</span>
        </div>
        {captain ? <span style={{ position: 'absolute', right: -size * 0.22, top: -size * 0.08, display: 'flex', alignItems: 'center', justifyContent: 'center', width: size * 0.42, height: size * 0.42, borderRadius: 999, background: GOLD, color: INK, fontSize: size * 0.24, fontWeight: 900 }}>C</span> : null}
      </div>
    );
  };

  // ---------- the three layouts (each fills the body area: x pad…W-pad, y P.top…P.top+bodyH) ----------
  function listLayout(): ReactNode {
    const photoW = featured ? Math.round(W * 0.5) : 0;
    const rowH = Math.min(format === 'story' ? 104 : 74, Math.floor(bodyH / 11));
    const size = Math.round(rowH * 0.66);
    return (
      <div style={{ position: 'absolute', left: pad, top: P.top, width: W - pad * 2 - (featured ? photoW - pad - 40 : 0), height: bodyH, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {starters.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, height: rowH }}>
            {badge(p.shirt, size, p.role === 'GK', p.captain)}
            <span style={{ display: 'flex', fontSize: rowH * 0.5, fontWeight: 900, letterSpacing: 1, color: p.name ? '#fff' : 'rgba(255,255,255,.7)' }}>{nameOf(p).slice(0, 14)}</span>
          </div>
        ))}
      </div>
    );
  }

  // broadcast: the rows' width; the featured photo starts right after them
  const bRowW = format === 'square' ? 520 : 560;

  /** TV graphics: a slanted number tab (gold for the keeper), the name on a dark bar, the position; a gap between lines. */
  function broadcastLayout(): ReactNode {
    const gapLine = format === 'story' ? 22 : 12, gapRow = format === 'square' ? 5 : 7;
    const lines = ['GK', 'DF', 'MF', 'FW'].filter((r) => starters.some((p) => p.role === r)).length;
    const rowH = Math.min(format === 'story' ? 72 : 62, Math.floor((bodyH - gapLine * (lines - 1) - gapRow * 10) / 11));
    const rowW = bRowW, tabW = Math.round(rowH * 1.75);
    let last = '';
    return (
      <div style={{ position: 'absolute', left: pad, top: P.top, width: rowW, height: bodyH, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {starters.map((p, i) => {
          const colour = p.role === 'GK' ? GOLD : GREEN;
          const gap = i === 0 ? 0 : p.role !== last ? gapLine + gapRow : gapRow;
          last = p.role;
          const name = nameOf(p);
          return (
            <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'center', width: rowW, height: rowH, marginTop: gap }}>
              <img src={broadcastRow(rowW, rowH, tabW, colour)} alt="" width={rowW} height={rowH} style={{ position: 'absolute', left: 0, top: 0 }} />
              <span style={{ position: 'absolute', left: 0, top: 0, width: tabW - rowH * 0.12, height: rowH, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: rowH * 0.62, fontWeight: 900, color: INK }}>{p.shirt ?? '–'}</span>
              <span style={{ position: 'absolute', left: tabW + rowH * 0.3, top: 0, height: rowH, display: 'flex', alignItems: 'center', fontSize: rowH * (name.length > 11 ? 0.46 : 0.54), fontWeight: 900, letterSpacing: 1.5, color: p.name ? '#fff' : 'rgba(255,255,255,.7)' }}>{name.slice(0, 15)}</span>
              <div style={{ position: 'absolute', right: rowH * 0.5, top: 0, height: rowH, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ display: 'flex', fontSize: rowH * 0.27, fontWeight: 900, letterSpacing: 3, color: 'rgba(255,255,255,.6)' }}>{ROLE_SHORT[p.role] ?? ''}</span>
                {p.captain ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: rowH * 0.56, height: rowH * 0.56, borderRadius: 999, background: GOLD, color: INK, fontSize: rowH * 0.32, fontWeight: 900 }}>C</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /** The line-up grouped by line with a small heading per line (numbers, shirts): rows of rowH and headings of headH. */
  function grouped(row: (p: PosterPlayer, rowH: number) => ReactNode, headColour: string, headIndent: (rowH: number) => number): ReactNode {
    const roles = ['GK', 'DF', 'MF', 'FW'].filter((r) => starters.some((p) => p.role === r));
    const headH = format === 'square' ? 22 : 28, between = format === 'story' ? 18 : 8;
    const rowH = Math.min(format === 'story' ? 74 : 58, Math.floor((bodyH - roles.length * headH - (roles.length - 1) * between) / 11));
    return (
      <div style={{ position: 'absolute', left: pad, top: P.top, width: bRowW, height: bodyH, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {roles.map((r, i) => (
          <div key={r} style={{ display: 'flex', flexDirection: 'column', marginTop: i ? between : 0 }}>
            <span style={{ display: 'flex', height: headH, alignItems: 'flex-end', marginLeft: headIndent(rowH), fontSize: format === 'square' ? 15 : 17, fontWeight: 900, letterSpacing: 5, color: headColour, textShadow: '0 1px 6px rgba(0,0,0,.8)' }}>{LINE_WORD[r]}</span>
            {starters.filter((p) => p.role === r).map((p, j) => <div key={j} style={{ display: 'flex', alignItems: 'center', height: rowH }}>{row(p, rowH)}</div>)}
          </div>
        ))}
      </div>
    );
  }
  const captainDot = (h: number) => <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: h * 0.55, height: h * 0.55, marginLeft: 14, borderRadius: 999, background: GOLD, color: INK, fontSize: h * 0.32, fontWeight: 900 }}>C</span>;
  const nameText = (p: PosterPlayer, size: number) => {
    const n = nameOf(p);
    return <span style={{ display: 'flex', fontSize: size * (n.length > 11 ? 0.84 : 1), fontWeight: 900, letterSpacing: 1.5, color: p.name ? '#fff' : 'rgba(255,255,255,.7)', textShadow: '0 2px 10px rgba(0,0,0,.7)' }}>{n.slice(0, 15)}</span>;
  };

  /** A: big shirt numbers in their own column (gold for the keeper), a thin bar, the name; by line. */
  function numbersLayout(): ReactNode {
    const numW = (h: number) => Math.round(h * 1.55);
    return grouped((p, h) => (
      <>
        <span style={{ display: 'flex', justifyContent: 'flex-end', width: numW(h), marginTop: -h * 0.14, fontSize: h * 0.92, fontWeight: 900, lineHeight: 1, color: p.role === 'GK' ? GOLD : GREEN, textShadow: '0 2px 12px rgba(0,0,0,.85)' }}>{p.shirt ?? '–'}</span>
        <span style={{ display: 'flex', width: 5, height: h * 0.68, margin: `0 ${Math.round(h * 0.34)}px`, borderRadius: 3, backgroundImage: `linear-gradient(180deg, ${GREEN}, ${GOLD})` }} />
        {nameText(p, h * 0.6)}{p.captain ? captainDot(h) : null}
      </>
    ), 'rgba(255,255,255,.75)', (h) => numW(h) + 5 + Math.round(h * 0.68));
  }

  /** C: a small football shirt with the number on it (gold for the keeper), the name; by line. */
  function shirtsLayout(): ReactNode {
    const size = (h: number) => Math.round(h * 0.98);
    return grouped((p, h) => {
      const s = size(h), gk = p.role === 'GK';
      return (
        <>
          <div style={{ position: 'relative', display: 'flex', width: s, height: s * 0.94 }}>
            <img src={shirtIcon(s, gk)} alt="" width={s} height={Math.round(s * 0.94)} style={{ position: 'absolute', left: 0, top: 0 }} />
            <span style={{ position: 'absolute', left: 0, top: s * 0.27, width: s, display: 'flex', justifyContent: 'center', fontSize: s * (String(p.shirt ?? '').length > 1 ? 0.34 : 0.4), fontWeight: 900, color: gk ? INK : '#fff' }}>{p.shirt ?? '–'}</span>
          </div>
          <span style={{ display: 'flex', width: Math.round(h * 0.38) }} />
          {nameText(p, h * 0.62)}{p.captain ? captainDot(h) : null}
        </>
      );
    }, GOLD, (h) => size(h) + Math.round(h * 0.38));
  }

  function cardsLayout(): ReactNode {
    const lines = ['FW', 'MF', 'DF', 'GK'].map((r) => starters.filter((p) => p.role === r).sort((a, b) => (bySlot.get(a.slot ?? 0)?.x ?? 0) - (bySlot.get(b.slot ?? 0)?.x ?? 0))).filter((l) => l.length);
    const gap = format === 'square' ? 12 : 18;
    const cardH = Math.min(format === 'story' ? 250 : 190, Math.floor((bodyH - gap * (lines.length - 1)) / lines.length));
    const cardW = Math.min(232, Math.floor((W - pad * 2 - gap * 3) / 4));
    return (
      <div style={{ position: 'absolute', left: pad, top: P.top, width: W - pad * 2, height: bodyH, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap }}>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'center', gap }}>
            {line.map((p, j) => (
              <div key={j} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: cardW, height: cardH, gap: 6,
                background: '#121212', borderRadius: 22, border: '2px solid rgba(255,255,255,.14)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, width: cardW, height: 10, display: 'flex', backgroundImage: `linear-gradient(90deg, ${GREEN}, ${GOLD})` }} />
                <span style={{ display: 'flex', fontSize: cardH * 0.42, fontWeight: 900, lineHeight: 1, color: p.role === 'GK' ? GOLD : '#fff' }}>{p.shirt ?? '–'}</span>
                <span style={{ display: 'flex', fontSize: format === 'square' ? 19 : 23, fontWeight: 900, letterSpacing: 1.5, color: p.name ? '#fff' : 'rgba(255,255,255,.7)' }}>{nameOf(p).slice(0, 12)}</span>
                {p.captain ? <span style={{ position: 'absolute', top: 18, right: 14, display: 'flex', background: GOLD, color: INK, fontSize: 18, fontWeight: 900, padding: '1px 9px', borderRadius: 8 }}>C</span> : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  function pitchLayout(): ReactNode {
    const pitchH = bodyH, pitchW = Math.min(W - pad * 2, Math.round(pitchH * 0.78));
    const size = format === 'square' ? 50 : 62, labelH = 36;
    const padTop = 18, padBottom = size * 1.18 + labelH;
    const at = new Map(d!.starters.filter((p) => p.slot).map((p) => [p.slot!, p]));
    return (
      <div style={{ position: 'absolute', left: (W - pitchW) / 2, top: P.top, width: pitchW, height: pitchH, display: 'flex', background: 'rgba(8,30,6,.72)', borderRadius: 24 }}>
        <img src={pitchLines(pitchW, pitchH)} alt="" width={pitchW} height={pitchH} style={{ position: 'absolute', left: 0, top: 0 }} />
        {d!.slots.map((s) => {
          const p = at.get(s.slot);
          if (!p) return null;
          const x = (s.x / 100) * pitchW, y = padTop + (s.y / 100) * (pitchH - padTop - padBottom);
          return (
            <div key={s.slot} style={{ position: 'absolute', left: x - 100, top: y, width: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {badge(p.shirt, size, s.role === 'GK', p.captain)}
              {surname(p) ? <span style={{ display: 'flex', background: INK, borderRadius: 8, padding: '2px 8px', fontSize: size * (surname(p).length > 8 ? 0.29 : 0.36), fontWeight: 900, letterSpacing: surname(p).length > 8 ? 0 : 1 }}>{surname(p).slice(0, 13)}</span> : null}
            </div>
          );
        })}
      </div>
    );
  }

  const crestW = format === 'square' ? 120 : 150, crestH = Math.round(crestW * CREST_RATIO);
  const benchText = d.bench.length ? d.bench.slice(0, 9).map((b) => `${b.shirt ?? ''}${b.name ? ` ${surname(b)}` : ''}`.trim() || '–').join('  ·  ') : '';

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: INK, ...(photoBg ? {} : { backgroundImage: plain === 'pitch' ? 'linear-gradient(165deg, #2f9223 0%, #1f6c17 50%, #134a0e 100%)' : 'linear-gradient(160deg, #2a2a2a 0%, #171717 50%, #0f2a0b 100%)' }), color: '#fff', fontFamily: 'Figtree', fontWeight: 700 }}>
        {/* background photo (cropped to fill), darkened so the wave and text stand out */}
        {photoBg ? <img src={photoBg} alt="" width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, objectFit: 'cover' }} /> : null}
        {photoBg ? <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', backgroundImage: `linear-gradient(180deg, rgba(11,11,11,${al(a)}), rgba(11,11,11,${al(a + 0.08)}) 55%, rgba(11,11,11,${al(a + 0.3)}))` }} /> : null}
        {/* the background effect the admin chose (football wave, ribbons, kit stripes, kit dots or none) at their strength */}
        {(() => { const art = effect(fx, W, H, strength, format === 'square' ? 0.66 : 0.6); return art ? <img src={art} alt="" width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }} /> : null; })()}
        {/* featured player photo, cropped to fill its frame, blended in with a wave edge */}
        {featured ? (() => {
          const fw = layout === 'list' ? Math.round(W * 0.5) : W - pad - bRowW - 8, fy = P.top - 60, fh = H - fy - P.footer + 30;
          return (
            <div style={{ position: 'absolute', left: W - fw, top: fy, width: fw, height: fh, display: 'flex', overflow: 'hidden' }}>
              <img src={featured} alt="" width={fw} height={fh} style={{ width: fw, height: fh, objectFit: 'cover', objectPosition: 'center top' }} />
              <img src={photoEdge(fw, fh, photoBg ? Math.min(1, 0.25 + a) : 1)} alt="" width={fw} height={fh} style={{ position: 'absolute', left: 0, top: 0 }} />
            </div>
          );
        })() : null}
        {/* a dark fade behind the footer so the bench, sponsor and venue read clearly */}
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: W, height: P.footer + 90, display: 'flex', backgroundImage: `linear-gradient(180deg, rgba(11,11,11,0), rgba(11,11,11,${al(0.35 + a * 0.5)}) 50%, rgba(11,11,11,${al(0.45 + a * 0.5)}))` }} />
        {/* the top banner: a thin line across and a slanted tab with the club's name; a thin line at the bottom */}
        <img src={clubBand(W, 440, 56)} alt="" width={W} height={56} style={{ position: 'absolute', left: 0, top: 0 }} />
        <span style={{ position: 'absolute', left: pad, top: 0, height: 56, display: 'flex', alignItems: 'center', fontSize: 22, fontWeight: 900, letterSpacing: 5, color: INK }}>AFRO FOOT CLUB</span>
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: W, height: 12, display: 'flex', backgroundImage: `linear-gradient(90deg, ${GREEN}, ${GOLD})` }} />

        {/* header: labels, title, opponent; the crest on the right (its own proportions) */}
        <div style={{ position: 'absolute', left: pad, top: 92, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ display: 'flex', background: GOLD, color: INK, fontSize: 24, fontWeight: 900, letterSpacing: 4, padding: '6px 16px', borderRadius: 8 }}>{label}</span>
            <span style={{ display: 'flex', background: GREEN, color: INK, fontSize: 24, fontWeight: 900, letterSpacing: 2, padding: '6px 16px', borderRadius: 8 }}>{`${dateText} · ${timeText}`}</span>
          </div>
          <span style={{ display: 'flex', fontFamily: 'Nevera', fontWeight: 400, fontSize: format === 'square' ? 80 : 104, lineHeight: 1, letterSpacing: 1 }}>{title}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span style={{ display: 'flex', fontSize: 30, fontWeight: 900, color: GREEN }}>{d.homeAway === 'home' ? 'VS' : '@'}</span>
            <span style={{ display: 'flex', fontSize: format === 'square' ? 34 : 40, fontWeight: 900 }}>{d.opponent.toUpperCase().slice(0, 24)}</span>
          </div>
        </div>
        <img src={crestSrc ?? `${origin}/afc-logo.png`} alt="" width={crestW} height={crestH} style={{ position: 'absolute', right: pad, top: 84, width: crestW, height: crestH, objectFit: 'contain' }} />

        {/* the featured photo's place, in the preview only, while no photo is chosen (the downloaded poster leaves it empty) */}
        {PHOTO_LAYOUTS.includes(layout) && !featured && q.get('download') !== '1' ? (() => {
          const x = layout === 'list' ? Math.round(W * 0.62) : pad + bRowW + 28, w = W - x - pad + 20, h = Math.round(bodyH * 0.78), y = P.top + Math.round((bodyH - h) / 2);
          return (
            <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 36 }}>
              <img src={photoPlaceholder(w, h)} alt="" width={w} height={h} style={{ position: 'absolute', left: 0, top: 0 }} />
              <span style={{ display: 'flex', fontSize: 26, fontWeight: 900, letterSpacing: 4 }}>PLAYER PHOTO</span>
              <span style={{ display: 'flex', fontSize: 18, color: 'rgba(255,255,255,.8)', marginTop: 6 }}>Preview only</span>
            </div>
          );
        })() : null}
        {/* a dark shade behind the line-up (Broadcast has its own dark bars) */}
        {layout === 'list' || layout === 'numbers' || layout === 'shirts' ? <div style={{ position: 'absolute', left: 0, top: P.top - 30, width: W * 0.62, height: bodyH + 60, display: 'flex', backgroundImage: `linear-gradient(90deg, rgba(11,11,11,${al(0.25 + a * 0.6)}) 0%, rgba(11,11,11,${al(0.12 + a * 0.4)}) 55%, rgba(11,11,11,0) 100%)` }} /> : null}
        {layout === 'list' ? listLayout() : layout === 'broadcast' ? broadcastLayout() : layout === 'numbers' ? numbersLayout() : layout === 'shirts' ? shirtsLayout() : layout === 'cards' ? cardsLayout() : pitchLayout()}
        {isSample ? <div style={{ position: 'absolute', right: pad, top: 84 + crestH + 14, display: 'flex', background: '#fff', color: INK, fontSize: 22, fontWeight: 900, letterSpacing: 4, padding: '4px 12px', borderRadius: 6 }}>SAMPLE</div> : null}

        {/* footer: bench, "presented by", venue */}
        <div style={{ position: 'absolute', left: pad, right: pad, bottom: 34, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {benchText && format !== 'square' ? (
            <div style={{ display: 'flex', gap: 12, fontSize: 22, color: 'rgba(255,255,255,.82)' }}>
              <span style={{ display: 'flex', fontWeight: 900, color: GREEN, letterSpacing: 2 }}>BENCH</span><span style={{ display: 'flex' }}>{benchText.slice(0, 90)}</span>
            </div>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            {sponsor ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ display: 'flex', fontSize: 16, fontWeight: 900, letterSpacing: 3, color: 'rgba(255,255,255,.75)' }}>PRESENTED BY</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 12, width: 230, height: format === 'square' ? 64 : 78, padding: '8px 14px', overflow: 'hidden' }}>
                  <img src={sponsor} alt="" width={202} height={format === 'square' ? 48 : 62} style={{ width: 202, height: format === 'square' ? 48 : 62, objectFit: 'contain' }} />
                </div>
              </div>
            ) : <div style={{ display: 'flex' }} />}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, fontSize: 22, color: 'rgba(255,255,255,.8)' }}>
              {venue ? <span style={{ display: 'flex', fontWeight: 900, color: '#fff', fontSize: 24 }}>{venue.slice(0, 40)}</span> : null}
              <span style={{ display: 'flex' }}>www.afrofoot.club · #afrofootclub</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: FONTS, headers: q.get('download') === '1' ? { 'Content-Disposition': `attachment; filename="starting-xi-${d.opponent.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${layout}-${format}.png"`, 'Cache-Control': 'no-store' } : { 'Cache-Control': isSample ? 'private, max-age=600' : 'private, max-age=60' } },
  );
}
