'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';

/**
 * Seasons, teams and rosters (admin only). Every write runs as the signed-in admin, so RLS (admin_all) applies and the
 * audit trigger records it. Validation mirrors the tables in migration 0002. Results come back as ?result=<key under teams.*>.
 */

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'r_invalid');
const STAFF_TYPES = ['head_coach', 'assistant_coach', 'goalkeeper_coach', 'manager', 'physio', 'analyst', 'other'] as const;
const POSITIONS = ['goalkeeper', 'defender', 'midfielder', 'forward'] as const;

function back(fd: FormData, result: string): never {
  const raw = String(fd.get('back') ?? '');
  const url = new URL(raw.startsWith('/admin/teams') ? raw : '/admin/teams', 'http://x');
  url.searchParams.set('result', result);
  redirect(url.pathname + url.search);
}

async function db(fd: FormData): Promise<SupabaseClient> {
  await requireArea('admin');
  const supabase = await getSupabase();
  if (!supabase) back(fd, 'r_error');
  return supabase;
}

function fail(fd: FormData, where: string, error: { code?: string; message?: string }): never {
  console.error(`[teams] ${where} refused`, { code: error.code, message: error.message });
  back(fd, error.code === '23505' ? 'r_duplicate' : error.code === '42501' ? 'r_notAllowed' : error.code === '23514' ? 'r_invalid' : 'r_error');
}

const done = (fd: FormData, result: string): never => { revalidatePath('/admin', 'layout'); revalidatePath('/me', 'layout'); back(fd, result); };

/** "Afro Foot A" → "afro-foot-a" (teams.slug check: ^[a-z0-9-]+$). */
const slugify = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'team';

// ---------- seasons ----------

const seasonSchema = z.object({
  name: z.string().trim().min(2, 'r_name').max(60, 'r_name'),
  starts_on: isoDate, ends_on: isoDate, current: z.literal('on').optional(),
}).refine((v) => v.ends_on > v.starts_on, { message: 'r_dates' });

export async function createSeason(fd: FormData): Promise<void> {
  const p = seasonSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, p.error.issues[0]?.message ?? 'r_invalid');
  const supabase = await db(fd);
  const { data, error } = await supabase.from('seasons').insert({ name: p.data.name, starts_on: p.data.starts_on, ends_on: p.data.ends_on }).select('id').single();
  if (error) fail(fd, 'create season', error);
  if (p.data.current) await makeCurrent(fd, supabase, data.id);
  done(fd, 'r_seasonCreated');
}

/** One current season at a time (unique index seasons_one_current): clear the old one first. */
async function makeCurrent(fd: FormData, supabase: SupabaseClient, id: string) {
  const a = await supabase.from('seasons').update({ is_current: false }).eq('is_current', true).neq('id', id);
  if (a.error) fail(fd, 'clear current season', a.error);
  const b = await supabase.from('seasons').update({ is_current: true }).eq('id', id);
  if (b.error) fail(fd, 'set current season', b.error);
}

export async function setCurrentSeason(fd: FormData): Promise<void> {
  const id = uuid.safeParse(fd.get('season_id'));
  if (!id.success) back(fd, 'r_invalid');
  await makeCurrent(fd, await db(fd), id.data);
  done(fd, 'r_currentSet');
}

// ---------- teams ----------

const teamSchema = z.object({
  name: z.string().trim().min(2, 'r_name').max(80, 'r_name'),
  category: z.enum(['senior', 'women', 'junior', 'veterans', 'other']),
  season_id: uuid, division: z.string().trim().max(80, 'r_invalid').transform((v) => v || null),
});

/** Creates the team (or reuses one with the same name) and enters it into the chosen season. */
export async function createTeam(fd: FormData): Promise<void> {
  const p = teamSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, p.error.issues[0]?.message ?? 'r_invalid');
  const supabase = await db(fd);
  let { data: team } = await supabase.from('teams').select('id').eq('name', p.data.name).maybeSingle();
  if (!team) {
    const r = await supabase.from('teams').insert({ name: p.data.name, slug: slugify(p.data.name), category: p.data.category }).select('id').single();
    if (r.error) fail(fd, 'create team', r.error);
    team = r.data;
  }
  const { data: ts, error } = await supabase.from('team_seasons').insert({ team_id: team.id, season_id: p.data.season_id, division: p.data.division }).select('id').single();
  if (error) fail(fd, 'add team to season', error);
  revalidatePath('/admin', 'layout');
  redirect(`/admin/teams/${ts.id}?result=r_teamCreated`);
}

// ---------- roster ----------

/**
 * `who` is either "player:<players.id>" or "profile:<profiles.id>" for a member with the player role who has no player
 * record yet (approving a member does not create one); the record is created from their profile name.
 */
const addPlayerSchema = z.object({
  team_season_id: uuid, who: z.string().regex(/^(player|profile):[0-9a-f-]{36}$/, 'r_invalid'),
  jersey_number: z.string().trim().refine((v) => v === '' || (/^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 99), 'r_shirt')
    .transform((v) => (v === '' ? null : Number(v))),
});

async function shirtTaken(supabase: SupabaseClient, teamSeasonId: string, shirt: number | null, exceptRow?: string) {
  if (shirt === null) return false;
  let q = supabase.from('team_players').select('id').eq('team_season_id', teamSeasonId).eq('jersey_number', shirt).is('left_on', null);
  if (exceptRow) q = q.neq('id', exceptRow);
  const { data } = await q;
  return (data ?? []).length > 0;
}

