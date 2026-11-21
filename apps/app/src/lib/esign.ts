import 'server-only';
import { createHash } from 'node:crypto';
import type { Contract } from './contracts';

/**
 * A short reference for one party's electronic signature, shown under the signature on the page and in the PDF:
 * derived from the contract, the party, the typed name, the time and the fingerprint of the signed text, so it changes
 * if any of them would. It is a reference for the record (audit log), not a cryptographic signature.
 */
export function signatureId(c: Pick<Contract, 'id' | 'body_sha256' | 'player_signed_name' | 'player_signed_at' | 'club_signed_name' | 'club_signed_at' | 'guardian_signed_name' | 'guardian_signed_at'>, party: 'player' | 'club' | 'guardian'): string | null {
  const name = party === 'player' ? c.player_signed_name : party === 'club' ? c.club_signed_name : c.guardian_signed_name ?? null;
  const at = party === 'player' ? c.player_signed_at : party === 'club' ? c.club_signed_at : c.guardian_signed_at ?? null;
  if (!name || !at) return null;
  const hex = createHash('sha256').update([c.id, party, name, new Date(at).toISOString(), c.body_sha256 ?? ''].join('|')).digest('hex').slice(0, 12).toUpperCase();
  return `AF-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}
