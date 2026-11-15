/**
 * Lineup export for group chats and social media (client only): a 1080×1350 image (PNG or JPEG) and a short animated
 * clip (MP4 where the browser can record it, otherwise WebM) in which the players appear on the pitch one by one.
 * Drawn from scratch on a canvas (no photos, so nothing from another origin can block the export).
 */
import type { Slot } from './match';

export interface ExportData {
  team: string; title: string; subtitle: string; formation: string; styleLabel: string;
  slots: Slot[]; onPitch: Record<number, { name: string; shirt: number | null; captain: boolean }>;
  bench: { name: string; shirt: number | null }[]; benchLabel: string; footer: string;
}

const W = 1080, H = 1350, GREEN = '#3DAF2C', INK = '#0b0f0a';
const PITCH = { x: 70, y: 250, w: 940, h: 880 };

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const surname = (n: string) => n.split(' ').slice(-1)[0] ?? n;
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Draw the lineup; `t` from 0 to 1 animates the players in (1 = everything shown). */
export function drawLineup(g: CanvasRenderingContext2D, d: ExportData, t = 1) {
  g.save();
  g.fillStyle = INK; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W, 0, 50, W, 0, 900); glow.addColorStop(0, '#1f5a17'); glow.addColorStop(1, INK); g.fillStyle = glow; g.fillRect(0, 0, W, 240);
  g.textBaseline = 'alphabetic'; g.direction = 'ltr';
  g.fillStyle = GREEN; g.font = '800 30px Figtree, Cairo, sans-serif'; g.fillText(d.team.toUpperCase(), 70, 92);
  g.fillStyle = '#fff'; g.font = '900 64px Figtree, Cairo, sans-serif'; g.fillText(d.title, 70, 162);
  g.fillStyle = '#c8d6c4'; g.font = '600 30px Figtree, Cairo, sans-serif'; g.fillText(d.subtitle, 70, 210);
  g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = '900 56px Figtree, sans-serif'; g.fillText(d.formation, W - 70, 162);
  g.fillStyle = GREEN; g.font = '700 28px Figtree, Cairo, sans-serif'; g.fillText(d.styleLabel, W - 70, 210); g.textAlign = 'left';

  // pitch
  roundRect(g, PITCH.x, PITCH.y, PITCH.w, PITCH.h, 28); g.save(); g.clip();
  for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#349a26' : '#2f8f22'; g.fillRect(PITCH.x, PITCH.y + (i * PITCH.h) / 10, PITCH.w, PITCH.h / 10 + 1); }
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 4;
  g.strokeRect(PITCH.x + 20, PITCH.y + 20, PITCH.w - 40, PITCH.h - 40);
  g.beginPath(); g.moveTo(PITCH.x + 20, PITCH.y + PITCH.h / 2); g.lineTo(PITCH.x + PITCH.w - 20, PITCH.y + PITCH.h / 2); g.stroke();
  g.beginPath(); g.arc(PITCH.x + PITCH.w / 2, PITCH.y + PITCH.h / 2, 90, 0, Math.PI * 2); g.stroke();
  g.strokeRect(PITCH.x + PITCH.w * 0.22, PITCH.y + PITCH.h - 20 - 150, PITCH.w * 0.56, 150);
  g.strokeRect(PITCH.x + PITCH.w * 0.22, PITCH.y + 20, PITCH.w * 0.56, 150);
  g.restore();

  // players, goalkeeper first, then up the pitch
  const order = [...d.slots].sort((a, b) => b.y - a.y || a.x - b.x);
  order.forEach((s, i) => {
    const p = d.onPitch[s.slot];
    const k = ease(t * (order.length + 2) - i);
    if (k <= 0) return;
    const x = PITCH.x + (s.x / 100) * PITCH.w, y = PITCH.y + (s.y / 100) * PITCH.h, r = 42 * (0.6 + 0.4 * k);
    g.globalAlpha = k;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = p ? (s.role === 'GK' ? INK : '#fff') : 'rgba(255,255,255,.18)'; g.fill();
    g.lineWidth = 5; g.strokeStyle = p ? (s.role === 'GK' ? '#fff' : GREEN) : 'rgba(255,255,255,.6)'; g.stroke();
    g.textAlign = 'center'; g.fillStyle = p ? (s.role === 'GK' ? '#fff' : INK) : '#fff'; g.font = '900 34px Figtree, sans-serif';
    g.fillText(p ? String(p.shirt ?? '•') : s.role, x, y + 12);
    if (p) {
      const label = surname(p.name) + (p.captain ? ' (C)' : '');
      g.font = '700 26px Figtree, Cairo, sans-serif'; const w = g.measureText(label).width + 22;
      g.fillStyle = 'rgba(0,0,0,.62)'; roundRect(g, x - w / 2, y + r + 8, w, 38, 19); g.fill();
      g.fillStyle = '#fff'; g.fillText(label, x, y + r + 36);
    }
    g.textAlign = 'left'; g.globalAlpha = 1;
  });

  // bench and footer
  const kb = ease(t * 1.2 - 0.6);
  if (kb > 0) {
    g.globalAlpha = kb; g.fillStyle = GREEN; g.font = '800 26px Figtree, Cairo, sans-serif'; g.fillText(d.benchLabel.toUpperCase(), 70, 1180);
    g.fillStyle = '#fff'; g.font = '600 28px Figtree, Cairo, sans-serif';
    const text = d.bench.map((b) => `${b.shirt ? `#${b.shirt} ` : ''}${b.name}`).join(' · ') || '–';
    let line = '', y = 1222;
    for (const word of text.split(' ')) { const next = line ? `${line} ${word}` : word; if (g.measureText(next).width > W - 140 && line) { g.fillText(line, 70, y); line = word; y += 38; } else line = next; }
    if (line && y < 1300) g.fillText(line, 70, y);
    g.globalAlpha = 1;
  }
  g.fillStyle = '#7d8a78'; g.font = '600 22px Figtree, sans-serif'; g.textAlign = 'right'; g.fillText(d.footer, W - 70, H - 28); g.textAlign = 'left';
  g.restore();
}

