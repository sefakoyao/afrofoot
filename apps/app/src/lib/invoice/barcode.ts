/**
 * Finnish bank barcode ("pankkiviivakoodi"), version 4 (national reference number), 54 digits, printed as Code 128 C:
 *   4 · IBAN digits without "FI" (16) · euros (6) · cents (2) · 000 · reference number (20, zero-padded) · due date YYMMDD
 * Returns null when it cannot be printed: not a Finnish IBAN, reference not numeric, or amount of a million euros or more.
 */
export function finnishBarcode(iban: string, amountCents: number, reference: string, dueOn: string | null): string | null {
  const compact = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^FI\d{16}$/.test(compact) || !ibanValid(compact)) return null;
  const ref = reference.replace(/\s+/g, '');
  if (!/^\d{4,20}$/.test(ref) || !Number.isInteger(amountCents) || amountCents < 0 || amountCents > 99_999_999) return null;
  const euros = Math.floor(amountCents / 100).toString().padStart(6, '0');
  const cents = (amountCents % 100).toString().padStart(2, '0');
  const due = dueOn && /^\d{4}-\d{2}-\d{2}$/.test(dueOn) ? dueOn.slice(2, 4) + dueOn.slice(5, 7) + dueOn.slice(8, 10) : '000000';
  return `4${compact.slice(2)}${euros}${cents}000${ref.padStart(20, '0')}${due}`;
}

/** IBAN check (ISO 13616 mod 97). */
export function ibanValid(iban: string): boolean {
  const s = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const moved = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let r = 0;
  for (const ch of moved) r = (r * 10 + Number(ch)) % 97;
  return r === 1;
}

/** Finnish reference number check digit (weights 7, 3, 1 from the right), same rule as app.finnish_reference in the database. */
export function finnishReferenceValid(ref: string): boolean {
  const s = ref.replace(/\s+/g, '');
  if (!/^\d{4,20}$/.test(s)) return false;
  const body = s.slice(0, -1).split('').reverse();
  const sum = body.reduce((a, d, i) => a + Number(d) * [7, 3, 1][i % 3]!, 0);
  return (10 - (sum % 10)) % 10 === Number(s.at(-1));
}

/** "FI2112345600000785" → "FI21 1234 5600 0007 85" */
export const formatIban = (iban: string) => iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
/** Reference numbers are printed in groups of five from the right. */
export const formatReference = (ref: string) => ref.replace(/\s+/g, '').replace(/\B(?=(\d{5})+(?!\d))/g, ' ');
