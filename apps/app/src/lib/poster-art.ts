/**
 * Drawings for the Starting XI poster (Admin → Website → Matchday poster), as SVG data URLs the image renderer draws:
 * the crest's green-to-yellow band with its four stars, the "football wave" (a flowing band of football panels and two
 * ribbons in the club colours), the crest-shaped shirt-number shield, and the wave edge that blends a photo into the poster.
 */
const GREEN = '#3DAF2C', GOLD = '#EDF70F', INK = '#0b0b0b';
const svg = (w: number, h: number, body: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`).toString('base64')}`;
const gradient = (id: string, x2 = 1, y2 = 0) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${GREEN}"/><stop offset="0.55" stop-color="#8fd61f"/><stop offset="1" stop-color="${GOLD}"/></linearGradient>`;
const star = (cx: number, cy: number, r: number) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  });
  return `<polygon points="${pts.join(' ')}" fill="${INK}"/>`;
};

/** The crest's top band: green to yellow, four black stars. */
export function starsBand(w: number, h: number): string {
  const stars = [0.2, 0.4, 0.6, 0.8].map((f) => star(w * f, h / 2, h * 0.32)).join('');
  return svg(w, h, `<defs>${gradient('g')}</defs><rect width="${w}" height="${h}" fill="url(#g)"/>${stars}`);
}

/**
 * The football wave: hexagon panels (like a ball's skin) along a sine wave that sweeps across the poster, larger and
 * brighter at its centre line and fading at its edges, with two ribbons following the same curve.
 */
export function ballWave(w: number, h: number, centre = 0.66, amplitude = 0.07): string {
  const cy = (x: number) => h * centre + h * amplitude * Math.sin((x / w) * Math.PI * 1.6 + 0.6) - (x / w) * h * 0.12;
  const r = 34, dx = r * Math.sqrt(3), dy = r * 1.5, band = h * 0.16;
  let cells = '';
  for (let row = -2; row * dy < h + r * 2; row++) {
    for (let col = -1; col * dx < w + dx; col++) {
      const x = col * dx + (row % 2 ? dx / 2 : 0), y = row * dy;
      const dist = Math.abs(y - cy(x));
      if (dist > band) continue;
      const k = 1 - dist / band;                              // 1 on the wave's centre line, 0 at its edges
      const s = r * (0.55 + 0.45 * k);
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        return `${(x + s * Math.cos(a)).toFixed(1)},${(y + s * Math.sin(a)).toFixed(1)}`;
      }).join(' ');
      const filled = (col * 7 + row * 3) % 5 === 0 && k > 0.45;   // a few solid panels, like a ball's
      cells += `<polygon points="${pts}" fill="${filled ? 'url(#g)' : 'none'}" fill-opacity="${(0.38 * k).toFixed(2)}" stroke="url(#g)" stroke-opacity="${(0.1 + 0.55 * k).toFixed(2)}" stroke-width="${(1.2 + 2.2 * k).toFixed(1)}"/>`;
    }
  }
  const ribbon = (off: number, width: number, op: number) => {
    let d = '';
    for (let x = -20; x <= w + 20; x += 20) d += `${x === -20 ? 'M' : 'L'}${x},${(cy(x) + off).toFixed(1)} `;
    return `<path d="${d}" fill="none" stroke="url(#g)" stroke-width="${width}" stroke-opacity="${op}" stroke-linecap="round"/>`;
  };
  return svg(w, h, `<defs>${gradient('g')}</defs>${cells}${ribbon(-band - 18, 6, 0.9)}${ribbon(band + 22, 14, 0.85)}`);
}

/** A shirt-number shield shaped like the crest: black, a thin white edge, the colour band on top. */
export function shield(size: number, goalkeeper = false): string {
  const w = size, h = size * 1.18;
  const path = `M${w * 0.06},${h * 0.06} L${w * 0.94},${h * 0.06} L${w * 0.94},${h * 0.58} Q${w * 0.94},${h * 0.8} ${w * 0.5},${h * 0.96} Q${w * 0.06},${h * 0.8} ${w * 0.06},${h * 0.58} Z`;
  return svg(w, h, `<defs>${gradient('g')}<clipPath id="c"><path d="${path}"/></clipPath></defs>
    <path d="${path}" fill="${goalkeeper ? GOLD : INK}" stroke="#fff" stroke-width="${Math.max(2, size * 0.045)}"/>
    <rect x="0" y="0" width="${w}" height="${h * 0.17}" fill="url(#g)" clip-path="url(#c)"/>`);
}

/** The edge that blends a photo into the poster: a wave fading in from the left, a fade at the top and a wave at the bottom. */
export function photoEdge(w: number, h: number): string {
  let d = `M0,0 L${w * 0.2},0 `;
  for (let y = 0; y <= h; y += 20) d += `L${(w * 0.12 + w * 0.07 * Math.sin((y / h) * Math.PI * 2.2)).toFixed(1)},${y} `;
  d += `L0,${h} Z`;
  let b = `M0,${h} `;
  for (let x = 0; x <= w; x += 20) b += `L${x},${(h * 0.86 + h * 0.05 * Math.sin((x / w) * Math.PI * 1.6 + 1)).toFixed(1)} `;
  b += `L${w},${h} Z`;
  return svg(w, h, `<defs>
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${INK}" stop-opacity="0.95"/><stop offset="0.18" stop-color="${INK}" stop-opacity="0"/><stop offset="0.7" stop-color="${INK}" stop-opacity="0"/><stop offset="1" stop-color="${INK}" stop-opacity="0.85"/></linearGradient>
    <linearGradient id="l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${INK}" stop-opacity="0.95"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#t)"/><rect width="${w * 0.35}" height="${h}" fill="url(#l)"/>
    <path d="${d}" fill="${INK}" fill-opacity="0.9"/><path d="${b}" fill="${INK}"/>`);
}

/** A pitch outline (thin white lines) for the pitch layout. */
export function pitchLines(w: number, h: number): string {
  const s = 'stroke="rgba(255,255,255,0.45)" stroke-width="3" fill="none"';
  return svg(w, h, `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="22" ${s}/><line x1="2" y1="${h / 2}" x2="${w - 2}" y2="${h / 2}" ${s}/>
    <circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.13}" ${s}/><rect x="${w * 0.25}" y="2" width="${w * 0.5}" height="${h * 0.13}" ${s}/><rect x="${w * 0.25}" y="${h * 0.87 - 2}" width="${w * 0.5}" height="${h * 0.13}" ${s}/>`);
}

export const CREST_RATIO = 640 / 454; // the crest is taller than wide (public/afc-logo.png)
