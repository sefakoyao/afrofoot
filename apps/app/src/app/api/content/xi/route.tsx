import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { getMember } from '@/lib/auth';
import { FONT_BLACK_WOFF, FONT_BOLD } from '@/lib/invoice/assets';
import { POSTER_BACKGROUNDS, POSTER_FORMATS, loadPoster, type PosterFormat, type PosterPlayer } from '@/lib/poster';
import { getSupabase } from '@/lib/supabase/server';
import { isAdminRole } from '@afrofoot/db';

/**
 * The Starting XI poster as a PNG (Admin → Website → Matchday poster): club colours, the game, the XI on the pitch in
 * the coach's formation, the bench. ?match=<id>&format=portrait|story|square&bg=team|pitch|night|media:<path>&download=1.
 * Admins only. Text and names come from the database (names only of players shown publicly).
 */
export const dynamic = 'force-dynamic';
const GREEN = '#3DAF2C', GOLD = '#EDF70F', INK = '#0b0b0b';
// the club's typeface (Figtree, SIL Open Font License, assets/fonts; embedded in code like the invoice fonts)
const FONTS = [
  { name: 'Figtree', weight: 700 as const, style: 'normal' as const, data: Buffer.from(FONT_BOLD, 'base64') },
  { name: 'Figtree', weight: 900 as const, style: 'normal' as const, data: Buffer.from(FONT_BLACK_WOFF, 'base64') },
];

