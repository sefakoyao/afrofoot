import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Contract } from './contracts';
import { signatureId } from './esign';
import { scriptable } from './esign-script';
import { FONT_BOLD, FONT_REGULAR, LOGO_PNG } from './invoice/assets';
import { FONT_SIGNATURE } from './signature-font';

/**
 * Player contract as an A4 PDF, laid out to fit on two pages: a compact header (logo, club, title) with a facts box
 * (player, term, length, contract number), the text ("## " headings, "- " bullets), then both electronic signatures
 * (the typed name drawn in a handwriting font, the printed name and title, time in Helsinki and a signature
 * reference) and the SHA-256 fingerprint of the signed text. A footer with the club's details is on every page.
 * The text size steps down from 10 to 8.5 pt until everything fits on two pages; a longer text keeps 8.5 pt and runs on.
 */
const W = 595.28, H = 841.89, M = 50, TOP = 44, BOTTOM = 60;
const INK = rgb(0.08, 0.08, 0.08), MUTED = rgb(0.38, 0.38, 0.38), GREEN = rgb(0.16, 0.54, 0.11), BRAND = rgb(0.239, 0.686, 0.173);
const PANEL = rgb(0.955, 0.953, 0.937), SIGN_INK = rgb(0.05, 0.12, 0.35);
const SIZES = [10, 9.5, 9, 8.5] as const;
const when = (iso: string | null) => (iso ? `${new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Helsinki' })} (Helsinki)` : '');
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** `footer`: the club's details printed at the bottom of every page (name, address, business ID, contacts). */
export async function renderContractPdf(c: Contract, player: string, club: string, footer: string[] = []): Promise<Uint8Array> {
  let last: { doc: PDFDocument; pages: number } | null = null;
  for (const size of SIZES) {
    last = await layout(c, player, club, footer, size);
    if (last.pages <= 2) break;
  }
  return last!.doc.save();
}

