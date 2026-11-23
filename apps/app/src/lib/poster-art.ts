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
 * The top banner (replaces the full-width star band): a thin green-to-yellow line across the top and a slanted tab on
 * the left in the same colours, for the club's name and the crest's four stars (drawn by the poster over it).
 */
export function clubBand(w: number, tabW: number, h: number): string {
  const stars = [0, 1, 2, 3].map((i) => star(tabW - h * 0.36 - h * 0.5 - (3 - i) * h * 0.62, h / 2, h * 0.24)).join('');
  return svg(w, h, `<defs>${gradient('g')}</defs><rect width="${w}" height="8" fill="url(#g)"/><polygon points="0,0 ${tabW},0 ${tabW - h * 0.36},${h} 0,${h}" fill="url(#g)"/>${stars}`);
}

/**
 * One row of the "broadcast" line-up (TV graphics): a slanted number tab in the row's colour, a dark name bar and a thin
 * slanted edge at its end in the same colour. tabW: the tab's width; the bar fills the rest of w.
 */
export function broadcastRow(w: number, h: number, tabW: number, colour: string): string {
  const k = h * 0.25; // the slant
  return svg(w, h, `<polygon points="${k},0 ${tabW},0 ${tabW - k},${h} 0,${h}" fill="${colour}"/>`
    + `<polygon points="${tabW + 4},0 ${w},0 ${w - k},${h} ${tabW + 4 - k},${h}" fill="rgba(11,11,11,0.8)"/>`
    + `<polygon points="${w - 9},0 ${w},0 ${w - k},${h} ${w - k - 9},${h}" fill="${colour}"/>`);
}

/** Where the featured player photo goes, shown in the preview until one is chosen: a dashed frame and a silhouette. */
export function photoPlaceholder(w: number, h: number): string {
  const cx = w / 2, r = Math.min(w, h) * 0.16, top = h * 0.3;
  return svg(w, h, `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="28" fill="rgba(11,11,11,0.35)" stroke="rgba(255,255,255,0.7)" stroke-width="4" stroke-dasharray="18 12"/>`
    + `<circle cx="${cx}" cy="${top}" r="${r}" fill="rgba(255,255,255,0.5)"/>`
    + `<path d="M${cx - r * 2.1},${top + r * 3.4} Q${cx - r * 2.1},${top + r * 1.35} ${cx},${top + r * 1.35} Q${cx + r * 2.1},${top + r * 1.35} ${cx + r * 2.1},${top + r * 3.4} Z" fill="rgba(255,255,255,0.5)"/>`);
}

/** The background effects the admin chooses from (Matchday poster → Effect); "none" draws nothing. */
export const EFFECTS = ['wave', 'ribbons', 'stripes', 'dots', 'none'] as const;
export type Effect = (typeof EFFECTS)[number];
export const DEFAULT_STRENGTH = 60; // 0–100 on the page; 60 is the original look
export const DEFAULT_SHADE = 35;    // darkness over a background photo, 0–100 (it was a fixed ~85 before)

/** The shared curve every effect follows: a sine wave that rises slightly to the right. */
const curve = (w: number, h: number, centre: number) => (x: number) => h * centre + h * 0.07 * Math.sin((x / w) * Math.PI * 1.6 + 0.6) - (x / w) * h * 0.12;
const clamp = (v: number) => Math.max(0, Math.min(1, v)).toFixed(2);
const ribbonPath = (w: number, cy: (x: number) => number, off: number) => {
  let d = '';
  for (let x = -20; x <= w + 20; x += 20) d += `${x === -20 ? 'M' : 'L'}${x},${(cy(x) + off).toFixed(1)} `;
  return d;
};

/**
 * One background effect, drawn once for the whole poster. strength 0–100 scales every opacity (60 = the original).
 * wave: football panels (hexagons) along the curve, brightest on its centre line, with two ribbons.
 * ribbons: five flowing green-to-yellow bands. stripes: the kit's horizontal yellow stripes in a band along the curve.
 * dots: the kit's yellow dots, growing towards the curve's centre line.
 */
