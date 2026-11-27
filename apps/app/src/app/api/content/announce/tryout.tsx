import { CREST_RATIO, clubBand, effect, football, tryoutPitch, type Effect } from '@/lib/poster-art';
import type { PosterFormat } from '@/lib/poster';

const GREEN = '#3DAF2C', GOLD = '#EDF70F', INK = '#0b0b0b';
export const TONES = ['natural', 'green', 'mono'] as const;
export type Tone = (typeof TONES)[number];

export type TryoutPoster = {
  format: PosterFormat; W: number; H: number; origin: string; crest: string | null;
  photo: string | null; tone: Tone; fx: Effect; strength: number; shade: number; ball: boolean;
  date: string; start: string; end: string; place: string; address: string; who: string; bring: string; message: string; signup: string;
};

/** "SAT 12 DEC" and the year from YYYY-MM-DD (English, like the other posters); a placeholder until a date is chosen. */
function when(iso: string) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : null;
  if (!d || Number.isNaN(d.getTime())) return { line: 'DATE TBA', year: '' };
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...o, timeZone: 'UTC' }).format(d).toUpperCase();
  return { line: `${f({ weekday: 'short' })} ${f({ day: 'numeric' })} ${f({ month: 'short' })}`, year: f({ year: 'numeric' }) };
}

/**
 * The open tryout poster (Admin → Website → Player announcement → Tryout), in a sports-poster layout: the club's own
 * photo full size (natural, club green or black and white, with the Matchday poster's effects and shade) or a floodlit
 * pitch with a real-looking ball; the title in Nevera; one dark information bar with date, time and place; who it is
 * for, what to bring, the message and how to sign up. Everything else in Figtree.
 */
