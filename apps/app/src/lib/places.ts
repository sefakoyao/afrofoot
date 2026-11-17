import 'server-only';
import { z } from 'zod';

/** Place types (locations.kind, migration 0015). */
export const PLACE_KINDS = ['pitch', 'hall', 'gym', 'field', 'other'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

/** Every column the Places page shows and edits. */
export const PLACE_COLUMNS = 'id, name, kind, address, postal_code, city, maps_url, directions, transit, parking, notes, active, created_by';
export type PlaceRow = {
  id: string; name: string; kind: PlaceKind; address: string | null; postal_code: string | null; city: string | null; maps_url: string | null;
  directions: string | null; transit: string | null; parking: string | null; notes: string | null; active: boolean; created_by: string | null;
};

const opt = (max: number) => z.string().trim().max(max).transform((v) => v || null);

/** The place form. Mirrors the locations table's checks (migrations 0002, 0015, 0039). */
export const placeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(PLACE_KINDS),
  address: opt(200),
  postal_code: opt(12),
  city: opt(80),
  maps_url: z.union([z.literal(''), z.string().trim().url().max(500).regex(/^https:\/\/\S+$/)]).transform((v) => v || null),
  directions: opt(1500),
  transit: opt(500),
  parking: opt(500),
  notes: opt(500),
});
export const PLACE_FIELDS = ['name', 'kind', 'address', 'postal_code', 'city', 'maps_url', 'directions', 'transit', 'parking', 'notes'] as const;