async function layout(c: Contract, player: string, club: string, footer: string[], size: number): Promise<{ doc: PDFDocument; pages: number }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${c.title} – ${player}`); doc.setAuthor(club); doc.setCreator('Afro Foot member app');
  const regular = await doc.embedFont(Buffer.from(FONT_REGULAR, 'base64'), { subset: true });
  const bold = await doc.embedFont(Buffer.from(FONT_BOLD, 'base64'), { subset: true });
  const script = await doc.embedFont(Buffer.from(FONT_SIGNATURE, 'base64'), { subset: true });
  const logo = await doc.embedPng(Buffer.from(LOGO_PNG, 'base64'));

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - TOP; // baseline cursor from the bottom, like pdf-lib
  const pages: PDFPage[] = [page];
  const newPage = () => { page = doc.addPage([W, H]); pages.push(page); y = H - TOP; };
  const need = (h: number) => { if (y - h < BOTTOM) newPage(); };
  const wrap = (s: string, font: PDFFont, sz: number, width: number) => {
    const out: string[] = []; let cur = '';
    for (const word of s.replace(/\s+/g, ' ').trim().split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, sz) <= width || !cur) cur = next; else { out.push(cur); cur = word; }
    }
    if (cur) out.push(cur);
    return out;
  };
  const para = (s: string, opts: { font?: PDFFont; size?: number; indent?: number; bullet?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const font = opts.font ?? regular, sz = opts.size ?? size, indent = opts.indent ?? 0, lh = sz * 1.38;
    const lines = wrap(s, font, sz, W - 2 * M - indent);
    lines.forEach((l, i) => {
      need(lh);
      if (opts.bullet && i === 0) page.drawText('•', { x: M + indent - 10, y: y - sz, size: sz, font, color: BRAND });
      page.drawText(l, { x: M + indent, y: y - sz, size: sz, font, color: opts.color ?? INK });
      y -= lh;
    });
    y -= opts.gap ?? 3;
  };

  // header: logo, club, title; a green rule
  page.drawImage(logo, { x: M, y: y - 48, width: 34, height: 48 });
  page.drawText(club, { x: M + 46, y: y - 13, size: 9, font: bold, color: MUTED });
  page.drawText('PLAYER CONTRACT', { x: M + 46, y: y - 32, size: 16, font: bold, color: INK });
  page.drawText(c.title, { x: M + 46, y: y - 46, size: 9, font: regular, color: MUTED });
  y -= 58;
  page.drawRectangle({ x: M, y, width: W - 2 * M, height: 1.6, color: BRAND });
  y -= 10;
  // facts box: player, term, length, contract number
  const facts: [string, string][] = [['PLAYER', player], ['TERM', `${day(c.starts_on)} – ${day(c.ends_on)}`], ['LENGTH', c.years === 1 ? '1 season' : `${c.years} seasons`], ['CONTRACT NO.', c.id.slice(0, 8).toUpperCase()]];
  const widths = [0.3, 0.38, 0.14, 0.18].map((f) => f * (W - 2 * M - 20));
  page.drawRectangle({ x: M, y: y - 36, width: W - 2 * M, height: 36, color: PANEL });
  let fx = M + 10;
  facts.forEach(([k, v], i) => {
    page.drawText(k, { x: fx, y: y - 13, size: 6.5, font: bold, color: MUTED });
    let vs = 9.5; while (vs > 7 && bold.widthOfTextAtSize(v, vs) > widths[i]! - 6) vs -= 0.5;
    page.drawText(v, { x: fx, y: y - 27, size: vs, font: bold, color: INK });
    fx += widths[i]!;
  });
  y -= 48;

  // body
  for (const raw of c.body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ')) { y -= size * 0.4; need(size * 4); para(line.slice(3), { font: bold, size: size + 1.5, gap: 2.5 }); }
    else if (line.startsWith('- ')) para(line.slice(2), { indent: 14, bullet: true, gap: 1 });
    else para(line, { gap: size * 0.4 });
  }

  // signatures: kept together; the typed name drawn as a signature over a line, then name, title, time, reference
  const sigH = 150 + (c.sent_at ? 30 : 0) + (c.is_minor ? 110 : 0);
  y -= 8; need(sigH);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: INK }); y -= 12;
  para('Electronic signatures', { font: bold, size: 11, gap: 8 });
  const colW = (W - 2 * M - 28) / 2;
  const col = (x: number, who: string, party: 'player' | 'club' | 'guardian', name: string | null, title: string | null, at: string | null, top: number) => {
    page.drawText(who, { x, y: top, size: 7.5, font: bold, color: MUTED });
    const lineY = top - 44;
    if (name && at) {
      // as large as fits the column, handwriting font when the name is in Latin letters
      const font = scriptable(name) ? script : bold;
      let sz = font === script ? 26 : 14;
      while (sz > 12 && font.widthOfTextAtSize(name, sz) > colW) sz -= 1;
      page.drawText(name, { x: x + 4, y: lineY + (font === script ? 10 : 7), size: sz, font, color: SIGN_INK });
    }
    page.drawLine({ start: { x, y: lineY }, end: { x: x + colW, y: lineY }, thickness: 0.6, color: MUTED });
    let ly = lineY - 14;
    page.drawText(name ?? 'Not signed yet', { x, y: ly, size: 9.5, font: bold, color: name ? INK : MUTED });
    if (name && title) { ly -= 11; page.drawText(title, { x, y: ly, size: 8.5, font: regular, color: INK }); }
    if (at) {
      page.drawText(`Signed electronically ${when(at)}`, { x, y: ly - 11, size: 7.5, font: regular, color: MUTED });
      const ref = signatureId(c, party);
      if (ref) page.drawText(`Signature ID ${ref}`, { x, y: ly - 21, size: 7.5, font: regular, color: MUTED });
    }
  };
  col(M, 'PLAYER', 'player', c.player_signed_name, null, c.player_signed_at, y - 4);
  col(M + colW + 28, `FOR ${club}`.toUpperCase(), 'club', c.club_signed_name, c.club_signed_title ?? null, c.club_signed_at, y - 4);
  y -= 100;
  // 0068: a player under 18 signed together with a parent or guardian (name, relation and contact under the signature)
  if (c.is_minor) {
    const rel = c.guardian_relation ? c.guardian_relation[0]!.toUpperCase() + c.guardian_relation.slice(1) : null;
    col(M, 'PARENT OR GUARDIAN (THE PLAYER IS UNDER 18)', 'guardian', c.guardian_signed_name ?? null, rel, c.guardian_signed_at ?? null, y - 4);
    const contact = [c.guardian_phone, c.guardian_email].filter(Boolean).join('  ·  ');
    if (contact) page.drawText(contact, { x: M + colW + 28, y: y - 62, size: 8.5, font: regular, color: INK });
    y -= 100;
  }
  if (c.status === 'declined') para(`Declined by the player on ${when(c.declined_at)}${c.decline_reason ? `: ${c.decline_reason}` : ''}`, { color: rgb(0.7, 0.1, 0.1) });
  if (c.status === 'cancelled') para(`Cancelled by the club on ${when(c.cancelled_at)}.`, { color: MUTED });
  if (c.terminated_on) para(`Terminated on ${day(c.terminated_on)}${c.termination_reason ? `: ${c.termination_reason}` : ''}`, { color: MUTED });
  if (c.sent_at) para(`Sent to the player on ${when(c.sent_at)}. Each party signed in the Afro Foot Club member app with their own account by typing their name and confirming; the typed name is shown above in a handwriting style. ${c.is_minor ? ' The player is under 18: their parent or guardian signed together with them, in the player\'s account, by typing their own name.' : ''} The signature IDs refer to these records.`, { size: 7.5, color: MUTED, gap: 1 });
  if (c.body_sha256) para(`SHA-256 fingerprint of the contract text: ${c.body_sha256}`, { size: 7, color: MUTED, gap: 2 });
  if (c.status === 'active' || c.status === 'terminated') para('Signed by both parties.', { font: bold, size: 8.5, color: GREEN });

  // footer on every page: the club's details (wrapped to two lines when long) and the page number
  const foot = wrap(footer.filter(Boolean).join('  ·  '), regular, 7, W - 2 * M - 40).slice(0, 2);
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 44 }, end: { x: W - M, y: 44 }, thickness: 0.4, color: MUTED });
    foot.forEach((l, j) => p.drawText(l, { x: M, y: 33 - j * 9, size: 7, font: regular, color: MUTED }));
    p.drawText(`${i + 1}/${pages.length}`, { x: W - M - 18, y: 33, size: 7.5, font: regular, color: MUTED });
  });
  return { doc, pages: pages.length };
}
