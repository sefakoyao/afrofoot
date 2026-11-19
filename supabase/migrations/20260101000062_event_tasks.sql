-- 0062 Game-day and training-day tasks (release 0.53.0). Safe to run again.
-- Jobs around a game or a training session, each with an icon: bring the balls, the water, the first-aid kit, wash the
-- kit, drive… The club keeps a list of task types (task_types: ten built in, coaches and admins add more). On a game or
-- training the coach adds tasks and gives each to a player, or leaves it open: a player of the team takes an open task
-- ("I'll do it") or gives back their own ("I can't do it") through claim_event_task / release_event_task.
-- Who sees the tasks of an event: its team's players, its coaches and admins. Who changes them: its coaches and admins.

-- the icons the app can draw (components/TaskIcon.tsx)
create or replace function app.task_icon_ok(p text) returns boolean language sql immutable as $$
  select p in ('ball', 'water', 'first_aid', 'shirt', 'bib', 'cone', 'car', 'whistle', 'camera', 'snack', 'flag', 'bag', 'key', 'clipboard', 'star', 'music')
$$;

create table if not exists task_types (
  id uuid primary key default gen_random_uuid(),
  -- built-in types have a key (their name is translated in the app); a type added by the club has its name as typed
  builtin text unique check (builtin is null or builtin ~ '^[a-z_]{2,30}$'),
  name text not null check (char_length(name) between 2 and 60 and name = btrim(name)),
  icon text not null check (app.task_icon_ok(icon)),
  position int not null default 100,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists task_types_name_key on task_types (lower(name));
alter table task_types enable row level security;
revoke all on task_types from anon;
drop policy if exists members_read on task_types;
create policy members_read on task_types for select to authenticated using (app.is_active());
-- coaches and admins add a type; only admins change or hide one (built-in names and keys stay as they are)
drop policy if exists staff_add on task_types;
create policy staff_add on task_types for insert to authenticated with check ((app.is_admin() or app.is_coach()) and builtin is null);
drop policy if exists admin_change on task_types;
create policy admin_change on task_types for update to authenticated using (app.is_admin()) with check (app.is_admin());
drop trigger if exists audit on task_types;
create trigger audit after insert or update or delete on task_types for each row execute function app.audit();

insert into task_types (builtin, name, icon, position) values
  ('balls', 'Bring the balls', 'ball', 10),
  ('water', 'Bring the water', 'water', 20),
  ('first_aid', 'First-aid kit', 'first_aid', 30),
  ('wash_kit', 'Wash the kit', 'shirt', 40),
  ('bibs', 'Bring the bibs', 'bib', 50),
  ('cones', 'Set up the cones', 'cone', 60),
  ('carpool', 'Drive / carpool', 'car', 70),
  ('referee', 'Referee', 'whistle', 80),
  ('photos', 'Take photos', 'camera', 90),
  ('snacks', 'Fruit and snacks', 'snack', 100)
on conflict (builtin) do nothing;

create table if not exists event_tasks (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  session_id uuid references training_sessions(id) on delete cascade,
  task_type_id uuid not null references task_types(id) on delete restrict,
  player_id uuid references players(id) on delete set null,   -- null: open, anyone in the team can take it
  note text check (note is null or char_length(note) between 1 and 120),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(match_id, session_id) = 1)
);
create index if not exists event_tasks_match on event_tasks (match_id) where match_id is not null;
create index if not exists event_tasks_session on event_tasks (session_id) where session_id is not null;
create index if not exists event_tasks_player on event_tasks (player_id) where player_id is not null;

-- the team (team_season) of a task's game or training
create or replace function app.task_ts(p_match uuid, p_session uuid) returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select team_season_id from matches where id = p_match), (select team_season_id from training_sessions where id = p_session))
$$;
create or replace function app.in_team_now(p_ts uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_players where team_season_id = p_ts and player_id = app.my_player_id() and left_on is null)
$$;
-- a task's player must be in the event's team
create or replace function app.event_task_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.player_id is not null and not exists (select 1 from team_players where team_season_id = app.task_ts(new.match_id, new.session_id) and player_id = new.player_id and left_on is null) then
    raise exception 'the player is not in this team' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists event_task_guard on event_tasks;
create trigger event_task_guard before insert or update on event_tasks for each row execute function app.event_task_guard();

alter table event_tasks enable row level security;
revoke all on event_tasks from anon;
drop policy if exists team_read on event_tasks;
create policy team_read on event_tasks for select to authenticated
  using (app.is_admin() or app.coaches_ts(app.task_ts(match_id, session_id)) or app.in_team_now(app.task_ts(match_id, session_id)));
drop policy if exists staff_write on event_tasks;
create policy staff_write on event_tasks for all to authenticated
  using (app.is_admin() or app.coaches_ts(app.task_ts(match_id, session_id)))
  with check (app.is_admin() or app.coaches_ts(app.task_ts(match_id, session_id)));
drop trigger if exists audit on event_tasks;
create trigger audit after insert or update or delete on event_tasks for each row execute function app.audit();

-- "I'll do it": a player of the team takes an open task of an event that has not started
create or replace function public.claim_event_task(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_player uuid := app.my_player_id(); k event_tasks; v_start timestamptz;
begin
  if v_player is null or not app.is_active() then raise exception 'members only' using errcode = '42501'; end if;
  select * into k from event_tasks where id = p_task for update;
  if k.id is null or not app.in_team_now(app.task_ts(k.match_id, k.session_id)) then raise exception 'not your team' using errcode = '42501'; end if;
  select coalesce((select kickoff_at from matches where id = k.match_id), (select starts_at from training_sessions where id = k.session_id)) into v_start;
  if v_start <= now() then raise exception 'the event has started' using errcode = '22023'; end if;
  if k.player_id is not null then raise exception 'already taken' using errcode = '23505'; end if;
  update event_tasks set player_id = v_player where id = p_task;
end $$;
revoke all on function public.claim_event_task(uuid) from public, anon;
grant execute on function public.claim_event_task(uuid) to authenticated;

-- "I can't do it": a player gives back their own task (it is open again) before the event starts
create or replace function public.release_event_task(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_player uuid := app.my_player_id(); k event_tasks; v_start timestamptz;
begin
  select * into k from event_tasks where id = p_task for update;
  if k.id is null or v_player is null or k.player_id is distinct from v_player then raise exception 'not your task' using errcode = '42501'; end if;
  select coalesce((select kickoff_at from matches where id = k.match_id), (select starts_at from training_sessions where id = k.session_id)) into v_start;
  if v_start <= now() then raise exception 'the event has started' using errcode = '22023'; end if;
  update event_tasks set player_id = null where id = p_task;
end $$;
revoke all on function public.release_event_task(uuid) from public, anon;
grant execute on function public.release_event_task(uuid) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.53.0','feature','Game-day and training tasks, menu icons',
  'Coaches add tasks to a game or training (balls, water, first-aid kit, washing the kit, driving…), give them to players or leave them open; players take open tasks in their calendar. Coaches and admins can add new tasks. The Admin, Coach and Player menus have icons.','2026-11-20')
on conflict (version) do nothing;
