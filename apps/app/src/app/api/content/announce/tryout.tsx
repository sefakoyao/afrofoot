import { CREST_RATIO, clubBand, cones, detailIcon, football, tryoutPitch } from '@/lib/poster-art';
import type { PosterFormat } from '@/lib/poster';

const GREEN = '#3DAF2C', GOLD = '#EDF70F', INK = '#0b0b0b';

export type TryoutPoster = {
  format: PosterFormat; W: number; H: number; origin: string; crest: string | null; photo: string | null;
  date: string; start: string; end: string; place: string; address: string; who: string; bring: string; message: string; signup: string;
};

/** "SAT", "12", "DECEMBER" from YYYY-MM-DD (English, like the other posters); blanks when no date is chosen yet. */
function dateParts(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { wd: 'DAY', day: '––', month: 'DATE' };
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return { wd: 'DAY', day: '––', month: 'DATE' };
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...o, timeZone: 'UTC' }).format(d).toUpperCase();
  return { wd: f({ weekday: 'long' }), day: f({ day: 'numeric' }), month: f({ month: 'long' }) };
}

/**
 * The open tryout poster (Admin → Website → Player announcement → Tryout): a floodlit pitch, the title in Nevera, a big
 * football (or the chosen photo), the date block, time and place typed by the admin, who it is for, what to bring, the
 * message and how to sign up. The rest in Figtree, in the club colours.
 */