export function effect(kind: Effect, w: number, h: number, strength = DEFAULT_STRENGTH, centre = 0.6): string | null {
  if (kind === 'none' || strength <= 0) return null;
  const m = strength / DEFAULT_STRENGTH;
  const cy = curve(w, h, centre), band = h * 0.16;
  let body = '';
  if (kind === 'wave') {
    const r = 34, dx = r * Math.sqrt(3), dy = r * 1.5;
    for (let row = -2; row * dy < h + r * 2; row++) {
      for (let col = -1; col * dx < w + dx; col++) {
        const x = col * dx + (row % 2 ? dx / 2 : 0), y = row * dy;
        const dist = Math.abs(y - cy(x));
        if (dist > band) continue;
        const k = 1 - dist / band;
        const sz = r * (0.55 + 0.45 * k);
        const pts = Array.from({ length: 6 }, (_, i) => {
          const a = Math.PI / 6 + (i * Math.PI) / 3;
          return `${(x + sz * Math.cos(a)).toFixed(1)},${(y + sz * Math.sin(a)).toFixed(1)}`;
        }).join(' ');
        const filled = (col * 7 + row * 3) % 5 === 0 && k > 0.45;
        body += `<polygon points="${pts}" fill="${filled ? 'url(#g)' : 'none'}" fill-opacity="${clamp(0.38 * k * m)}" stroke="url(#g)" stroke-opacity="${clamp((0.1 + 0.55 * k) * m)}" stroke-width="${(1.2 + 2.2 * k).toFixed(1)}"/>`;
      }
    }
    body += `<path d="${ribbonPath(w, cy, -band - 18)}" fill="none" stroke="url(#g)" stroke-width="6" stroke-opacity="${clamp(0.9 * m)}" stroke-linecap="round"/>`;
    body += `<path d="${ribbonPath(w, cy, band + 22)}" fill="none" stroke="url(#g)" stroke-width="14" stroke-opacity="${clamp(0.85 * m)}" stroke-linecap="round"/>`;
  } else if (kind === 'ribbons') {
    ([[-band, 10, 0.55], [-band * 0.45, 28, 0.35], [0, 54, 0.5], [band * 0.5, 22, 0.4], [band * 1.05, 12, 0.7]] as const).forEach(([off, sw, op]) => {
      body += `<path d="${ribbonPath(w, cy, off)}" fill="none" stroke="url(#g)" stroke-width="${sw}" stroke-opacity="${clamp(op * m)}" stroke-linecap="round"/>`;
    });
  } else if (kind === 'stripes') {
    // horizontal kit stripes, only inside a band that follows the curve (fading towards its edges)
    for (let y = 0; y < h; y += 26) {
      let d = '';
      for (let x = 0; x <= w; x += 24) {
        const k = 1 - Math.abs(y - cy(x)) / (band * 1.3);
        if (k <= 0) { if (d) { body += `<path d="${d}" fill="none" stroke="${GOLD}" stroke-width="7" stroke-opacity="${clamp(0.42 * m)}" stroke-linecap="round"/>`; d = ''; } continue; }
        d += `${d ? 'L' : 'M'}${x},${y} `;
      }
      if (d) body += `<path d="${d}" fill="none" stroke="${GOLD}" stroke-width="7" stroke-opacity="${clamp(0.42 * m)}" stroke-linecap="round"/>`;
    }
    body = `<path d="${ribbonPath(w, cy, 0)}" fill="none" stroke="${GREEN}" stroke-width="${band * 2.2}" stroke-opacity="${clamp(0.32 * m)}"/>` + body;
  } else if (kind === 'dots') {
    const step = 30;
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2 + ((y / step) % 2 ? step / 2 : 0); x < w; x += step) {
        const k = 1 - Math.abs(y - cy(x)) / (band * 1.4);
        if (k <= 0.05) continue;
        body += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(2 + 10 * k).toFixed(1)}" fill="url(#g)" fill-opacity="${clamp((0.15 + 0.6 * k) * m)}"/>`;
      }
    }
  }
  return svg(w, h, `<defs>${gradient('g')}</defs>${body}`);
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
export function photoEdge(w: number, h: number, dark = 1): string {
  let d = `M0,0 L${w * 0.2},0 `;
  for (let y = 0; y <= h; y += 20) d += `L${(w * 0.12 + w * 0.07 * Math.sin((y / h) * Math.PI * 2.2)).toFixed(1)},${y} `;
  d += `L0,${h} Z`;
  let b = `M0,${h} `;
  for (let x = 0; x <= w; x += 20) b += `L${x},${(h * 0.86 + h * 0.05 * Math.sin((x / w) * Math.PI * 1.6 + 1)).toFixed(1)} `;
  b += `L${w},${h} Z`;
  return svg(w, h, `<defs>
    <linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${INK}" stop-opacity="${(0.6 * dark).toFixed(2)}"/><stop offset="0.14" stop-color="${INK}" stop-opacity="0"/><stop offset="0.75" stop-color="${INK}" stop-opacity="0"/><stop offset="1" stop-color="${INK}" stop-opacity="${(0.6 * dark).toFixed(2)}"/></linearGradient>
    <linearGradient id="l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${INK}" stop-opacity="${(0.7 * dark).toFixed(2)}"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#t)"/><rect width="${w * 0.35}" height="${h}" fill="url(#l)"/>
    <path d="${d}" fill="${INK}" fill-opacity="${(0.75 * dark).toFixed(2)}"/><path d="${b}" fill="${INK}" fill-opacity="${Math.min(1, 0.4 + 0.6 * dark).toFixed(2)}"/>`);
}

/** A pitch outline (thin white lines) for the pitch layout. */
export function pitchLines(w: number, h: number): string {
  const s = 'stroke="rgba(255,255,255,0.45)" stroke-width="3" fill="none"';
  return svg(w, h, `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="22" ${s}/><line x1="2" y1="${h / 2}" x2="${w - 2}" y2="${h / 2}" ${s}/>
    <circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.13}" ${s}/><rect x="${w * 0.25}" y="2" width="${w * 0.5}" height="${h * 0.13}" ${s}/><rect x="${w * 0.25}" y="${h * 0.87 - 2}" width="${w * 0.5}" height="${h * 0.13}" ${s}/>`);
}

export const CREST_RATIO = 640 / 454; // the crest is taller than wide (public/afc-logo.png)
