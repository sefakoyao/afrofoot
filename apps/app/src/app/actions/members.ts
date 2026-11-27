'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { assignableRoles, canManageMember, isPlayerRole, isRole, ROLES } from '@afrofoot/db';
import { requireArea } from '@/lib/auth';
import { autoContracts, autoParams } from '@/lib/auto-contracts';
import { addToTeam, ensurePlayerRecord } from '@/lib/roster';
import { getSupabase } from '@/lib/supabase/server';

/** What an admin can do to one member. The status changes follow the account life cycle: pending → active ⇄ suspended. */
const memberAction = z.discriminatedUnion('op', [
  // approve can also put a player straight into a team of the current season (the group: Men, Women, Junior …)
  z.object({ op: z.literal('approve'), id: z.string().uuid(), team_season_id: z.union([z.literal(''), z.string().uuid()]).optional() }),
  z.object({ op: z.literal('suspend'), id: z.string().uuid() }),
  z.object({ op: z.literal('reactivate'), id: z.string().uuid() }),
  z.object({ op: z.literal('role'), id: z.string().uuid(), role: z.enum(ROLES) }),
]);
const NEXT_STATUS = { approve: 'active', suspend: 'suspended', reactivate: 'active' } as const;
const FROM_STATUS = { approve: ['pending'], suspend: ['active', 'pending'], reactivate: ['suspended'] } as const;

/** Back to the list the admin was looking at (only /admin/members, so the field cannot redirect elsewhere). */
function back(fd: FormData, result: string, extra: Record<string, string | number> = {}): never {
  const raw = String(fd.get('back') ?? '');
  const url = new URL(raw.startsWith('/admin/members') ? raw : '/admin/members', 'http://x');
  for (const k of ['result', 'a', 't', 's', 'team', 'already', 'cs', 'cd']) url.searchParams.delete(k);
  url.searchParams.set('result', result);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, String(v));
  redirect(url.pathname + url.search);
}

/**
 * Approve, suspend, reactivate or change the role of a member. Runs as the signed-in admin, so RLS (admin_all) and the
 * guard_profiles trigger still decide; the checks here only give a clear message first. Every change lands in audit_log.
 */
export async function updateMember(fd: FormData): Promise<void> {
  const actor = await requireArea('admin');
  const p = memberAction.safeParse(Object.fromEntries(fd));
  if (!p.success) back(fd, 'invalid');
  const a = p.data;

  const supabase = await getSupabase();
  if (!supabase) back(fd, 'error');
  const { data: target } = await supabase.from('profiles').select('id, role, status').eq('id', a.id).maybeSingle();
  if (!target || !isRole(target.role)) back(fd, 'notFound');
  if (!canManageMember(actor, { id: target.id, role: target.role })) back(fd, 'notAllowed');

  let change: { status?: string; role?: string };
  if (a.op === 'role') {
    if (!assignableRoles(actor.role).includes(a.role)) back(fd, 'notAllowed');
    if (a.role === target.role) back(fd, 'unchanged');
    change = { role: a.role };
  } else {
    if (!(FROM_STATUS[a.op] as readonly string[]).includes(target.status)) back(fd, 'unchanged');
    change = { status: NEXT_STATUS[a.op] };
  }

  const { error } = await supabase.from('profiles').update(change).eq('id', a.id);
  if (error) {
    console.error('[members] update refused', { code: error.code, message: error.message });
    back(fd, error.code === '42501' ? 'notAllowed' : error.code === '23514' ? 'lastSuper' : 'error');
  }
  // Approved with a group: player record from the profile, then into the team.
  if (a.op === 'approve' && a.team_season_id) {
    if (!isPlayerRole(target.role)) { revalidatePath('/admin', 'layout'); back(fd, 'approveNotPlayer'); }
    const rec = await ensurePlayerRecord(supabase, a.id);
    if ('error' in rec) { revalidatePath('/admin', 'layout'); back(fd, rec.error === 'noName' ? 'approveNoName' : 'error'); }
    const r = await addToTeam(supabase, a.team_season_id, [rec.id]);
    // 0037: the contract for the season, created (and sent) from the template
    const c = r.failed ? null : await autoContracts(supabase, a.team_season_id, [rec.id]);
    revalidatePath('/admin', 'layout'); revalidatePath('/me', 'layout');
    back(fd, r.failed ? 'error' : 'approvedToTeam', c ? autoParams(c) : {});
  }
  revalidatePath('/admin', 'layout');
  back(fd, a.op === 'role' ? 'roleChanged' : a.op);
}

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'bulkNone').max(100, 'invalid'),
  action: z.enum(['approve', 'team', 'approveTeam']),
  team_season_id: z.union([z.literal(''), z.string().uuid()]),
}).refine((v) => v.action === 'approve' || v.team_season_id !== '', { message: 'bulkNoTeam' });

