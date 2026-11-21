import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { saveCoachPermissions } from '@/app/actions/permissions';
import { ResultBanner } from '@/components/ResultBanner';
import { NavIcon, type NavIconName } from '@/components/NavIcon';
import { requireArea } from '@/lib/auth';
import { PERMISSIONS, type Permission } from '@/lib/permissions';
import { supabaseEnv } from '@/lib/env';
import { getSupabase } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('perm'))('title') };
}

const ICON: Record<Permission, NavIconName> = { contracts: 'contract', fees: 'euro', opponents: 'versus', posters: 'image' };
type Coach = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; role: string };

/**
 * Admin → People → Coach permissions (migration 0070): one row per coach and player-coach, a tick per right (contracts,
 * fees, opponents, poster photos), and the teams each one coaches this season, since every right reaches only those.
 */
export default async function CoachPermissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  let installed = true; // false while the database update (migration 0070) is not installed
  let dbError = ''; // the database's own words, shown to the admin to find the cause
  const [sp, t, tr, supabase] = await Promise.all([searchParams, getTranslations('perm'), getTranslations('role'), getSupabase()]);
  if (!supabase) return null;
  const [{ data: coachRows }, { data: grants }, { data: staff }] = await Promise.all([
    supabase.from('profiles').select('id, first_name, last_name, email, phone, role').in('role', ['coach', 'player_coach']).eq('status', 'active').order('first_name').order('last_name'),
    supabase.from('coach_permissions').select('profile_id, permission').then((r) => { installed = !r.error; dbError = r.error ? `${r.error.code ?? ''} ${r.error.message ?? ''}`.trim() : ''; return r; }),
    supabase.from('team_staff').select('staff_members!inner(profile_id), team_seasons!inner(teams!inner(name), seasons!inner(is_current))').eq('team_seasons.seasons.is_current', true),
  ]);
  const coaches = (coachRows ?? []) as Coach[];
  const has = new Set(((grants ?? []) as { profile_id: string; permission: string }[]).map((g) => `${g.profile_id}:${g.permission}`));
  const teamsOf = new Map<string, string[]>();
  for (const s of (staff ?? []) as unknown as { staff_members: { profile_id: string | null }; team_seasons: { teams: { name: string } } }[]) {
    const pid = s.staff_members.profile_id; if (!pid) continue;
    teamsOf.set(pid, [...(teamsOf.get(pid) ?? []), s.team_seasons.teams.name]);
  }
  const counts = Object.fromEntries(PERMISSIONS.map((p) => [p, coaches.filter((c) => has.has(`${c.id}:${p}`)).length])) as Record<Permission, number>;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <p className="text-sm"><Link href="/admin/members" className="font-semibold text-pitch underline underline-offset-2">{t('back')}</Link></p>
        <h1 className="mt-1 font-display text-2xl font-extrabold">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
      </header>
      <ResultBanner ns="perm" result={sp.result} />
      {!installed ? (
        <div role="alert" className="rounded-card border-2 border-danger/40 bg-danger/5 p-4" data-not-installed>
          <p className="font-semibold">{t('notInstalled')}</p>
          {/* which Supabase project the app talks to (the first part of its public address), to compare with the SQL Editor's */}
          <p className="mt-2 text-sm">{t('appProject')} <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs" dir="ltr" data-app-project>{(() => { try { return new URL(supabaseEnv()?.url ?? '').hostname.split('.')[0]; } catch { return '–'; } })()}</code></p>
          {dbError ? <p className="mt-2 text-sm">{t('dbSays')} <code className="break-all rounded bg-raised px-1.5 py-0.5 font-mono text-xs" dir="ltr" data-db-error>{dbError}</code></p> : null}
        </div>
      ) : null}

      <section className="grid gap-2 sm:grid-cols-2" aria-label={t('rightsTitle')} data-rights>
        {PERMISSIONS.map((p) => (
          <div key={p} className="flex gap-3 rounded-card border border-line bg-raised p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-pitch"><NavIcon name={ICON[p]} className="size-5" /></span>
            <span className="grid gap-0.5"><span className="font-bold">{t(`p_${p}`)} <span className="ms-1 text-xs font-semibold text-muted">{t('grantedTo', { count: counts[p] })}</span></span>
              <span className="text-sm text-muted">{t(`d_${p}`)}</span></span>
          </div>
        ))}
      </section>

      {coaches.length === 0 ? <p className="rounded-card border border-line bg-raised p-6 text-muted">{t('noCoaches')}</p> : (
        <ul className="grid gap-3" data-coaches>
          {coaches.map((c) => {
            const name = `${c.first_name} ${c.last_name}`.trim() || c.email || c.phone || '–';
            const teams = teamsOf.get(c.id) ?? [];
            return (
              <li key={c.id} id={`c-${c.id}`} className="scroll-mt-20 rounded-card border border-line bg-raised p-4" data-coach={c.id}>
                <form action={saveCoachPermissions} className="grid gap-3">
                  <input type="hidden" name="profile_id" value={c.id} />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p><bdi className="font-display text-lg font-extrabold">{name}</bdi><span className="ms-2 rounded-full bg-surface px-2 py-0.5 text-xs font-bold">{tr(c.role as never)}</span></p>
                    <p className="text-sm text-muted">{teams.length ? <><span className="font-semibold">{t('teams')}</span> <bdi>{teams.join(', ')}</bdi></> : <span className="text-danger">{t('noTeam')}</span>}</p>
                  </div>
                  <fieldset className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    <legend className="sr-only">{t('rightsFor', { name })}</legend>
                    {PERMISSIONS.map((p) => (
                      <label key={p} className="relative">
                        <input type="checkbox" name="perm" value={p} defaultChecked={has.has(`${c.id}:${p}`)} className="peer sr-only" data-perm={p} />
                        <span className="flex min-h-12 cursor-pointer items-center gap-2 rounded-control border-2 border-line px-3 text-sm font-bold peer-checked:border-accent peer-checked:bg-accent/10 peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                          <span className="grid size-5 shrink-0 place-items-center rounded border-2 border-line bg-raised text-transparent [label:has(input:checked)_&]:border-accent [label:has(input:checked)_&]:bg-accent [label:has(input:checked)_&]:text-on-accent" aria-hidden>✓</span>
                          <NavIcon name={ICON[p]} className="size-4 shrink-0" />{t(`p_${p}`)}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <button className="min-h-11 justify-self-start rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110" data-save>{t('save')}</button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">{t('note')}</p>
    </div>
  );
}