function canvas() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }

export async function lineupImage(d: ExportData, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  await document.fonts?.ready;
  const c = canvas(); const g = c.getContext('2d')!; drawLineup(g, d, 1);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('export'))), type, 0.92));
}

/** A ~5 second clip; null when the browser cannot record video. */
export async function lineupVideo(d: ExportData): Promise<{ blob: Blob; ext: 'mp4' | 'webm'; type: string } | null> {
  if (typeof MediaRecorder === 'undefined') return null;
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((x) => MediaRecorder.isTypeSupported(x));
  if (!type) return null;
  await document.fonts?.ready;
  const c = canvas(); const g = c.getContext('2d')!;
  const stream = c.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
  const ms = 5000, anim = 3200, start = performance.now();
  drawLineup(g, d, 0); rec.start(250);
  await new Promise<void>((resolve) => {
    const frame = () => { const e = performance.now() - start; drawLineup(g, d, Math.min(1, e / anim)); if (e < ms) requestAnimationFrame(frame); else resolve(); };
    requestAnimationFrame(frame);
  });
  rec.stop(); await done; stream.getTracks().forEach((tr) => tr.stop());
  const base = type.split(';')[0]!;
  return { blob: new Blob(chunks, { type: base }), ext: base === 'video/mp4' ? 'mp4' : 'webm', type: base };
}

/** Share a file (WhatsApp, Spond, … through the phone's share sheet); falls back to downloading it. */
export async function shareOrDownload(blob: Blob, name: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, { type: blob.type });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return 'shared'; }
  } catch (e) { if ((e as Error)?.name === 'AbortError') return 'cancelled'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return 'downloaded';
}
