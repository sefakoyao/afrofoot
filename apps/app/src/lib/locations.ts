import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Google Maps search link for a place: used when no share link was pasted, and as a fallback when showing a place. */
export function googleMapsSearch(parts: (string | null | undefined)[]): string | null {
  const q = parts.map((p) => p?.trim()).filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** The place's own map link, or a Google Maps search built from its name, address and city. */
export const mapsLinkFor = (l: { name: string; address?: string | null; city?: string | null; maps_url?: string | null }): string | null =>
  l.maps_url && /^https:\/\//.test(l.maps_url) ? l.maps_url : googleMapsSearch([l.name, l.address, l.city]);

// Mirrors the locations table (migrations 0002, 0015): maps_url https only, at most 500 characters.
const newPlace = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(200).transform((v) => v || null),
  city: z.string().trim().max(80).transform((v) => v || null),
  maps_url: z.union([z.literal(''), z.string().trim().url().max(500).regex(/^https:\/\/\S+$/)]).transform((v) => v || null),
});

/**
 * The place chosen in an event form: '' (none), a saved place's id, or 'new' with the loc_* fields, in which case the
 * place is saved first (as the signed-in coach or admin; RLS: coach_insert / admin_all). A place that already exists
 * (same name and city) is reused. Returns the id, null, or an error key ('e_location').
 */
export async function resolveLocation(supabase: SupabaseClient, fd: FormData, memberId: string): Promise<{ id: string | null } | { error: 'e_location' }> {
  const choice = String(fd.get('location_id') ?? '');
  if (choice === '') return { id: null };
  if (choice !== 'new') return z.string().uuid().safeParse(choice).success ? { id: choice } : { error: 'e_location' };
  const p = newPlace.safeParse({ name: fd.get('loc_name') ?? '', address: fd.get('loc_address') ?? '', city: fd.get('loc_city') ?? '', maps_url: fd.get('loc_maps') ?? '' });
  if (!p.success) return { error: 'e_location' };
  const row = { ...p.data, maps_url: p.data.maps_url ?? googleMapsSearch([p.data.name, p.data.address, p.data.city]), created_by: memberId };
  const { data, error } = await supabase.from('locations').insert(row).select('id').single();
  if (!error && data) return { id: data.id };
  if (error?.code === '23505') { // already saved: use that one
    const { data: same } = await supabase.from('locations').select('id, name, city').ilike('name', p.data.name);
    const hit = (same ?? []).find((l) => (l.city ?? '').toLowerCase() === (p.data.city ?? '').toLowerCase());
    if (hit) return { id: hit.id };
  }
  console.error('[locations] save refused', { code: error?.code, message: error?.message });
  return { error: 'e_location' };
}

/** Meeting time (HH:MM, optional) on the same day as the start: before it, at most 6 hours earlier (database check). */
export function meetingTime(meet: string, start: string): 'ok' | 'none' | 'bad' {
  if (!meet) return 'none';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(meet)) return 'bad';
  const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const d = mins(start) - mins(meet);
  return d >= 0 && d <= 360 ? 'ok' : 'bad';
}
