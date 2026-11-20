import { getTranslations } from 'next-intl/server';
import { ResultBanner } from '@/components/ResultBanner';
import { SeasonPicker } from '@/components/admin/SeasonPicker';
import { ShirtGrid } from '@/components/ShirtGrid';
import { ShirtRequests } from '@/components/ShirtRequests';
import { releaseShirt, saveShirtSet } from '@/app/actions/shirts';
import { inScope, type Scope } from '@/lib/staff';
import { pickSeason } from '@/lib/finance';
import { openShirtRequests, ranges, shirtNumbers } from '@/lib/shirts';
import { getSupabase } from '@/lib/supabase/server';

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

/**
 * Teams & events → Shirt numbers (migration 0057): for a season, every team's open requests (approve or decline), the
 * free numbers, and who wears which number. Admins: every team, any season, and the club's set of numbers (0059).
 * Coaches: the teams they coach this season (RLS / app.can_decide_jersey: coaches decide for their own teams).
 */
export async function ShirtsView({ sp, scope }: { sp: Record<string, string | string[] | undefined>; scope: Scope }) {
  const admin = scope.area === 'admin';
  const [t, supabase] = await Promise.all([getTranslations('shirt'), getSupabase()]);
  if (!supabase) return null;
  const { seasons, season } = await pickSeason(supabase, admin ? one(sp.season) : '');
  if (!season) return <p className="rounded-card bg-raised p-6 text-muted">{t('noSeason')}</p>;
  const { data: tsRows } = await supabase.from('team_seasons').select('id, division, teams!inner(name)').eq('season_id', season.id).order('created_at');
  const teams = ((tsRows ?? []) as unknown as { id: string; division: string | null; teams: { name: string } }[]).filter((x) => inScope(scope, x.id));
  const [requests, grids] = await Promise.all([openShirtRequests(supabase, teams.map((x) => x.id)), Promise.all(teams.map((x) => shirtNumbers(supabase, x.id)))]);
  const nameOf = (id: string) => teams.find((x) => x.id === id)?.teams.name ?? '';
  const back = admin ? `/admin/shirts?season=${season.id}` : '/coach/shirts';
  // 0059: the numbers the club has shirts for (all 1–99 until set)
  const { data: setRow } = await supabase.from('site_settings').select('value').eq('key', 'shirts').maybeSingle();
  const clubSet = Array.isArray((setRow?.value as { numbers?: unknown } | null)?.numbers) ? ((setRow!.value as { numbers: number[] }).numbers) : null;
  const labels = { free: t('free'), taken: (name: string) => t('takenBy', { name }), yours: t('yours'), requested: (n: number) => t('requestedN', { count: n }), legendFree: t('legendFree'), legendTaken: t('legendTaken'), legendRequested: t('legendRequested'), notInSet: t('notInSet') };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold">{t('adminTitle')}</h1>
          <p className="mt-1 max-w-3xl text-muted">{admin ? t('adminLead') : t('coachLead')}</p>
        </div>
        {admin ? <SeasonPicker seasons={seasons} current={season.id} label={t('season')} action="/admin/shirts" /> : null}
      </header>

      <div id="shirts" className="scroll-mt-4 empty:hidden"><ResultBanner ns="shirt" result={sp.result} /></div>

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="set-h" data-shirt-set>
        <h2 id="set-h" className="font-display text-xl font-extrabold">{t('setTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{clubSet ? t('setNow', { count: clubSet.length, list: ranges(clubSet) }) : t('setNone')}</p>
        {admin ? <><form action={saveShirtSet} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="back" value={back} />
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold sm:max-w-sm">{t('setLabel')}
            <input name="numbers" required maxLength={300} defaultValue={clubSet ? ranges(clubSet).replace(/–/g, '-') : ''} placeholder="1-39" dir="ltr" className="min-h-10 rounded-control border border-line bg-raised px-3 font-normal" data-set-input /></label>
          <button className="min-h-10 rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110" data-set-save>{t('setSave')}</button>
        </form>
        <p className="mt-2 text-xs text-muted">{t('setHint')}</p></> : null}
      </section>

      <section id="requests" className="scroll-mt-4 rounded-card border-2 border-accent bg-raised p-6" aria-labelledby="req-h">
        <h2 id="req-h" className="font-display text-xl font-extrabold">{t('openTitle', { count: requests.length })}</h2>
        <div className="mt-3"><ShirtRequests requests={requests} back={back} teamName={nameOf} /></div>
      </section>

      {teams.length ? teams.map((team, i) => {
        const g = grids[i]!;
        const free = g.filter((n) => n.free), taken = g.filter((n) => n.player_id);
        return (
          <section key={team.id} className="rounded-card border border-line bg-raised p-6" aria-labelledby={`team-${team.id}`} data-shirt-team={team.teams.name}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`team-${team.id}`} className="font-display text-xl font-extrabold"><bdi>{team.teams.name}</bdi>{team.division ? <span className="ms-2 text-sm font-normal text-muted">{team.division}</span> : null}</h2>
              <p className="text-sm text-muted" data-counts>{t('counts', { free: free.length, taken: taken.length })}</p>
            </div>
            <p className="mt-3 text-sm" data-free-numbers><span className="font-semibold">{t('freeList', { count: free.length })}</span> <span className="text-muted" dir="ltr">{ranges(free.map((n) => n.number))}</span></p>
            {taken.length ? (
              <ul className="mt-3 flex flex-wrap gap-2 text-sm" data-taken-list>
                {taken.map((n) => (
                  <li key={n.number} className={`flex items-center gap-2 rounded-full py-1 ps-3 pe-1 ${n.in_set ? 'bg-surface' : 'bg-danger/10'}`} data-taken={n.number} data-out-of-set={!n.in_set || undefined}>
                    <span className="font-bold tabular-nums">{n.number}</span> <bdi>{n.player_name}</bdi>
                    {!n.in_set ? <span className="text-xs font-semibold text-danger">{t('notInSet')}</span> : null}
                    <form action={releaseShirt}>
                      <input type="hidden" name="team_season_id" value={team.id} /><input type="hidden" name="player_id" value={n.player_id ?? ''} /><input type="hidden" name="back" value={back} />
                      <button className="min-h-8 rounded-full border border-line bg-raised px-2.5 text-xs font-bold hover:border-danger hover:text-danger" aria-label={t('releaseAria', { number: n.number, name: n.player_name ?? '' })} data-release>{t('release')}</button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
            <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-pitch">{t('showGrid')}</summary>
              <div className="mt-3"><ShirtGrid numbers={g} labels={labels} /></div>
            </details>
          </section>
        );
      }) : <p className="rounded-card border border-line bg-raised p-6 text-muted">{t('noTeams')}</p>}
    </div>
  );
}
