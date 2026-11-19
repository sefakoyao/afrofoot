import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Game-day and training tasks (migration 0062). */
export type TaskType = { id: string; builtin: string | null; name: string; icon: string; active: boolean; position: number };
export type EventTask = { id: string; match_id: string | null; session_id: string | null; task_type_id: string; player_id: string | null; note: string | null };

/** The club's task types: built-in ones first (in their order), then the club's own A–Z. */
export async function loadTaskTypes(db: SupabaseClient, includeHidden = false): Promise<TaskType[]> {
  let q = db.from('task_types').select('id, builtin, name, icon, active, position');
  if (!includeHidden) q = q.eq('active', true);
  const { data } = await q;
  return ((data ?? []) as TaskType[]).sort((a, b) => Number(!!b.builtin) - Number(!!a.builtin) || a.position - b.position || a.name.localeCompare(b.name));
}

/** The tasks of some games and training sessions (RLS: their team's players, coaches and admins), in the order added. */
export async function loadEventTasks(db: SupabaseClient, matchIds: string[], sessionIds: string[]): Promise<EventTask[]> {
  const cols = 'id, match_id, session_id, task_type_id, player_id, note, created_at';
  const [m, s] = await Promise.all([
    matchIds.length ? db.from('event_tasks').select(cols).in('match_id', matchIds) : Promise.resolve({ data: [] }),
    sessionIds.length ? db.from('event_tasks').select(cols).in('session_id', sessionIds) : Promise.resolve({ data: [] }),
  ]);
  return ([...(m.data ?? []), ...(s.data ?? [])] as (EventTask & { created_at: string })[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** A type's name: built-in ones in the reader's language (tasks.type_<key>), the club's own as typed. */
export function taskName(t: (key: string) => string, type: Pick<TaskType, 'builtin' | 'name'> | undefined): string {
  if (!type) return '–';
  return type.builtin ? t(`type_${type.builtin}`) : type.name;
}