export async function GET(req: NextRequest) {
  const member = await getMember();
  if (!member || member.status !== 'active' || !isAdminRole(member.role)) return new Response('Not allowed', { status: 403 });
  const q = req.nextUrl.searchParams;
  const id = q.get('match') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Choose a game', { status: 400 });
  const format: PosterFormat = (Object.keys(POSTER_FORMATS) as PosterFormat[]).includes(q.get('format') as PosterFormat) ? (q.get('format') as PosterFormat) : 'portrait';
  const supabase = await getSupabase();
  const d = supabase ? await loadPoster(supabase, id) : null;
  if (!d) return new Response('Game not found', { status: 404 });
  const { w: W, h: H } = POSTER_FORMATS[format];
  const origin = req.nextUrl.origin;

  // background: a club photo shipped with the app, an uploaded photo (public-media/posters/…), or a plain design
  const bgRaw = q.get('bg') ?? 'team';
  let photo: string | null = null;
  if (bgRaw === 'team') photo = `${origin}/posters/team.jpg`;
  else if (bgRaw.startsWith('media:') && /^posters\/[\w-]+\.(jpg|jpeg|png|webp)$/.test(bgRaw.slice(6)) && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    photo = `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/public-media/${bgRaw.slice(6)}`;
  }
  const plain = !photo && (POSTER_BACKGROUNDS as readonly string[]).includes(bgRaw) ? bgRaw : 'night';

  const when = new Date(d.kickoff);
  const tz = { timeZone: 'Europe/Helsinki' } as const;
  const dateText = new Intl.DateTimeFormat('en-GB', { ...tz, weekday: 'short', day: 'numeric', month: 'short' }).format(when).toUpperCase();
  const timeText = new Intl.DateTimeFormat('en-GB', { ...tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(when);
  const [home, away] = d.homeAway === 'home' ? [d.team, d.opponent] : [d.opponent, d.team];
  const short = (p: PosterPlayer) => (p.name ? (p.name.trim().split(/\s+/).slice(-1)[0] ?? p.name).toUpperCase() : '');

  // pitch box: the space between the header and the footer
  const header = format === 'square' ? 250 : 300, footer = format === 'story' ? 330 : format === 'square' ? 190 : 230;
  const pitchH = H - header - footer, pitchW = Math.min(W - 120, Math.round(pitchH * 0.78));
  const at = new Map(d.starters.filter((p) => p.slot).map((p) => [p.slot!, p]));
  const dot = format === 'square' ? 62 : 76;
  const padTop = 20, padBottom = dot + 10; // room for the goalkeeper's name label

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', position: 'relative', background: plain === 'pitch' ? '#1f6e17' : INK, color: '#fff', fontFamily: 'Figtree', fontWeight: 700 }}>
        {photo ? <img src={photo} alt="" width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, objectFit: 'cover' }} /> : null}
        <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex',
          backgroundImage: photo ? 'linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.72) 45%, rgba(0,0,0,.92) 100%)'
            : plain === 'pitch' ? 'linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.6))' : 'linear-gradient(160deg, #161616 0%, #0b0b0b 55%, #0f2a0b 100%)' }} />
        <div style={{ position: 'absolute', left: 0, top: 0, width: 22, height: H, display: 'flex', background: GREEN }} />

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '56px 64px 0 86px', height: header }}>
          <img src={`${origin}/afc-logo.png`} alt="" width={150} height={150} style={{ width: 150, height: 150 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignSelf: 'flex-start', background: GOLD, color: INK, fontSize: 30, fontWeight: 900, letterSpacing: 6, padding: '6px 18px', borderRadius: 999 }}>
              {d.friendly ? 'FRIENDLY' : (d.division ?? 'MATCHDAY').toUpperCase().slice(0, 28)}
            </div>
            <div style={{ display: 'flex', fontSize: 92, fontWeight: 900, lineHeight: 1, letterSpacing: 2 }}>STARTING XI</div>
            <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: '#e5e5e5' }}>{`${home.toUpperCase()}  vs  ${away.toUpperCase()}`.slice(0, 48)}</div>
          </div>
        </div>

        {/* pitch with the XI */}
        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', display: 'flex', width: pitchW, height: pitchH, borderRadius: 28, border: '4px solid rgba(255,255,255,.55)',
            backgroundImage: 'linear-gradient(180deg, rgba(61,175,44,.42), rgba(31,110,23,.55))' }}>
            <div style={{ position: 'absolute', left: 0, top: pitchH / 2 - 2, width: pitchW - 8, height: 4, display: 'flex', background: 'rgba(255,255,255,.45)' }} />
            <div style={{ position: 'absolute', left: pitchW / 2 - 90, top: pitchH / 2 - 90, width: 180, height: 180, display: 'flex', borderRadius: 999, border: '4px solid rgba(255,255,255,.45)' }} />
            <div style={{ position: 'absolute', left: pitchW * 0.24, top: -4, width: pitchW * 0.52, height: pitchH * 0.14, display: 'flex', border: '4px solid rgba(255,255,255,.45)', borderTop: 'none' }} />
            <div style={{ position: 'absolute', left: pitchW * 0.24, bottom: -4, width: pitchW * 0.52, height: pitchH * 0.14, display: 'flex', border: '4px solid rgba(255,255,255,.45)', borderBottom: 'none' }} />
            {d.slots.map((s) => {
              const p = at.get(s.slot);
              if (!p) return null;
              const x = (s.x / 100) * pitchW, y = padTop + (s.y / 100) * (pitchH - padTop - padBottom);
              const gk = s.role === 'GK';
              return (
                <div key={s.slot} style={{ position: 'absolute', left: x - 110, top: y - dot / 2, width: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: dot, height: dot, borderRadius: 999,
                    background: gk ? INK : '#fff', color: gk ? '#fff' : INK, border: `5px solid ${gk ? GOLD : '#fff'}`, fontSize: dot * 0.45, fontWeight: 900 }}>
                    {p.shirt ?? s.role}
                    {p.captain ? <div style={{ position: 'absolute', right: -14, top: -12, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 999, background: GOLD, color: INK, fontSize: 20, fontWeight: 900 }}>C</div> : null}
                  </div>
                  {short(p) ? <div style={{ display: 'flex', background: 'rgba(0,0,0,.78)', borderRadius: 10, padding: '4px 12px', fontSize: dot * 0.32, fontWeight: 800, letterSpacing: 1 }}>{short(p).slice(0, 14)}</div> : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* footer: when and where, the bench */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 64px 40px 86px', height: footer, justifyContent: 'flex-end' }}>
          {d.bench.length && format !== 'square' ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 26, color: '#d4d4d4' }}>
              <span style={{ display: 'flex', fontWeight: 900, color: '#fff', marginRight: 6 }}>BENCH</span>
              {d.bench.slice(0, 9).map((b, i) => <span key={i} style={{ display: 'flex' }}>{`${b.shirt ?? ''}${b.name ? ` ${short(b)}` : ''}`.trim() || '–'}{i < Math.min(d.bench.length, 9) - 1 ? ' ·' : ''}</span>)}
            </div>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, fontSize: 38, fontWeight: 900 }}>
            <span style={{ display: 'flex', background: GREEN, color: INK, padding: '6px 18px', borderRadius: 12 }}>{dateText}</span>
            <span style={{ display: 'flex' }}>{timeText}</span>
            {d.venue ? <span style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: '#e5e5e5' }}>{`${d.venue}${d.city ? `, ${d.city}` : ''}`.slice(0, 40)}</span> : null}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 26, color: '#a3a3a3' }}><span>www.afrofoot.club</span><span>#afrofootclub</span></div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: FONTS, headers: q.get('download') === '1' ? { 'Content-Disposition': `attachment; filename="starting-xi-${d.opponent.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}-${format}.png"` } : { 'Cache-Control': 'no-store' } },
  );
}