export function tryoutPoster(p: TryoutPoster) {
  const { W, H } = p, sq = p.format === 'square', story = p.format === 'story', pad = sq ? 56 : 64;
  const { line: dateLine, year } = when(p.date);
  const time = p.start ? (p.end ? `${p.start}–${p.end}` : p.start) : 'TIME TBA';
  const crestW = sq ? 104 : 128, crestH = Math.round(crestW * CREST_RATIO);
  const barH = sq ? 230 : story ? 300 : 270, barTop = H - barH - (sq ? 150 : story ? 300 : 190);
  const ball = sq ? 330 : story ? 560 : 460;
  const a = p.shade / 100;
  const label = (t: string) => <span style={{ display: 'flex', fontSize: sq ? 17 : 20, fontWeight: 900, letterSpacing: 4, color: GOLD }}>{t}</span>;
  // date and time take the room they need on one line; the place gets the rest (and may wrap)
  const col = (l: string, v: string, sub: string | null, fill: boolean) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...(fill ? { flexGrow: 1, flexBasis: 0, minWidth: 0 } : { flexShrink: 0 }), paddingLeft: 22, borderLeft: `3px solid ${GOLD}` }}>
      {label(l)}
      <span style={{ display: 'flex', fontSize: fill ? (sq ? 30 : story ? 42 : 36) : sq ? 34 : story ? 46 : 40, fontWeight: 900, lineHeight: 1.08, whiteSpace: fill ? 'normal' : 'nowrap' }}>{v}</span>
      {sub ? <span style={{ display: 'flex', fontSize: sq ? 18 : 22, color: 'rgba(255,255,255,.72)' }}>{sub}</span> : null}
    </div>
  );
  const art = p.fx === 'none' ? null : effect(p.fx, W, H, p.strength, sq ? 0.66 : 0.6);

  return (
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: INK, color: '#fff', fontFamily: 'Figtree', fontWeight: 700 }}>
      {/* the club's photo, in its own colours, club green or black and white; or the floodlit pitch */}
      {p.photo ? (
        <img src={p.photo} alt="" width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, objectFit: 'cover', ...(p.tone === 'natural' ? {} : { filter: 'grayscale(100%) contrast(115%)' }) }} />
      ) : <img src={tryoutPitch(W, H)} alt="" width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }} />}
      {p.photo && p.tone === 'green' ? <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', backgroundImage: 'linear-gradient(160deg, rgba(61,175,44,.62), rgba(14,60,10,.78))' }} /> : null}
      {art ? <img src={art} alt="" width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }} /> : null}
      {/* shade: darker at the top (title) and the bottom (details), set on the page */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, display: 'flex', backgroundImage: `linear-gradient(180deg, rgba(11,11,11,${(0.15 + a * 0.6).toFixed(2)}) 0%, rgba(11,11,11,${(a * 0.25).toFixed(2)}) 38%, rgba(11,11,11,${(0.2 + a * 0.5).toFixed(2)}) 70%, rgba(11,11,11,${Math.min(0.97, 0.55 + a * 0.45).toFixed(2)}) 100%)` }} />

      {p.ball ? <img src={football(ball)} alt="" width={ball} height={ball} style={{ position: 'absolute', right: sq ? 30 : 40, top: barTop - ball * 0.86 }} /> : null}

      {/* the club tab and crest */}
      <img src={clubBand(W, 440, 56)} alt="" width={W} height={56} style={{ position: 'absolute', left: 0, top: 0 }} />
      <span style={{ position: 'absolute', left: pad, top: 0, height: 56, display: 'flex', alignItems: 'center', fontSize: 22, fontWeight: 900, letterSpacing: 5, color: INK }}>AFRO FOOT CLUB</span>
      <img src={p.crest ?? `${p.origin}/afc-logo.png`} alt="" width={crestW} height={crestH} style={{ position: 'absolute', right: pad, top: 84, width: crestW, height: crestH, objectFit: 'contain' }} />

      {/* the title */}
      <div style={{ position: 'absolute', left: pad, top: sq ? 96 : story ? 170 : 110, display: 'flex', flexDirection: 'column' }}>
        <span style={{ display: 'flex', fontSize: sq ? 22 : 26, fontWeight: 900, letterSpacing: 6, color: GOLD }}>NEW PLAYERS WANTED{year ? ` · ${year}` : ''}</span>
        <span style={{ display: 'flex', fontFamily: 'Nevera', fontWeight: 400, fontSize: sq ? 96 : story ? 140 : 120, lineHeight: 1, marginTop: sq ? 14 : 20 }}>OPEN</span>
        <span style={{ display: 'flex', fontFamily: 'Nevera', fontWeight: 400, fontSize: sq ? 128 : story ? 188 : 164, lineHeight: 0.95 }}>TRYOUTS</span>
      </div>

      {/* the information bar: date, time, place; then who and what to bring */}
      <div style={{ position: 'absolute', left: 0, top: barTop, width: W, height: barH, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: sq ? 18 : 24, padding: `0 ${pad}px`, background: 'rgba(11,11,11,.86)', borderTop: `6px solid ${GREEN}` }}>
        <div style={{ display: 'flex', gap: sq ? 20 : 28 }}>
          {col('DATE', dateLine, null, false)}
          {col('TIME', time, null, false)}
          {col('PLACE', p.place || 'TBA', p.address || null, true)}
        </div>
        {p.who || p.bring ? (
          <div style={{ display: 'flex', gap: 34, fontSize: sq ? 18 : 22, color: 'rgba(255,255,255,.85)' }}>
            {p.who ? <span style={{ display: 'flex' }}><span style={{ display: 'flex', color: GOLD, fontWeight: 900, letterSpacing: 3, marginRight: 12 }}>FOR</span>{p.who}</span> : null}
            {p.bring ? <span style={{ display: 'flex' }}><span style={{ display: 'flex', color: GOLD, fontWeight: 900, letterSpacing: 3, marginRight: 12 }}>BRING</span>{p.bring}</span> : null}
          </div>
        ) : null}
      </div>

      {/* the message and how to sign up */}
      <div style={{ position: 'absolute', left: pad, right: pad, top: barTop + barH + (sq ? 22 : 34), display: 'flex', flexDirection: 'column', gap: sq ? 14 : 20 }}>
        <span style={{ display: 'flex', fontSize: sq ? 26 : story ? 36 : 32, fontWeight: 900, lineHeight: 1.15 }}>{p.message}</span>
        {p.signup ? <div style={{ display: 'flex' }}><span style={{ display: 'flex', alignItems: 'center', padding: sq ? '10px 22px' : '12px 26px', borderRadius: 999, background: GOLD, color: INK, fontSize: sq ? 22 : 26, fontWeight: 900 }}>{p.signup}</span></div> : null}
      </div>

      <div style={{ position: 'absolute', left: 0, bottom: 0, width: W, height: 12, display: 'flex', backgroundImage: `linear-gradient(90deg, ${GREEN}, ${GOLD})` }} />
      <span style={{ position: 'absolute', right: pad, bottom: 30, display: 'flex', fontSize: 22, color: 'rgba(255,255,255,.8)' }}>www.afrofoot.club · #afrofootclub</span>
    </div>
  );
}
