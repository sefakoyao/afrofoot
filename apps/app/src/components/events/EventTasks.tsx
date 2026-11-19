import { getTranslations } from 'next-intl/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addEventTask, assignEventTask, createTaskType, removeEventTask } from '@/app/actions/tasks';
import { ResultBanner } from '@/components/ResultBanner';
import { TASK_ICONS, TaskIcon } from '@/components/TaskIcon';
import { loadEventTasks, loadTaskTypes, taskName } from '@/lib/tasks';
import { AutoSubmitSelect } from './AutoSubmitSelect';

/**
 * Game-day / training tasks on a coach's game or training page (migration 0062): the tasks with their icon and who does
 * each (a player, or open: anyone in the team can take it); tap a task to add it; "+ New task" adds a type for the club.
 */
export async function EventTasks({ db, kind, eventId, teamSeasonId, back, result }: { db: SupabaseClient; kind: 'match' | 'session'; eventId: string; teamSeasonId: string; back: string; result?: unknown }) {
  const [t, types, tasks, { data: rosterRows }] = await Promise.all([
    getTranslations('tasks'), loadTaskTypes(db, true),
    loadEventTasks(db, kind === 'match' ? [eventId] : [], kind === 'session' ? [eventId] : []),
    db.from('team_players').select('jersey_number, players!inner(id, first_name, last_name)').eq('team_season_id', teamSeasonId).is('left_on', null),
  ]);
  const roster = ((rosterRows ?? []) as unknown as { jersey_number: number | null; players: { id: string; first_name: string; last_name: string } }[])
    .map((r) => ({ id: r.players.id, name: `${r.players.first_name} ${r.players.last_name}`, shirt: r.jersey_number }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const typeOf = new Map(types.map((x) => [x.id, x]));
  const label = (id: string) => taskName(t, typeOf.get(id));
  const open = tasks.filter((k) => !k.player_id).length;
  const hidden = (n: string, v: string) => <input type="hidden" name={n} value={v} />;
  const common = <>{hidden('back', back)}{hidden('kind', kind)}{hidden('event_id', eventId)}</>;

  return (
    <section id="tasks" aria-labelledby="tasks-h" className="scroll-mt-4 rounded-card border border-line bg-raised p-4 sm:p-6" data-event-tasks>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tasks-h" className="font-display text-xl font-extrabold">{t(kind === 'match' ? 'gameTitle' : 'trainingTitle')}</h2>
        {tasks.length ? <span className="text-sm text-muted" data-task-count>{t('count', { count: tasks.length, open })}</span> : null}
      </div>
      <p className="mt-1 text-sm text-muted">{t('coachLead')}</p>
      <div className="mt-3 empty:hidden"><ResultBanner ns="tasks" result={result} /></div>

      {tasks.length ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {tasks.map((k) => (
            <li key={k.id} className={`flex items-center gap-3 rounded-card border-2 p-3 ${k.player_id ? 'border-line bg-surface' : 'border-dashed border-accent/60 bg-accent/5'}`} data-task={label(k.task_type_id)} data-task-open={!k.player_id || undefined}>
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent"><TaskIcon name={typeOf.get(k.task_type_id)?.icon ?? 'star'} className="size-6" /></span>
              <div className="grid min-w-0 flex-1 gap-1">
                <span className="truncate font-semibold">{label(k.task_type_id)}</span>
                <form action={assignEventTask} className="flex items-center gap-2">
                  {common}{hidden('task_id', k.id)}
                  <label className="sr-only" htmlFor={`who-${k.id}`}>{t('who')}</label>
                  <AutoSubmitSelect id={`who-${k.id}`} name="player_id" defaultValue={k.player_id ?? ''} className="min-h-9 min-w-0 flex-1 rounded-control border border-line bg-raised px-2 text-sm" data-task-who>
                    <option value="">{t('openOption')}</option>
                    {roster.map((r) => <option key={r.id} value={r.id}>{r.shirt ? `#${r.shirt} ` : ''}{r.name}</option>)}
                  </AutoSubmitSelect>
                  <noscript><button className="min-h-9 rounded-full border border-line px-3 text-sm font-semibold">{t('save')}</button></noscript>
                </form>
              </div>
              <form action={removeEventTask}>
                {common}{hidden('task_id', k.id)}
                <button className="grid size-9 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger" aria-label={t('removeLabel', { task: label(k.task_type_id) })} data-task-remove>
                  <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 rounded-card border-2 border-dashed border-line p-4 text-sm text-muted" data-no-tasks>{t('none')}</p>}

      <h3 className="mt-5 text-sm font-bold">{t('addTitle')}</h3>
      <ul className="mt-2 flex flex-wrap gap-2" data-task-chips>
        {types.filter((x) => x.active).map((x) => (
          <li key={x.id}>
            <form action={addEventTask}>
              {common}{hidden('type_id', x.id)}
              <button className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-line bg-raised pe-4 ps-2 text-sm font-semibold transition hover:border-accent active:scale-[.97]" data-add-task={taskName(t, x)}>
                <span className="grid size-7 place-items-center rounded-full bg-accent/15 text-pitch"><TaskIcon name={x.icon} className="size-[18px]" /></span>
                {taskName(t, x)}<span aria-hidden className="text-muted">+</span>
              </button>
            </form>
          </li>
        ))}
      </ul>

      <details className="mt-4 rounded-card bg-surface p-4" data-new-task>
        <summary className="cursor-pointer font-semibold text-pitch">{t('newTask')}</summary>
        <form action={createTaskType} className="mt-3 grid gap-3">
          {common}
          <label className="grid gap-1 text-sm font-semibold sm:max-w-md">{t('newName')}
            <input name="name" required minLength={2} maxLength={60} placeholder={t('newNameEg')} className="min-h-10 rounded-control border border-line bg-raised px-3 font-normal" dir="auto" /></label>
          <IconPicker legend={t('icon')} />
          <p className="text-xs text-muted">{t('newHint')}</p>
          <button className="min-h-10 justify-self-start rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">{t(kind === 'match' ? 'newAddGame' : 'newAddTraining')}</button>
        </form>
      </details>
    </section>
  );
}

/** Choose an icon: a row of round icon buttons (radio buttons underneath; works without scripts). */
export function IconPicker({ legend, name = 'icon', value }: { legend: string; name?: string; value?: string }) {
  return (
    <fieldset className="grid gap-1" data-icon-picker>
      <legend className="text-sm font-semibold">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {TASK_ICONS.map((i, n) => (
          <label key={i} className="relative">
            <input type="radio" name={name} value={i} required defaultChecked={value ? value === i : n === 0} className="peer sr-only" />
            <span className="grid size-11 cursor-pointer place-items-center rounded-full border-2 border-line bg-raised text-fg transition peer-checked:border-accent peer-checked:bg-accent peer-checked:text-on-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent" title={i.replace('_', ' ')}>
              <TaskIcon name={i} className="size-5" /><span className="sr-only">{i.replace('_', ' ')}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
