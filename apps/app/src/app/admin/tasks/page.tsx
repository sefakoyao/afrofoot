import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { createTaskType, updateTaskType } from '@/app/actions/tasks';
import { IconPicker } from '@/components/events/EventTasks';
import { ResultBanner } from '@/components/ResultBanner';
import { TaskIcon } from '@/components/TaskIcon';
import { requireArea } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase/server';
import { loadTaskTypes, taskName } from '@/lib/tasks';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('tasks'))('adminTitle') };
}

/**
 * Admin → Teams & events → Tasks (migration 0062): the task types coaches add to games and training. Built-in ones are
 * translated and can be hidden; the club's own can be renamed, given another icon, hidden or shown again.
 */
export default async function TaskTypesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireArea('admin');
  const sp = await searchParams;
  const [t, supabase] = await Promise.all([getTranslations('tasks'), getSupabase()]);
  if (!supabase) return null;
  const types = await loadTaskTypes(supabase, true);
  const { data: used } = await supabase.from('event_tasks').select('task_type_id');
  const uses = new Map<string, number>();
  for (const u of (used ?? []) as { task_type_id: string }[]) uses.set(u.task_type_id, (uses.get(u.task_type_id) ?? 0) + 1);
  const back = <input type="hidden" name="back" value="/admin/tasks" />;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <header>
        <h1 className="font-display text-2xl font-extrabold">{t('adminTitle')}</h1>
        <p className="mt-1 max-w-3xl text-muted">{t('adminLead')}</p>
      </header>
      <div id="tasks" className="scroll-mt-4 empty:hidden"><ResultBanner ns="tasks" result={sp.result} /></div>

      <section className="rounded-card border border-line bg-raised p-6" aria-labelledby="types-h">
        <h2 id="types-h" className="font-display text-xl font-extrabold">{t('typesTitle')}</h2>
        <ul className="mt-3 divide-y divide-line">
          {types.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-3 py-3" data-task-type={taskName(t, x)} data-active={x.active}>
              <span className={`grid size-11 shrink-0 place-items-center rounded-full ${x.active ? 'bg-accent text-on-accent' : 'bg-line text-muted'}`}><TaskIcon name={x.icon} className="size-6" /></span>
              {x.builtin ? (
                <span className="min-w-0 flex-1"><span className={`font-semibold ${x.active ? '' : 'text-muted line-through'}`}>{taskName(t, x)}</span>
                  <span className="ms-2 rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-muted">{t('builtin')}</span></span>
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
              <form action={updateTaskType}>
                {back}<input type="hidden" name="id" value={x.id} /><input type="hidden" name="active" value={x.active ? 'false' : 'true'} />
                <button className={x.active ? 'min-h-10 rounded-full border border-danger px-3 text-sm font-bold text-danger hover:bg-danger/10' : 'min-h-10 rounded-full border-2 border-fg px-3 text-sm font-bold'}>{x.active ? t('hide') : t('show')}</button>
              </form>
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
