import type { TeamChoice, Group } from '@/lib/roster';

/** Team of the current season, grouped Men / Women / Junior / Other (name="team_season_id"). */
export function TeamSelect({ teams, groupLabel, emptyLabel, id, className = '' }: {
  teams: TeamChoice[]; groupLabel: (g: Group) => string; emptyLabel?: string; id?: string; className?: string;
}) {
  const groups = [...new Set(teams.map((t) => t.group))];
  return (
    <select id={id} name="team_season_id" defaultValue="" className={`min-h-10 rounded-control border border-line bg-raised px-3 font-normal ${className}`} data-team-select>
      {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
      {groups.map((g) => (
        <optgroup key={g} label={groupLabel(g)}>
          {teams.filter((t) => t.group === g).map((t) => <option key={t.id} value={t.id}>{groupLabel(g)} · {t.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
