import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Contract } from './contracts';
import { signatureId } from './esign';
import { scriptable } from './esign-script';
import { FONT_BOLD, FONT_REGULAR, LOGO_PNG } from './invoice/assets';
import { FONT_SIGNATURE } from './signature-font';

/**
 * Player contract as an A4 PDF: logo, title and term, the text ("## " headings, "- " bullets), and a signature page with
 * both electronic signatures (the typed name drawn in a handwriting font, the printed name, time in Helsinki and a
 * signature reference) and the SHA-256 fingerprint of the signed text.
 */
const W = 595.28, H = 841.89, M = 56, BOTTOM = 64;
const INK = rgb(0.08, 0.08, 0.08), MUTED = rgb(0.38, 0.38, 0.38), GREEN = rgb(0.16, 0.54, 0.11);
const when = (iso: string | null) => (iso ? `${new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' })} (Helsinki)` : '');
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** `footer`: the club's details printed at the bottom of every page (name, address, business ID, contacts). */
export async function renderContractPdf(c: Contract, player: string, club: string, footer: string[] = []): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${c.title} – ${player}`); doc.setAuthor(club); doc.setCreator('Afro Foot member app');
  const regular = await doc.embedFont(Buffer.from(FONT_REGULAR, 'base64'), { subset: true });
  const bold = await doc.embedFont(Buffer.from(FONT_BOLD, 'base64'), { subset: true });
  const script = await doc.embedFont(Buffer.from(FONT_SIGNATURE, 'base64'), { subset: true });
  const logo = await doc.embedPng(Buffer.from(LOGO_PNG, 'base64'));

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M; // baseline cursor from the bottom, like pdf-lib
  const pages: PDFPage[] = [page];
  const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = H - M; };
  const need = (h: number) => { if (y - h < BOTTOM) newPage(); };
  const wrap = (s: string, font: PDFFont, size: number, width: number) => {
    const out: string[] = []; let cur = '';
    for (const word of s.replace(/\s+/g, ' ').trim().split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !cur) cur = next; else { out.push(cur); cur = word; }
    }
    if (cur) out.push(cur);
    return out;
  };
  const para = (s: string, opts: { font?: PDFFont; size?: number; indent?: number; bullet?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const font = opts.font ?? regular, size = opts.size ?? 10, indent = opts.indent ?? 0, lh = size * 1.45;
    const lines = wrap(s, font, size, W - 2 * M - indent);
    lines.forEach((l, i) => {
      need(lh);
      if (opts.bullet && i === 0) page.drawText('•', { x: M + indent - 11, y: y - size, size, font, color: INK });
      page.drawText(l, { x: M + indent, y: y - size, size, font, color: opts.color ?? INK });
      y -= lh;
    });
    y -= opts.gap ?? 4;
  };

  // header
  page.drawImage(logo, { x: M, y: y - 60, width: 42.5, height: 60 });
  page.drawText(club, { x: M + 56, y: y - 16, size: 10, font: bold, color: MUTED });
  page.drawText('PLAYER CONTRACT', { x: M + 56, y: y - 38, size: 18, font: bold, color: INK });
  page.drawText(`${c.title} · ${day(c.starts_on)} – ${day(c.ends_on)}`, { x: M + 56, y: y - 56, size: 10, font: regular, color: MUTED });
  y -= 84;
  para(`Player: ${player}`, { font: bold, size: 11, gap: 10 });

  // body
  for (const raw of c.body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ')) { y -= 6; need(40); para(line.slice(3), { font: bold, size: 12.5, gap: 6 }); }
    else if (line.startsWith('- ')) para(line.slice(2), { indent: 16, bullet: true, gap: 2 });
    else para(line, { gap: 6 });
  }

  // signatures: the typed name drawn as a signature over a line, then the printed name, the time and a reference
  y -= 14; need(230);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: INK }); y -= 18;
  para('Electronic signatures', { font: bold, size: 12.5, gap: 4 });
  const colW = (W - 2 * M - 28) / 2;
  const col = (x: number, who: string, party: 'player' | 'club', name: string | null, title: string | null, at: string | null, top: number) => {
    page.drawText(who, { x, y: top, size: 8.5, font: bold, color: MUTED });
    const lineY = top - 56;
    if (name && at) {
      // as large as fits the column, handwriting font when the name is in Latin letters
      const font = scriptable(name) ? script : bold;
      let size = font === script ? 30 : 16;
      while (size > 12 && font.widthOfTextAtSize(name, size) > colW) size -= 1;
      page.drawText(name, { x: x + 4, y: lineY + (font === script ? 12 : 8), size, font, color: rgb(0.05, 0.12, 0.35) });
    }
    page.drawLine({ start: { x, y: lineY }, end: { x: x + colW, y: lineY }, thickness: 0.6, color: MUTED });
    page.drawText(name ?? 'Not signed yet', { x, y: lineY - 17, size: 10.5, font: bold, color: name ? INK : MUTED });
    let ly = lineY - 17;
    if (name && title) { ly -= 13; page.drawText(title, { x, y: ly, size: 9.5, font: regular, color: INK }); }
    if (at) {
      page.drawText(`Signed electronically ${when(at)}`, { x, y: ly - 13, size: 8, font: regular, color: MUTED });
      const ref = signatureId(c, party);
      if (ref) page.drawText(`Signature ID ${ref}`, { x, y: ly - 24, size: 8, font: regular, color: MUTED });
    }
  };
  col(M, 'PLAYER', 'player', c.player_signed_name, null, c.player_signed_at, y - 6);
  col(M + colW + 28, `FOR ${club}`.toUpperCase(), 'club', c.club_signed_name, c.club_signed_title ?? null, c.club_signed_at, y - 6);
  y -= 124;
  if (c.status === 'declined') para(`Declined by the player on ${when(c.declined_at)}${c.decline_reason ? `: ${c.decline_reason}` : ''}`, { color: rgb(0.7, 0.1, 0.1) });
  if (c.status === 'cancelled') para(`Cancelled by the club on ${when(c.cancelled_at)}.`, { color: MUTED });
  if (c.terminated_on) para(`Terminated on ${day(c.terminated_on)}${c.termination_reason ? `: ${c.termination_reason}` : ''}`, { color: MUTED });
  if (c.sent_at) para(`Sent to the player on ${when(c.sent_at)}. Each party signed in the Afro Foot Club member app with their own account by typing their name and confirming; the typed name is shown above in a handwriting style. The signature IDs refer to these records.`, { size: 8.5, color: MUTED, gap: 2 });
  if (c.body_sha256) para(`SHA-256 fingerprint of the contract text: ${c.body_sha256}`, { size: 7.5, color: MUTED });
  if (c.status === 'active' || c.status === 'terminated') para('Signed by both parties.', { font: bold, size: 9, color: GREEN });

  // footer on every page: the club's details (wrapped to two lines when long) and the page number
  const foot = wrap(footer.filter(Boolean).join('  ·  '), regular, 7.5, W - 2 * M - 40).slice(0, 2);
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.4, color: MUTED });
    foot.forEach((l, j) => p.drawText(l, { x: M, y: 34 - j * 10, size: 7.5, font: regular, color: MUTED }));
    p.drawText(`${i + 1}/${pages.length}`, { x: W - M - 20, y: 34, size: 8, font: regular, color: MUTED });
  });
  return doc.save();
}