export function tryoutPoster(p: TryoutPoster) {
  const { W, H } = p, sq = p.format === 'square', story = p.format === 'story', pad = sq ? 56 : 64;
  const { wd, day, month } = dateParts(p.date);
  const time = p.start ? (p.end ? `${p.start}–${p.end}` : p.start) : '––:––';
  const crestW = sq ? 110 : 140, crestH = Math.round(crestW * CREST_RATIO);
  const ball = sq ? 270 : story ? 460 : 330;
  const ballTop = sq ? 270 : story ? 650 : 430, ballRight = sq ? -40 : story ? -70 : -50;
  const titleTop = sq ? 150 : story ? 230 : 170;
  const infoTop = sq ? 470 : story ? 1150 : 700;
  const dateW = sq ? 190 : 230, dateH = sq ? 200 : 240;
  const chip = (text: string, bg: string, fg = '#fff', border?: string) => (
    <span style={{ display: 'flex', alignItems: 'center', padding: '8px 18px', borderRadius: 999, background: bg, color: fg, fontSize: sq ? 20 : 24, fontWeight: 900, letterSpacing: 2, ...(border ? { border } : {}) }}>{text}</span>
  );
  const iconRow = (icon: 'pin' | 'clock', main: string, sub?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: sq ? 52 : 62, height: sq ? 52 : 62, borderRadius: 999, background: GOLD, flexShrink: 0 }}>
        <img src={detailIcon(icon, sq ? 32 : 38)} alt="" width={sq ? 32 : 38} height={sq ? 32 : 38} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ display: 'flex', fontSize: icon === 'clock' ? (sq ? 46 : 58) : sq ? 30 : 36, fontWeight: 900, lineHeight: 1.05 }}>{main}</span>
        {sub ? <span style={{ display: 'flex', fontSize: sq ? 20 : 24, color: 'rgba(255,255,255,.75)', marginTop: 4 }}>{sub}</span> : null}
      </div>
    </div>
  );
  const whoChips = p.who.split(/\s*[·,|]\s*/).filter(Boolean).slice(0, 4);

  return (
    <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: INK, color: '#fff', fontFamily: 'Figtree', fontWeight: 700 }}>
      <img src={tryoutPitch(W, H)} alt="" width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }} />

      {/* a photo of the team training, or the big ball with speed lines */}
      {p.photo ? (
        <div style={{ position: 'absolute', right: 0, top: titleTop - 40, width: sq ? 520 : 620, height: infoTop - titleTop + 20, display: 'flex', maskImage: 'linear-gradient(180deg, transparent 0%, #000 18%, #000 70%, transparent 100%)' }}>
          <img src={p.photo} alt="" width={sq ? 520 : 620} height={infoTop - titleTop + 20} style={{ width: sq ? 520 : 620, height: infoTop - titleTop + 20, objectFit: 'cover', maskImage: 'linear-gradient(90deg, transparent 0%, #000 30%)' }} />
        </div>
      ) : (
        <img src={football(ball)} alt="" width={ball} height={ball} style={{ position: 'absolute', right: ballRight, top: ballTop }} />
      )}
      {p.photo ? <img src={football(sq ? 130 : 160)} alt="" width={sq ? 130 : 160} height={sq ? 130 : 160} style={{ position: 'absolute', right: pad, top: infoTop - (sq ? 120 : 150) }} /> : null}

      {/* the club tab, crest, label and title */}
      <img src={clubBand(W, 440, 56)} alt="" width={W} height={56} style={{ position: 'absolute', left: 0, top: 0 }} />
      <span style={{ position: 'absolute', left: pad, top: 0, height: 56, display: 'flex', alignItems: 'center', fontSize: 22, fontWeight: 900, letterSpacing: 5, color: INK }}>AFRO FOOT CLUB</span>
      <img src={p.crest ?? `${p.origin}/afc-logo.png`} alt="" width={crestW} height={crestH} style={{ position: 'absolute', right: pad, top: 84, width: crestW, height: crestH, objectFit: 'contain' }} />
      <div style={{ position: 'absolute', left: pad, top: sq ? 86 : 96, display: 'flex' }}>{chip('NEW PLAYERS WANTED', GOLD, INK)}</div>
      <div style={{ position: 'absolute', left: pad, top: titleTop, display: 'flex', flexDirection: 'column' }}>
        <span style={{ display: 'flex', fontFamily: 'Nevera', fontWeight: 400, fontSize: sq ? 92 : story ? 130 : 116, lineHeight: 1, letterSpacing: 2 }}>OPEN</span>
        <span style={{ display: 'flex', fontFamily: 'Nevera', fontWeight: 400, fontSize: sq ? 120 : story ? 170 : 150, lineHeight: 1, letterSpacing: 2, color: GOLD }}>TRYOUTS</span>
        <img src={cones(sq ? 300 : 380, sq ? 60 : 74, 5)} alt="" width={sq ? 300 : 380} height={sq ? 60 : 74} style={{ marginTop: sq ? 10 : 18 }} />
      </div>

      {/* when and where: the date block, time and place */}
      <div style={{ position: 'absolute', left: pad, right: pad, top: infoTop, display: 'flex', gap: sq ? 26 : 34, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: dateW, height: dateH, borderRadius: 30, background: GOLD, color: INK, flexShrink: 0, boxShadow: '0 18px 40px rgba(0,0,0,.45)' }}>
          <span style={{ display: 'flex', fontSize: sq ? 22 : 26, fontWeight: 900, letterSpacing: 3 }}>{wd}</span>
          <span style={{ display: 'flex', fontSize: sq ? 96 : 118, fontWeight: 900, lineHeight: 1 }}>{day}</span>
          <span style={{ display: 'flex', fontSize: sq ? 22 : 26, fontWeight: 900, letterSpacing: 3 }}>{month}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: sq ? 16 : 22, minWidth: 0 }}>
          {iconRow('clock', time)}
          {iconRow('pin', p.place || 'Place to be announced', p.address || undefined)}
        </div>
      </div>

      {/* who, what to bring, the message and how to sign up */}
      <div style={{ position: 'absolute', left: pad, right: pad, bottom: sq ? 70 : 92, display: 'flex', flexDirection: 'column', gap: sq ? 12 : 16 }}>
        {whoChips.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{whoChips.map((w, i) => <span key={i} style={{ display: 'flex' }}>{chip(w.toUpperCase().slice(0, 28), i === 0 ? GREEN : 'rgba(255,255,255,.12)', i === 0 ? INK : '#fff', i === 0 ? undefined : '2px solid rgba(255,255,255,.25)')}</span>)}</div> : null}
        {p.bring ? <span style={{ display: 'flex', fontSize: sq ? 20 : 24, letterSpacing: 2, color: 'rgba(255,255,255,.85)' }}><span style={{ display: 'flex', color: GOLD, fontWeight: 900, marginRight: 10 }}>BRING</span>{p.bring.toUpperCase()}</span> : null}
        <span style={{ display: 'flex', fontSize: sq ? 26 : 32, fontWeight: 900, lineHeight: 1.15, maxWidth: W - pad * 2 }}>{p.message}</span>
        {p.signup ? <div style={{ display: 'flex' }}><span style={{ display: 'flex', alignItems: 'center', padding: sq ? '12px 24px' : '14px 30px', borderRadius: 999, background: '#fff', color: INK, fontSize: sq ? 22 : 26, fontWeight: 900, letterSpacing: 1 }}>{p.signup}</span></div> : null}
      </div>

      <div style={{ position: 'absolute', left: 0, bottom: 0, width: W, height: 12, display: 'flex', backgroundImage: `linear-gradient(90deg, ${GREEN}, ${GOLD})` }} />
      <span style={{ position: 'absolute', right: pad, bottom: 34, display: 'flex', fontSize: 22, color: 'rgba(255,255,255,.8)' }}>www.afrofoot.club · #afrofootclub</span>
    </div>
  );
}
