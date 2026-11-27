import { getTranslations } from 'next-intl/server';
import { SquadPlanner } from '@/components/squad/SquadPlanner';
import { analysisAvailable } from '@/lib/squad-ai';
import { defaultYear, loadPlanner, planTeams } from '@/lib/squad-plan';
import type { Scope } from '@/lib/staff';
import { getSupabase } from '@/lib/supabase/server';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Admin and Coach → Squad planner (migration 0076): the team and season to plan, then the planner itself. */
export async function SquadView({ sp, scope }: { sp: Record<string, string | string[] | undefined>; scope: Scope }) {
  const [t, supabase] = await Promise.all([getTranslations('squad'), getSupabase()]);
  if (!supabase) return null;
  const teams = await planTeams(supabase, scope.area === 'coach' ? scope.teams.map((x) => x.id) : undefined);
  const team = teams.find((x) => x.id === one(sp.team)) ?? teams[0];
  const y0 = defaultYear(), years = [y0 - 1, y0, y0 + 1];
  const year = years.includes(Number(one(sp.year))) ? Number(one(sp.year)) : y0;
  const data = team ? await loadPlanner(supabase, team.id, year) : null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 max-w-3xl text-muted">{t('lead')}</p>
        </div>
        {teams.length ? (
          <form className="flex flex-wrap items-center gap-2" data-squad-pick>
            <label className="sr-only" htmlFor="sq-team">{t('team')}</label>
            <select id="sq-team" name="team" defaultValue={team?.id} className="min-h-10 rounded-full border border-line bg-raised px-3 text-sm font-bold">{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <label className="sr-only" htmlFor="sq-year">{t('season')}</label>
            <select id="sq-year" name="year" defaultValue={year} className="min-h-10 rounded-full border border-line bg-raised px-3 text-sm font-bold">{years.map((y) => <option key={y} value={y}>{t('seasonN', { year: y })}</option>)}</select>
            <button className="min-h-10 rounded-full border-2 border-fg px-4 text-sm font-bold hover:bg-fg hover:text-white">{t('open')}</button>
          </form>
        ) : null}
      </header>
      {!team || !data ? <p className="rounded-card border border-line bg-raised p-6 text-muted">{t('noTeams')}</p>
        : <SquadPlanner key={`${team.id}-${year}`} teamId={team.id} teamName={team.name} year={year} formations={data.formations} pool={data.pool} plan={data.plan} canAnalyse={analysisAvailable()} />}
    </div>
  );
}
