import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { addCoach, addPlayers, removeCoach, removePlayer, updateRosterEntry } from '@/app/actions/teams';
import { PlayerPicker } from '@/components/admin/PlayerPicker';
import { ResultBanner } from '@/components/ResultBanner';
import { requireArea } from '@/lib/auth';
import { dateFormats } from '@/lib/format';
import { getSupabase } from '@/lib/supabase/server';
import { missingConsent } from '@/lib/conduct';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('teams'))('rosterTitle') };
}

const POSITIONS = ['goalkeeper', 'defender', 'midfielder', 'forward'] as const;
const STAFF_TYPES = ['head_coach', 'assistant_coach', 'goalkeeper_coach', 'manager', 'physio', 'analyst', 'other'] as const;
const input = 'min-h-9 rounded-control border border-line bg-raised px-2';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type RosterRow = { id: string; jersey_number: number | null; captain: boolean; joined_on: string | null; left_on: string | null; players: { id: string; first_name: string; last_name: string; position: string | null; profile_id: string | null } };
type StaffRow = { id: string; role_label: string | null; staff_members: { first_name: string; last_name: string; type: string; profile_id: string | null } };

/** One team in one season: players (shirt, position, captain), former players, and coaches. */
export default async function TeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const [t, tpos, fmt, supabase] = await Promise.all([getTranslations('teams'), getTranslations('position'), dateFormats(), getSupabase()]);
  if (!supabase) notFound();

  const { data: ts } = await supabase.from('team_seasons').select('id, division, teams!inner(name, category), seasons!inner(id, name)').eq('id', id).maybeSingle();
  if (!ts) notFound();
  const team = ts.teams as unknown as { name: string; category: string };
  const season = ts.seasons as unknown as { id: string; name: string };

  const [{ data: rosterData }, { data: staffData }, { data: allPlayers }, { data: playerProfiles }, { data: coachProfiles }] = await Promise.all([
    supabase.from('team_players').select('id, jersey_number, captain, joined_on, left_on, players!inner(id, first_name, last_name, position, profile_id)').eq('team_season_id', id),
    supabase.from('team_staff').select('id, role_label, staff_members!inner(first_name, last_name, type, profile_id)').eq('team_season_id', id),
    supabase.from('players').select('id, first_name, last_name, profile_id').order('last_name'),
    supabase.from('profiles').select('id, first_name, last_name, email, phone').eq('role', 'player').eq('status', 'active').order('last_name'),
    supabase.from('profiles').select('id, first_name, last_name, email').eq('role', 'coach').eq('status', 'active').order('last_name'),
  ]);
  const roster = ((rosterData as unknown as RosterRow[] | null) ?? []);
  const active = roster.filter((r) => !r.left_on).sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999) || a.players.last_name.localeCompare(b.players.last_name));
  const former = roster.filter((r) => r.left_on);
  const noConduct = await missingConsent(supabase, active.map((r) => r.players.profile_id).filter((x): x is string => !!x));
  const tc = await getTranslations('conduct');
  const staff = (staffData as unknown as StaffRow[] | null) ?? [];

  // Who can be added: player records not active in this team, and active player members without a record yet.
  const activeIds = new Set(active.map((r) => r.players.id));
  const linked = new Set((allPlayers ?? []).map((p) => p.profile_id).filter(Boolean));
  const candidates = [
    ...(allPlayers ?? []).filter((p) => !activeIds.has(p.id)).map((p) => ({ value: `player:${p.id}`, label: `${p.last_name} ${p.first_name}`, note: p.profile_id ? undefined : t('pickNoAccount') })),
    ...(playerProfiles ?? []).filter((p) => !linked.has(p.id)).map((p) => ({ value: `profile:${p.id}`, label: `${p.last_name} ${p.first_name}`.trim() || p.email || p.phone, note: t('pickNewRecord') })),
  ].sort((a, b) => a.label.localeCompare(b.label));
  const assigned = new Set(staff.map((s) => s.staff_members.profile_id));
  const coachChoices = (coachProfiles ?? []).filter((c) => !assigned.has(c.id));
  const back = `/admin/teams/${id}`;
  const hidden = (extra: Record<string, string>) => Object.entries({ back, team_season_id: id, ...extra }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <Link href={`/admin/teams?season=${season.id}`} className="text-sm font-semibold text-pitch underline underline-offset-2">← {t('title')}</Link>
      <header>
        <h1 className="font-display text-2xl font-extrabold">{team.name}</h1>
        <p className="mt-1 text-muted">{season.name} · {t(`cat_${team.category}` as 'cat_senior')}{ts.division ? ` · ${ts.division}` : ''}</p>
      </header>
      <ResultBanner ns="teams" result={sp.result} />

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="players-h">
        <h2 id="players-h" className="font-display text-xl font-extrabold">{t('players')} ({active.length})</h2>
        {active.length === 0 ? <p className="mt-2 text-muted">{t('noPlayers')}</p> : (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr><th scope="col" className="px-2 py-2 text-start">{t('name')}</th><th scope="col" className="px-2 py-2 text-start">{t('shirt')}</th>
                  <th scope="col" className="px-2 py-2 text-start">{t('position')}</th><th scope="col" className="px-2 py-2 text-start">{t('captain')}</th><th scope="col" className="px-2 py-2"><span className="sr-only">{t('actions')}</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {active.map((r) => {
                  const formId = `row-${r.id}`;
                  return (
                    <tr key={r.id} data-player={`${r.players.first_name} ${r.players.last_name}`}>
                      <td className="px-2 py-2 font-semibold"><bdi>{r.players.first_name} {r.players.last_name}</bdi>
                        {r.players.profile_id && noConduct.has(r.players.profile_id) ? <span className="ms-2 whitespace-nowrap rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white" data-conduct-flag>{tc('flagShort')}</span> : null}</td>
                      <td className="px-2 py-2"><input form={formId} name="jersey_number" defaultValue={r.jersey_number ?? ''} inputMode="numeric" maxLength={2} aria-label={t('shirt')} className={`${input} w-16`} /></td>
                      <td className="px-2 py-2">
                        <select form={formId} name="position" defaultValue={r.players.position ?? ''} aria-label={t('position')} className={input}>
                          <option value="">–</option>{POSITIONS.map((p) => <option key={p} value={p}>{tpos(p)}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2"><input form={formId} type="checkbox" name="captain" defaultChecked={r.captain} aria-label={t('captain')} className="size-5 accent-[rgb(var(--accent))]" /></td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          <form id={formId} action={updateRosterEntry}>{hidden({ row_id: r.id, player_id: r.players.id })}
                            <button className="min-h-9 rounded-full bg-accent px-4 font-bold text-on-accent hover:brightness-110">{t('save')}</button></form>
                          <form action={removePlayer}>{hidden({ row_id: r.id })}
                            <button className="min-h-9 rounded-full border border-danger px-4 font-bold text-danger hover:bg-danger/10">{t('remove')}</button></form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <form action={addPlayers} className="mt-5">
          {hidden({})}
          <PlayerPicker options={candidates} labels={{ title: t('pickTitle'), search: t('pickSearch'), selectShown: t('pickSelectShown'), clear: t('pickClear'), none: t('noCandidates'),
            noMatch: t('pickNoMatch'), add: t('pickAdd', { count: '{count}' }), selected: t('pickSelected', { count: '{count}' }) }} />
          <p className="mt-2 text-xs text-muted">{t('pickNote')}</p>
        </form>

        {former.length ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-muted">{t('former', { count: former.length })}</summary>
            <ul className="mt-2 grid gap-1 text-sm text-muted">{former.map((r) => <li key={r.id}><bdi>{r.players.first_name} {r.players.last_name}</bdi> · {t('leftOn', { date: r.left_on ? fmt.date.format(new Date(`${r.left_on}T12:00:00Z`)) : '' })}</li>)}</ul>
          </details>
        ) : null}
      </section>

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="coaches-h">
        <h2 id="coaches-h" className="font-display text-xl font-extrabold">{t('coaches')} ({staff.length})</h2>
        {staff.length === 0 ? <p className="mt-2 text-muted">{t('noCoaches')}</p> : (
          <ul className="mt-3 divide-y divide-line">
            {staff.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-coach={`${s.staff_members.first_name} ${s.staff_members.last_name}`}>
                <span><bdi className="font-semibold">{s.staff_members.first_name} {s.staff_members.last_name}</bdi> · {s.role_label || t(`st_${s.staff_members.type}` as 'st_head_coach')}</span>
                <form action={removeCoach}>{hidden({ row_id: s.id })}<button className="min-h-9 rounded-full border border-danger px-4 font-bold text-danger hover:bg-danger/10">{t('remove')}</button></form>
              </li>
            ))}
          </ul>
        )}
        <form action={addCoach} className="mt-5 grid gap-3 rounded-card bg-surface p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          {hidden({})}
          <label className="grid gap-1 text-sm font-semibold">{t('addCoach')}
            <select name="profile_id" required defaultValue="" className={`${input} min-h-10`}>
              <option value="" disabled>{t('choose')}</option>
              {coachChoices.map((c) => <option key={c.id} value={c.id}>{`${c.last_name} ${c.first_name}`.trim() || c.email}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">{t('staffType')}
            <select name="type" defaultValue="head_coach" className={`${input} min-h-10`}>{STAFF_TYPES.map((s) => <option key={s} value={s}>{t(`st_${s}`)}</option>)}</select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">{t('roleLabel')}<input name="role_label" maxLength={60} placeholder={t('roleLabelEg')} className={`${input} min-h-10`} /></label>
          <button className="min-h-10 rounded-full bg-accent px-5 font-bold text-on-accent hover:brightness-110">{t('add')}</button>
          {coachChoices.length === 0 ? <p className="text-xs text-muted sm:col-span-4">{t('noCoachCandidates')}</p> : null}
        </form>
      </section>
    </div>
  );
}
