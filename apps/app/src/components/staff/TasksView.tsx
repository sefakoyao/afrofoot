import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALE_LABELS, TIME_ZONE, isLocale } from '@afrofoot/i18n';
import { createTaskType, updateTaskType } from '@/app/actions/tasks';
import { IconPicker } from '@/components/events/EventTasks';
import { ResultBanner } from '@/components/ResultBanner';
import { TaskIcon } from '@/components/TaskIcon';
import type { Scope } from '@/lib/staff';
import { getSupabase } from '@/lib/supabase/server';
import { loadEventTasks, loadTaskTypes, taskName } from '@/lib/tasks';

/**
 * Teams & events → Tasks (migration 0062): the task types coaches add to games and training. Admins: built-in ones are
 * translated and can be hidden; the club's own can be renamed, given another icon, hidden or shown again. Coaches: the
 * tasks of their teams' next games and trainings (who does what, what is still open), the types, and a new type
 * (RLS: staff_add; only admins change types).
 */
export async function TasksView({ sp, scope }: { sp: Record<string, string | string[] | undefined>; scope: Scope }) {
  const admin = scope.area === 'admin';
  const [t, tc, locale, supabase] = await Promise.all([getTranslations('tasks'), getTranslations('coach'), getLocale(), getSupabase()]);
  if (!supabase) return null;
  const types = await loadTaskTypes(supabase, admin);
  const { data: used } = await supabase.from('event_tasks').select('task_type_id');
  const uses = new Map<string, number>();
  for (const u of (used ?? []) as { task_type_id: string }[]) uses.set(u.task_type_id, (uses.get(u.task_type_id) ?? 0) + 1);
  const back = <input type="hidden" name="back" value={`/${scope.area}/tasks`} />;
  const coming = admin ? null : await comingUp(scope, supabase);
  const tag = isLocale(locale) ? LOCALE_LABELS[locale].intl : 'en-GB';
  const when = new Intl.DateTimeFormat(tag, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });
  const typeOf = new Map(types.map((x) => [x.id, x]));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('adminTitle')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{admin ? t('adminLead') : t('pageCoachLead')}</p>
      </header>
      <div id="tasks" className="scroll-mt-4 empty:hidden"><ResultBanner ns="tasks" result={sp.result} /></div>

      {coming ? (
        <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="coming-h" data-coming-tasks>
          <h2 id="coming-h" className="font-display text-xl font-extrabold">{t('comingTitle')}</h2>
          <p className="mt-1 text-sm text-muted">{t('comingLead')}</p>
          {coming.length === 0 ? <p className="mt-3 text-muted">{t('comingNone')}</p> : (
            <ul className="mt-3 grid gap-3">
              {coming.map((e) => {
                const open = e.tasks.filter((x) => !x.player_id).length;
                return (
                  <li key={e.id} className="rounded-card bg-surface p-4" data-coming-event={e.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/coach/${e.kind === 'match' ? 'matches' : 'sessions'}/${e.id}#tasks`} className="font-semibold text-pitch underline underline-offset-2">
                        {when.format(new Date(e.at))} · <bdi>{e.kind === 'match' ? tc('vsOpponent', { opponent: e.title }) : e.title}</bdi></Link>
                      <span className="text-sm text-muted"><bdi>{e.team}</bdi> · {e.tasks.length ? t('openCount', { open, count: e.tasks.length }) : t('noTasksYet')}</span>
                    </div>
                    {e.tasks.length ? (
                      <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                        {e.tasks.map((x) => { const ty = typeOf.get(x.task_type_id); return (
                          <li key={x.id} className={`flex items-center gap-1.5 rounded-full py-1 ps-1.5 pe-3 ${x.player_id ? 'bg-raised' : 'bg-gold text-ink-950'}`} data-task-open={!x.player_id || undefined}>
                            <TaskIcon name={ty?.icon ?? 'ball'} className="size-4" /><span className="font-semibold">{taskName(t, ty)}</span>
                            <span>· {x.player_id ? <bdi>{e.names.get(x.player_id) ?? '–'}</bdi> : t('open')}</span>
                          </li>); })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="types-h">
        <h2 id="types-h" className="font-display text-xl font-extrabold">{t('typesTitle')}</h2>
        <ul className="mt-3 divide-y divide-line">
          {types.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-3 py-3" data-task-type={taskName(t, x)} data-active={x.active}>
              <span className={`grid size-11 shrink-0 place-items-center rounded-full ${x.active ? 'bg-accent text-on-accent' : 'bg-line text-muted'}`}><TaskIcon name={x.icon} className="size-6" /></span>
              {x.builtin || !admin ? (
                <span className="min-w-0 flex-1"><span className={`font-semibold ${x.active ? '' : 'text-muted line-through'}`}><bdi>{taskName(t, x)}</bdi></span>
                  {x.builtin ? <span className="ms-2 rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-muted">{t('builtin')}</span> : null}</span>
              ) : (
                <details className="min-w-0 flex-1">
                  <summary className={`cursor-pointer font-semibold ${x.active ? '' : 'text-muted line-through'}`}><bdi>{x.name}</bdi> <span className="text-sm font-normal text-pitch">{t('edit')}</span></summary>
                  <form action={updateTaskType} className="mt-3 grid gap-3">
                    {back}<input type="hidden" name="id" value={x.id} />
                    <label className="grid gap-1 text-sm font-semibold sm:max-w-md">{t('newName')}
                      <input name="name" required minLength={2} maxLength={60} defaultValue={x.name} dir="auto" className="min-h-10 rounded-control border border-line bg-raised px-3 font-normal" /></label>
                    <IconPicker legend={t('icon')} value={x.icon} />
                    <button className="min-h-10 justify-self-start rounded-full bg-accent px-5 font-bold text-on-accent">{t('save')}</button>
                  </form>
                </details>
              )}
              <span className="text-xs text-muted">{t('uses', { count: uses.get(x.id) ?? 0 })}</span>
              {admin ? <form action={updateTaskType}>
                {back}<input type="hidden" name="id" value={x.id} /><input type="hidden" name="active" value={x.active ? 'false' : 'true'} />
                <button className={x.active ? 'min-h-10 rounded-full border border-danger px-3 text-sm font-bold text-danger hover:bg-danger/10' : 'min-h-10 rounded-full border-2 border-fg px-3 text-sm font-bold'}>{x.active ? t('hide') : t('show')}</button>
              </form> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="newtype-h">
        <h2 id="newtype-h" className="font-display text-xl font-extrabold">{t('newTask')}</h2>
        <form action={createTaskType} className="mt-3 grid gap-3" data-new-type>
          {back}
          <label className="grid gap-1 text-sm font-semibold sm:max-w-md">{t('newName')}
            <input name="name" required minLength={2} maxLength={60} placeholder={t('newNameEg')} dir="auto" className="min-h-10 rounded-control border border-line bg-raised px-3 font-normal" /></label>
          <IconPicker legend={t('icon')} />
          <button className="min-h-10 justify-self-start rounded-full bg-accent px-5 font-display font-bold text-on-accent hover:brightness-110">{t('addType')}</button>
        </form>
      </section>
    </div>
  );
}

type Coming = { id: string; kind: 'match' | 'session'; title: string; at: string; team: string; tasks: Awaited<ReturnType<typeof loadEventTasks>>; names: Map<string, string> };

/** A coach's next 14 days of games and trainings, with their tasks and who took them. */
async function comingUp(scope: Scope, db: NonNullable<Awaited<ReturnType<typeof getSupabase>>>): Promise<Coming[]> {
  const ids = (scope.teams ?? []).map((x) => x.id);
  if (!ids.length) return [];
  const teamName = new Map((scope.teams ?? []).map((x) => [x.id, x.name]));
  const now = new Date().toISOString(), until = new Date(Date.now() + 14 * 86400000).toISOString();
  const [{ data: games }, { data: sessions }] = await Promise.all([
    db.from('matches').select('id, opponent, kickoff_at, team_season_id').in('team_season_id', ids).neq('status', 'cancelled').gte('kickoff_at', now).lte('kickoff_at', until),
    db.from('training_sessions').select('id, title, starts_at, team_season_id').in('team_season_id', ids).neq('status', 'cancelled').gte('starts_at', now).lte('starts_at', until),
  ]);
  const g = (games ?? []) as { id: string; opponent: string; kickoff_at: string; team_season_id: string }[];
  const s = (sessions ?? []) as { id: string; title: string; starts_at: string; team_season_id: string }[];
  const tasks = await loadEventTasks(db, g.map((x) => x.id), s.map((x) => x.id));
  const pids = [...new Set(tasks.map((x) => x.player_id).filter((x): x is string => !!x))];
  const { data: people } = pids.length ? await db.from('players').select('id, first_name, last_name').in('id', pids) : { data: [] };
  const names = new Map(((people ?? []) as { id: string; first_name: string; last_name: string }[]).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  return [
    ...g.map((x) => ({ id: x.id, kind: 'match' as const, title: x.opponent, at: x.kickoff_at, team: teamName.get(x.team_season_id) ?? '', tasks: tasks.filter((k) => k.match_id === x.id), names })),
    ...s.map((x) => ({ id: x.id, kind: 'session' as const, title: x.title, at: x.starts_at, team: teamName.get(x.team_season_id) ?? '', tasks: tasks.filter((k) => k.session_id === x.id), names })),
  ].sort((a, b) => a.at.localeCompare(b.at));
}
