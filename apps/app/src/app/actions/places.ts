'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isAdminRole } from '@afrofoot/db';
import { requireMember } from '@/lib/auth';
import { googleMapsSearch } from '@/lib/locations';
import { PLACE_FIELDS, placeSchema } from '@/lib/places';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Saved places page (migration 0039). Coaches and admins add and edit places; only admins hide, show and delete them.
 * RLS (coach_insert, coach_update, admin_all) and the guard_locations trigger enforce the same; these checks give a clear
 * message first. Results: ?result=<key under places.*>.
 */
const uuid = z.string().uuid();

function back(fd: FormData, result: string, id?: string): never {
  const area = String(fd.get('area') ?? '') === 'admin' ? '/admin/places' : '/coach/places';
  // The place goes in the query, not a #hash: Next drops the hash on a server-action redirect. The page scrolls to it.
  redirect(`${area}?result=${result}${id ? `&place=${id}` : ''}`);
}
const refresh = () => { revalidatePath('/coach', 'layout'); revalidatePath('/admin', 'layout'); revalidatePath('/me', 'layout'); };

async function writer(fd: FormData, adminOnly = false) {
  const member = await requireMember();
  const supabase = await getSupabase();
  if (!supabase) back(fd, 'r_error');
  const admin = isAdminRole(member.role);
  if (!(admin || (!adminOnly && member.role === 'coach'))) back(fd, 'r_notAllowed');
  return { member, supabase };
}

/** Add a place (no id) or save changes to one (id). */
export async function savePlace(fd: FormData): Promise<void> {
  const raw = String(fd.get('id') ?? '');
  const id = raw ? (uuid.safeParse(raw).success ? raw : back(fd, 'r_invalid')) : null;
  const p = placeSchema.safeParse(Object.fromEntries(PLACE_FIELDS.map((k) => [k, fd.get(k) ?? ''])));
  if (!p.success) back(fd, 'r_invalid', id ?? undefined);
  const { member, supabase } = await writer(fd);
  const row = { ...p.data, maps_url: p.data.maps_url ?? googleMapsSearch([p.data.name, p.data.address, p.data.postal_code, p.data.city]) };
  const { data, error } = id
    ? await supabase.from('locations').update(row).eq('id', id).select('id')
    : await supabase.from('locations').insert({ ...row, created_by: member.id }).select('id');
  const savedId = data?.[0]?.id;
  if (error || !savedId) {
    if (error) console.error('[places] save refused', { code: error.code, message: error.message });
    // no error but no row: RLS let nothing through (not allowed)
    back(fd, error?.code === '23505' ? 'r_duplicate' : error?.code === '23514' ? 'r_invalid' : !error || error.code === '42501' ? 'r_notAllowed' : 'r_error', id ?? undefined);
  }
  refresh();
  back(fd, id ? 'r_saved' : 'r_created', savedId);
}

/** Hide a place from event forms, or show it again (admins). */
export async function setPlaceActive(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) back(fd, 'r_invalid');
  const active = fd.get('active') === 'true';
  const { supabase } = await writer(fd, true);
  const { data, error } = await supabase.from('locations').update({ active }).eq('id', id.data).select('id');
  if (error || !data?.length) { if (error) console.error('[places] hide/show refused', { code: error.code, message: error.message }); back(fd, 'r_notAllowed', id.data); }
  refresh();
  back(fd, active ? 'r_shown' : 'r_hidden', id.data);
}

/** Delete a place that no training, schedule, game or event uses (admins; the database refuses otherwise). */
export async function deletePlace(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('id'));
  if (!id.success) back(fd, 'r_invalid');
  const { supabase } = await writer(fd, true);
  const { data, error } = await supabase.from('locations').delete().eq('id', id.data).select('id');
  if (error?.code === '23503') back(fd, 'r_inUse', id.data);
  if (error || !data?.length) { if (error) console.error('[places] delete refused', { code: error.code, message: error.message }); back(fd, 'r_notAllowed', id.data); }
  refresh();
  back(fd, 'r_deleted');
}
