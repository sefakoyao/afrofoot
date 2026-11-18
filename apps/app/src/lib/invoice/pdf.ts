import 'server-only';
import fontkit from '@pdf-lib/fontkit';
import bwipjs from 'bwip-js/node';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { FONT_BOLD, FONT_REGULAR, LOGO_PNG } from './assets';
import { finnishBarcode, formatIban, formatReference } from './barcode';

/**
 * Membership invoice as a one-page A4 PDF, laid out like the club's existing invoices: logo and payer, invoice details,
 * lines and totals, and the Finnish bank transfer slip (tilisiirto) with reference number and bank barcode.
 * Addition: a QR code and link to the player's own page, where the invoice status is shown.
 */

export interface Billing {
  legal_name: string; street: string; postal_city: string; business_id: string; iban: string; bic: string; bank: string;
  email: string; phone: string; website: string; payment_terms_days: number; late_interest: string;
}
export interface InvoiceData {
  number: string; reference: string; issuedOn: string; dueOn: string | null; amountCents: number; /** 0056: received so far */ paidCents: number; status: string; paidAt: string | null;
  lines: { description: string; date: string | null; quantity: number; unit: string; unitPriceCents: number; vatPercent: number }[];
  payer: { name: string; street?: string | null; postalCity?: string | null };
  playerUrl: string;
}

