import { ImageResponse } from 'next/og';

/**
 * The club's branded picture for a social post (content assistant, migrations 0064 and 0071): black, the green bar and the
 * yellow "AFRO FOOT CLUB" band, the headline and, for a result, the score. Square (1080 × 1080) or tall (1080 × 1920).
 * Used by the preview (/api/content/card) and by the picture sent to Facebook and Instagram (/api/social/image/[id]).
 */
export function cardImage(input: { title: string; kind?: string; score?: string; tall?: boolean }): ImageResponse {
  const title = input.title.slice(0, 110), kind = (input.kind ?? '').slice(0, 40), score = (input.score ?? '').slice(0, 12);
  const W = 1080, H = input.tall ? 1920 : 1080;
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
