import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

/**
 * The club's branded picture for a social post (content assistant, migration 0064): black, the green bar and the yellow
 * "AFRO FOOT CLUB" band, the headline and, for a result, the score. Square (1080 × 1080) or tall (?tall=1, 1080 × 1920).
 * Text only comes from the query (?t= headline, ?k= kind label, ?s= score), cut to a safe length.
 */
export const runtime = 'edge';

export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const title = (q.get('t') ?? '').slice(0, 110), kind = (q.get('k') ?? '').slice(0, 40), score = (q.get('s') ?? '').slice(0, 12);
  const tall = q.get('tall') === '1';
  const W = 1080, H = tall ? 1920 : 1080;
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', background: '#0b0b0b', color: '#fff', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', height: 28, background: '#3DAF2C' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '48px 72px 0' }}>
          <div style={{ display: 'flex', background: '#EDF70F', color: '#0b0b0b', fontSize: 40, fontWeight: 900, padding: '12px 28px', borderRadius: 999, letterSpacing: 4 }}>AFRO FOOT CLUB</div>
          {kind ? <div style={{ display: 'flex', fontSize: 34, color: '#3DAF2C', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 3 }}>{kind}</div> : null}
        </div>
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', padding: '0 72px' }}>
          {score ? <div style={{ display: 'flex', fontSize: 220, fontWeight: 900, color: '#EDF70F', lineHeight: 1 }}>{score}</div> : null}
          <div style={{ display: 'flex', fontSize: title.length > 60 ? 64 : 84, fontWeight: 900, lineHeight: 1.1, marginTop: score ? 32 : 0 }}>{title}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 72px 56px', fontSize: 34, color: '#bdbdbd' }}>
          <span>www.afrofoot.club</span><span>#afrofootclub</span>
        </div>
        <div style={{ display: 'flex', height: 28, background: '#3DAF2C' }} />
      </div>
    ),
    { width: W, height: H },
  );
}