const W = 595.28, H = 841.89;
const INK = rgb(0.08, 0.08, 0.08), GREY = rgb(0.86, 0.86, 0.86), MUTED = rgb(0.35, 0.35, 0.35), GREEN = rgb(0.16, 0.54, 0.11);
const eur = (cents: number) => `€${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
const fi = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

export async function renderInvoicePdf(billing: Billing, inv: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Invoice ${inv.number}`); doc.setAuthor(billing.legal_name || 'Afro Foot Club'); doc.setCreator('Afro Foot member app');
  const regular = await doc.embedFont(Buffer.from(FONT_REGULAR, 'base64'), { subset: true });
  const bold = await doc.embedFont(Buffer.from(FONT_BOLD, 'base64'), { subset: true });
  const logo = await doc.embedPng(Buffer.from(LOGO_PNG, 'base64'));
  const page = doc.addPage([W, H]);

  // text helpers: positions are measured from the TOP of the page, like the layout they copy
  const text = (s: string, x: number, top: number, size = 8.5, font: PDFFont = regular, opts: { align?: 'left' | 'right' | 'center'; color?: ReturnType<typeof rgb> } = {}) => {
    const clean = s.replace(/[\r\n\t]+/g, ' ');
    const w = font.widthOfTextAtSize(clean, size);
    const dx = opts.align === 'right' ? -w : opts.align === 'center' ? -w / 2 : 0;
    page.drawText(clean, { x: x + dx, y: H - top - size, size, font, color: opts.color ?? INK });
  };
  const line = (x1: number, top1: number, x2: number, top2: number, opts: { width?: number; dash?: boolean } = {}) =>
    page.drawLine({ start: { x: x1, y: H - top1 }, end: { x: x2, y: H - top2 }, thickness: opts.width ?? 0.6, color: INK, dashArray: opts.dash ? [3, 2] : undefined });
  const fit = (s: string, font: PDFFont, size: number, max: number) => { let t = s; while (t.length > 1 && font.widthOfTextAtSize(t, size) > max) t = t.slice(0, -1); return t === s ? s : `${t.slice(0, -1)}…`; };

  // ---------- header ----------
  page.drawImage(logo, { x: 68, y: H - 54 - 60, width: 42.5, height: 60 });
  text(fit(inv.payer.name, bold, 9, 190), 90, 120, 9, bold, { align: 'center' });
  text('INVOICE', 331, 52, 16, bold);
  text('1/1', 570, 54, 8.5, regular, { align: 'right' });
  const terms = Math.max(0, Math.round((Date.parse(`${inv.dueOn ?? inv.issuedOn}T12:00:00Z`) - Date.parse(`${inv.issuedOn}T12:00:00Z`)) / 86_400_000));
  const rows: [string, string][] = [
    ['Invoice number:', inv.number], ['Invoice date:', fi(inv.issuedOn)], ['Payment terms:', `${terms} days`], ['Due date:', fi(inv.dueOn)],
    ['Late payment interest:', `${billing.late_interest || '0.00'}%`], ['Viitenumero (Finland):', formatReference(inv.reference)],
  ];
  rows.forEach(([k, v], i) => { text(k, 331, 82 + i * 16.6, 8.5, bold); text(v, 485, 82 + i * 16.6, 8.5); });
  if (inv.status === 'paid') text(`PAID${inv.paidAt ? ` ${fi(inv.paidAt.slice(0, 10))}` : ''}`, 570, 196, 11, bold, { align: 'right', color: GREEN });

  // ---------- lines ----------
  page.drawRectangle({ x: 29, y: H - 250, width: 541, height: 21, color: GREY });
  const COLS = { desc: 32, date: 260, qty: 305, unit: 345, price: 442, vat: 506, total: 566 };
  text('Description', COLS.desc, 235, 8.5, bold);
  for (const [k, label] of [['date', 'Date'], ['qty', 'Qty'], ['unit', 'Unit'], ['price', 'Unit price'], ['vat', 'VAT %'], ['total', 'Total']] as const) text(label, COLS[k], 235, 8.5, bold, { align: 'right' });
  const step = Math.min(14, 170 / Math.max(1, inv.lines.length));
  let vatCents = 0, netCents = 0;
  inv.lines.forEach((l, i) => {
    const top = 258 + i * step; const total = Math.round(l.quantity * l.unitPriceCents);
    const vat = Math.round(total * l.vatPercent / 100); netCents += total; vatCents += vat;
    text(fit(l.description, regular, 8.5, 200), COLS.desc, top);
    text(fi(l.date), COLS.date, top, 8.5, regular, { align: 'right' });
    text(l.quantity.toFixed(2), COLS.qty, top, 8.5, regular, { align: 'right' });
    text(l.unit, COLS.unit, top, 8.5, regular, { align: 'right' });
    text(eur(l.unitPriceCents), COLS.price, top, 8.5, regular, { align: 'right' });
    text(`${l.vatPercent.toFixed(2)}%`, COLS.vat, top, 8.5, regular, { align: 'right' });
    text(eur(total + vat), COLS.total, top, 8.5, regular, { align: 'right' });
  });
  const tTop = 258 + inv.lines.length * step + 14;
  const vatLabel = inv.lines.every((l) => l.vatPercent === inv.lines[0]?.vatPercent) ? `VAT ${(inv.lines[0]?.vatPercent ?? 0).toFixed(2)}%` : 'VAT';
  text('Total excl. VAT', 418, tTop, 8, bold); text(eur(netCents), 566, tTop, 8, bold, { align: 'right' });
  text(vatLabel, 418, tTop + 12, 8, bold); text(eur(vatCents), 566, tTop + 12, 8, bold, { align: 'right' });
  line(415, tTop + 25, 570, tTop + 25);
  // 0056: after a part payment the invoice shows what was received and what is still due; the slip and barcode use the rest
  const dueCents = inv.status === 'paid' ? 0 : inv.amountCents - inv.paidCents;
  const partly = inv.status !== 'paid' && inv.paidCents > 0;
  if (partly) {
    text('Invoice total', 418, tTop + 30, 9, bold); text(eur(inv.amountCents), 566, tTop + 30, 9, bold, { align: 'right' });
    text('Paid so far', 418, tTop + 43, 9, regular, { color: GREEN }); text(`− ${eur(inv.paidCents)}`, 566, tTop + 43, 9, regular, { align: 'right', color: GREEN });
    line(415, tTop + 56, 570, tTop + 56);
    text('Amount still due', 418, tTop + 61, 10, bold); text(eur(dueCents), 566, tTop + 61, 10, bold, { align: 'right' });
  } else {
    text('Total amount due', 418, tTop + 30, 10, bold); text(eur(inv.amountCents), 566, tTop + 30, 10, bold, { align: 'right' });
  }

  // ---------- bank transfer slip ----------
  line(29, 499, 570, 499);
  const band: [string, string, string, string][] = [
    ['Company', billing.legal_name, 'Tel.', billing.phone],
    ['Address', [billing.street, billing.postal_city].filter(Boolean).join(', '), 'E-mail', billing.email],
    ['Company number', billing.business_id, 'www', billing.website.replace(/^https?:\/\//, '')],
  ];
  band.forEach(([k1, v1, k2, v2], i) => { text(k1, 29, 507 + i * 14, 6.5); text(fit(v1, regular, 6.5, 220), 158, 507 + i * 14, 6.5); text(k2, 389, 507 + i * 14, 6.5); text(v2, 435, 507 + i * 14, 6.5); });
  line(29, 551, 570, 551, { dash: true, width: 0.9 });
  line(85, 551, 85, 773); line(346, 551, 346, 773);
  const label = (s: string, top: number) => s.split('\n').forEach((part, i) => text(part, 82, top + i * 7.5, 6.5, regular, { align: 'right' }));
  // recipient's account
  label("Recipient's\naccount\nnumber", 555);
  text('IBAN', 89, 556, 7); text(formatIban(billing.iban), 89, 568, 9);
  text('SWIFT/BIC', 350, 556, 7); text(billing.bic, 350, 568, 9);
  line(29, 599, 570, 599);
  // recipient
  label('Recipient', 603);
  [billing.legal_name, billing.street, billing.postal_city].filter(Boolean).forEach((s, i) => text(fit(s, regular, 9, 250), 89, 604 + i * 13, 9));
  line(29, 647, 346, 647);
  // payer
  label("Payer's name\nand address", 651);
  [inv.payer.name, inv.payer.street, inv.payer.postalCity].filter((s): s is string => !!s).forEach((s, i) => text(fit(s, regular, 9, 250), 89, 652 + i * 13, 9));
  // link to the player's page (the empty box of the slip)
  const qr = await bwipjs.toBuffer({ bcid: 'qrcode', text: inv.playerUrl, scale: 4 }); // error correction M (the default)
  page.drawImage(await doc.embedPng(qr), { x: 352, y: H - 606 - 72, width: 72, height: 72 });
  text('Your invoices and payment status:', 432, 612, 7.5, bold);
  const url = inv.playerUrl.replace(/^https?:\/\//, '');
  (url.match(/.{1,30}/g) ?? [url]).forEach((part, i) => text(part, 432, 624 + i * 10, 7.5, regular, { color: GREEN }));
  text('Pay by bank transfer with the', 432, 650, 7, regular, { color: MUTED });
  text('reference number below.', 432, 659, 7, regular, { color: MUTED });
  // signature, reference, due date, total
  line(346, 725, 570, 725);
  label('Signature', 728); line(89, 737, 340, 737);
  text('Ref. No.', 349, 729, 6.5); line(389, 725, 389, 749); text(formatReference(inv.reference), 393, 733, 9);
  line(29, 749, 570, 749);
  label('From account\nno.', 752);
  text('Due Date', 349, 752, 6.5); line(389, 749, 389, 773); text(fi(inv.dueOn), 393, 757, 9);
  line(472, 749, 472, 773); text('Total', 475, 752, 6.5); text(eur(partly ? dueCents : inv.amountCents), 566, 757, 9, regular, { align: 'right' });
  line(29, 773, 570, 773);
  // bank barcode (only for Finnish IBANs and amounts below one million euros)
  const code = finnishBarcode(billing.iban, partly ? dueCents : inv.amountCents, inv.reference, inv.dueOn);
  if (code) {
    text(code, 194, 776, 7.5, regular, { align: 'center' });
    // all digits, even length: the encoder picks code set C, as the bank barcode standard requires
    const png = await bwipjs.toBuffer({ bcid: 'code128', text: code, scale: 3, height: 14, includetext: false, paddingwidth: 10 });
    const img = await doc.embedPng(png);
    const width = 312, height = 34;   // ends ~7 mm above the paper edge so office printers do not cut the bars
    page.drawImage(img, { x: 194 - width / 2, y: H - 787 - height, width, height });
  }
  ['The payment will be cleared for the recipient in accordance with the', 'General terms for payment transmission and only on the basis of the', 'account number given by the payer.']
    .forEach((s, i) => text(s, 371, 783 + i * 8, 6));
  return doc.save();
}