export async function addPlayer(fd: FormData): Promise<void> {
  const p = addPlayerSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, p.error.issues[0]?.message ?? 'r_invalid');
  const supabase = await db(fd);
  if (await shirtTaken(supabase, p.data.team_season_id, p.data.jersey_number)) back(fd, 'r_shirtTaken');

  const [kind, id] = p.data.who.split(':') as ['player' | 'profile', string];
  let playerId = id;
  if (kind === 'profile') {
    const { data: prof } = await supabase.from('profiles').select('id, first_name, last_name, role').eq('id', id).maybeSingle();
    if (!prof || prof.role !== 'player') back(fd, 'r_invalid');
    if (!prof.first_name || !prof.last_name) back(fd, 'r_noName');
    const { data: existing } = await supabase.from('players').select('id').eq('profile_id', id).maybeSingle();
    if (existing) playerId = existing.id;
    else {
      const r = await supabase.from('players').insert({ profile_id: id, first_name: prof.first_name, last_name: prof.last_name, status: 'active', joined_on: new Date().toISOString().slice(0, 10) }).select('id').single();
      if (r.error) fail(fd, 'create player record', r.error);
      playerId = r.data.id;
    }
  }
  // Re-joining after leaving: reopen the existing row (unique team_season_id + player_id).
  const { data: row } = await supabase.from('team_players').select('id').eq('team_season_id', p.data.team_season_id).eq('player_id', playerId).maybeSingle();
  const { error } = row
    ? await supabase.from('team_players').update({ left_on: null, jersey_number: p.data.jersey_number, joined_on: new Date().toISOString().slice(0, 10) }).eq('id', row.id)
    : await supabase.from('team_players').insert({ team_season_id: p.data.team_season_id, player_id: playerId, jersey_number: p.data.jersey_number, joined_on: new Date().toISOString().slice(0, 10) });
  if (error) fail(fd, 'add player', error);
  done(fd, 'r_playerAdded');
}

const rosterSchema = z.object({
  row_id: uuid, player_id: uuid, team_season_id: uuid,
  jersey_number: addPlayerSchema.shape.jersey_number,
  position: z.enum(['', ...POSITIONS]).transform((v) => v || null),
  captain: z.literal('on').optional(),
});

/** Shirt number and captaincy (team_players) and position (players; admins and coaches may change it). */
export async function updateRosterEntry(fd: FormData): Promise<void> {
  const p = rosterSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, p.error.issues[0]?.message ?? 'r_invalid');
  const supabase = await db(fd);
  if (await shirtTaken(supabase, p.data.team_season_id, p.data.jersey_number, p.data.row_id)) back(fd, 'r_shirtTaken');
  if (p.data.captain) { // one captain per team
    const c = await supabase.from('team_players').update({ captain: false }).eq('team_season_id', p.data.team_season_id).eq('captain', true).neq('id', p.data.row_id);
    if (c.error) fail(fd, 'clear captain', c.error);
  }
  const a = await supabase.from('team_players').update({ jersey_number: p.data.jersey_number, captain: !!p.data.captain }).eq('id', p.data.row_id).eq('team_season_id', p.data.team_season_id);
  if (a.error) fail(fd, 'update roster', a.error);
  const b = await supabase.from('players').update({ position: p.data.position }).eq('id', p.data.player_id);
  if (b.error) fail(fd, 'update position', b.error);
  done(fd, 'r_saved');
}

/** Leaving keeps the history (stats, attendance): the row gets a leave date instead of being deleted. */
export async function removePlayer(fd: FormData): Promise<void> {
  const p = z.object({ row_id: uuid, team_season_id: uuid }).safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, 'r_invalid');
  const supabase = await db(fd);
  const { error } = await supabase.from('team_players').update({ left_on: new Date().toISOString().slice(0, 10), captain: false })
    .eq('id', p.data.row_id).eq('team_season_id', p.data.team_season_id);
  if (error) fail(fd, 'remove player', error);
  done(fd, 'r_playerRemoved');
}

// ---------- coaches and staff ----------

const addCoachSchema = z.object({
  team_season_id: uuid, profile_id: uuid, type: z.enum(STAFF_TYPES),
  role_label: z.string().trim().max(60, 'r_invalid').transform((v) => v || null),
});

/** Assigns a member with the coach role to the team. A staff record is created from their profile when needed. */
export async function addCoach(fd: FormData): Promise<void> {
  const p = addCoachSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, p.error.issues[0]?.message ?? 'r_invalid');
  const supabase = await db(fd);
  const { data: prof } = await supabase.from('profiles').select('id, first_name, last_name, role, status').eq('id', p.data.profile_id).maybeSingle();
  if (!prof || prof.role !== 'coach') back(fd, 'r_invalid');
  if (!prof.first_name || !prof.last_name) back(fd, 'r_noName');
  let { data: staff } = await supabase.from('staff_members').select('id').eq('profile_id', prof.id).maybeSingle();
  if (!staff) {
    const r = await supabase.from('staff_members').insert({ profile_id: prof.id, first_name: prof.first_name, last_name: prof.last_name, type: p.data.type }).select('id').single();
    if (r.error) fail(fd, 'create staff record', r.error);
    staff = r.data;
  }
  const { error } = await supabase.from('team_staff').insert({ team_season_id: p.data.team_season_id, staff_id: staff.id, role_label: p.data.role_label });
  if (error) fail(fd, 'add coach', error);
  done(fd, 'r_coachAdded');
}

export async function removeCoach(fd: FormData): Promise<void> {
  const p = z.object({ row_id: uuid, team_season_id: uuid }).safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, 'r_invalid');
  const supabase = await db(fd);
  const { error } = await supabase.from('team_staff').delete().eq('id', p.data.row_id).eq('team_season_id', p.data.team_season_id);
  if (error) fail(fd, 'remove coach', error);
  done(fd, 'r_coachRemoved');
}