/**
 * With the members ticked in the list: approve them, add them to a team, or both. Each member is checked like a single
 * change (only members this admin may manage; only players go into teams; a player record needs a first and last name).
 * Result: ?result=bulk&a=<approved>&t=<added to the team>&s=<skipped>.
 */
export async function bulkMembers(fd: FormData): Promise<void> {
  const actor = await requireArea('admin');
  const p = bulkSchema.safeParse({ ids: fd.getAll('ids').map(String), action: fd.get('action'), team_season_id: String(fd.get('team_season_id') ?? '') });
  if (!p.success) back(fd, p.error.issues[0]?.message === 'bulkNone' || p.error.issues[0]?.message === 'bulkNoTeam' ? p.error.issues[0].message : 'invalid');
  const supabase = await getSupabase();
  if (!supabase) back(fd, 'error');
  const { action, team_season_id: team } = p.data;
  const { data: targets } = await supabase.from('profiles').select('id, role, status').in('id', p.data.ids);
  let approved = 0, skipped = p.data.ids.length - (targets ?? []).length;
  const toTeam: string[] = [];
  for (const m of targets ?? []) {
    if (!isRole(m.role) || !canManageMember(actor, { id: m.id, role: m.role })) { skipped++; continue; }
    let status = m.status;
    if (action !== 'team' && status === 'pending') {
      const { error } = await supabase.from('profiles').update({ status: 'active' }).eq('id', m.id);
      if (error) { skipped++; continue; }
      approved++; status = 'active';
    }
    if (action === 'approve') { if (m.status !== 'pending') skipped++; continue; }
    if (!isPlayerRole(m.role) || status !== 'active') { skipped++; continue; }
    const rec = await ensurePlayerRecord(supabase, m.id);
    if ('error' in rec) { skipped++; continue; }
    toTeam.push(rec.id);
  }
  const r = team && toTeam.length ? await addToTeam(supabase, team, toTeam) : { added: 0, already: 0, failed: 0 };
  const c = team && toTeam.length ? await autoContracts(supabase, team, toTeam) : { sent: 0, drafts: 0, existing: 0 };
  revalidatePath('/admin', 'layout'); revalidatePath('/me', 'layout');
  back(fd, 'bulk', { a: approved, t: r.added, s: skipped + r.failed, ...(r.already ? { already: r.already } : {}), ...autoParams(c) });
}

/** YYYY-MM-DD from 1940 to 5 years ago (Helsinki), the range the club's registration forms accept too. */
const birthDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki' }).format(new Date());
  const max = `${Number(today.slice(0, 4)) - 5}${today.slice(4)}`;
  return !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && d >= '1940-01-01' && d <= max;
});

/**
 * An admin corrects a player's birth date (it decides whether their contract needs a parent or guardian, migration
 * 0068). Runs as the admin: RLS admin_all allows it and the audit trigger on players keeps the old and new date.
 */
export async function setBirthDate(fd: FormData): Promise<void> {
  await requireArea('admin');
  const p = z.object({ player_id: z.string().uuid(), date_of_birth: birthDate }).safeParse({ player_id: fd.get('player_id'), date_of_birth: fd.get('date_of_birth') });
  if (!p.success) back(fd, 'birthInvalid');
  const supabase = await getSupabase();
  if (!supabase) back(fd, 'error');
  const { data, error } = await supabase.from('players').update({ date_of_birth: p.data.date_of_birth }).eq('id', p.data.player_id).select('id');
  if (error || !data?.length) back(fd, error?.code === '42501' ? 'notAllowed' : 'notFound');
  revalidatePath('/admin/members');
  back(fd, 'birthSaved');
}
