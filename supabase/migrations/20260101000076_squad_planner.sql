-- 0076 Squad planner (Admin and Coach → Squad planner). Release 0.82.0.
-- Plan a team's squad for a coming season: a formation, a starter and up to two back-ups per position (current players or
-- try-out / join applicants), and each current player's outlook for that season (confirmed, likely, unsure, leaving)
-- with a short note. A signed contract covering the season counts as confirmed by itself (the app reads the contracts).
-- Admins plan every team; coaches the teams they coach (any season). Players never see the plans. Plans are saved in one
-- step through public.save_squad_plan (no direct writes); every change is in the audit trail. Safe to run more than once.

create table if not exists squad_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  season_year smallint not null check (season_year between 2020 and 2100),
  formation text not null references formations(code),
  notes text check (char_length(notes) <= 2000),
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, season_year)
);
create table if not exists squad_plan_slots (
  plan_id uuid not null references squad_plans(id) on delete cascade,
  slot smallint not null check (slot between 1 and 11),
  depth smallint not null check (depth between 1 and 3),           -- 1 = starter, 2 and 3 = back-ups
  player_id uuid references players(id) on delete cascade,
  applicant_kind text check (applicant_kind in ('tryout', 'enrolment')),
  applicant_id uuid,
  primary key (plan_id, slot, depth),
  check ((player_id is not null) <> (applicant_kind is not null and applicant_id is not null)),
  check ((applicant_kind is null) = (applicant_id is null))
);
create table if not exists squad_plan_players (
  plan_id uuid not null references squad_plans(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  status text not null check (status in ('confirmed', 'likely', 'unsure', 'leaving')),
  note text check (char_length(note) <= 300),
  primary key (plan_id, player_id)
);

-- who may plan this team: admins, and the coaches of the team (in any season)
create or replace function app.plans_team(p_team uuid) returns boolean language sql stable security definer set search_path = public as $$
  select app.is_admin() or (app.is_coach() and exists (
    select 1 from team_staff t join staff_members s on s.id = t.staff_id join team_seasons ts on ts.id = t.team_season_id
    where s.profile_id = auth.uid() and ts.team_id = p_team))
$$;
revoke all on function app.plans_team(uuid) from public, anon;
grant execute on function app.plans_team(uuid) to authenticated;
-- for the app (the assistant's analysis): may the signed-in person plan this team
create or replace function public.can_plan_team(p_team uuid) returns boolean language sql stable security definer set search_path = public as $$ select app.plans_team(p_team) $$;
revoke all on function public.can_plan_team(uuid) from public, anon;
grant execute on function public.can_plan_team(uuid) to authenticated;

alter table squad_plans enable row level security;
alter table squad_plan_slots enable row level security;
alter table squad_plan_players enable row level security;
revoke all on squad_plans, squad_plan_slots, squad_plan_players from anon;
drop policy if exists planners_read on squad_plans;
create policy planners_read on squad_plans for select to authenticated using (app.plans_team(team_id));
drop policy if exists planners_read on squad_plan_slots;
create policy planners_read on squad_plan_slots for select to authenticated using (exists (select 1 from squad_plans p where p.id = plan_id and app.plans_team(p.team_id)));
drop policy if exists planners_read on squad_plan_players;
create policy planners_read on squad_plan_players for select to authenticated using (exists (select 1 from squad_plans p where p.id = plan_id and app.plans_team(p.team_id)));
-- removing a whole plan: admins and the team's coaches
drop policy if exists planners_delete on squad_plans;
create policy planners_delete on squad_plans for delete to authenticated using (app.plans_team(team_id));

drop trigger if exists audit on squad_plans;
create trigger audit after insert or update or delete on squad_plans for each row execute function app.audit();
drop trigger if exists audit on squad_plan_players;
create trigger audit after insert or update or delete on squad_plan_players for each row execute function app.audit();

/*
 * Save a whole plan in one step (insert or replace): the formation, the notes, the board and the players' outlook.
 *  p_slots:    [{slot, depth, player_id} | {slot, depth, applicant_kind, applicant_id}]
 *  p_statuses: [{player_id, status, note}]
 * Slots must exist in the formation; players must exist; applicants must be open try-out or join requests.
 */
create or replace function public.save_squad_plan(p_team uuid, p_year int, p_formation text, p_slots jsonb, p_statuses jsonb, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_plan uuid; v_size int; s jsonb;
begin
  if not app.plans_team(p_team) then raise exception 'only admins and the team''s coaches plan its squad' using errcode = '42501'; end if;
  if p_year not between 2020 and 2100 then raise exception 'season year' using errcode = '22023'; end if;
  select jsonb_array_length(slots) into v_size from formations where code = p_formation;
  if v_size is null then raise exception 'unknown formation' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_slots, '[]')) <> 'array' or jsonb_typeof(coalesce(p_statuses, '[]')) <> 'array' then raise exception 'plan format' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(p_slots, '[]')) > 33 or jsonb_array_length(coalesce(p_statuses, '[]')) > 200 then raise exception 'plan too large' using errcode = '22023'; end if;

  insert into squad_plans (team_id, season_year, formation, notes, updated_by)
  values (p_team, p_year, p_formation, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid())
  on conflict (team_id, season_year) do update set formation = excluded.formation, notes = excluded.notes, updated_by = auth.uid(), updated_at = now()
  returning id into v_plan;

  delete from squad_plan_slots where plan_id = v_plan;
  for s in select * from jsonb_array_elements(coalesce(p_slots, '[]')) loop
    if (s ->> 'slot')::int not between 1 and v_size then raise exception 'slot not in the formation' using errcode = '22023'; end if;
    if s ? 'applicant_id' then
      if coalesce(s ->> 'applicant_kind', '') = 'tryout' and not exists (select 1 from tryout_requests where id = (s ->> 'applicant_id')::uuid) then raise exception 'unknown applicant' using errcode = '22023'; end if;
      if coalesce(s ->> 'applicant_kind', '') = 'enrolment' and (to_regclass('public.player_enrolments') is null
         or not exists (select 1 from player_enrolments where id = (s ->> 'applicant_id')::uuid)) then raise exception 'unknown applicant' using errcode = '22023'; end if;
      insert into squad_plan_slots (plan_id, slot, depth, applicant_kind, applicant_id) values (v_plan, (s ->> 'slot')::int, (s ->> 'depth')::int, s ->> 'applicant_kind', (s ->> 'applicant_id')::uuid);
    else
      insert into squad_plan_slots (plan_id, slot, depth, player_id) values (v_plan, (s ->> 'slot')::int, (s ->> 'depth')::int, (s ->> 'player_id')::uuid);
    end if;
  end loop;

  delete from squad_plan_players where plan_id = v_plan;
  insert into squad_plan_players (plan_id, player_id, status, note)
  select v_plan, (x ->> 'player_id')::uuid, x ->> 'status', nullif(left(btrim(coalesce(x ->> 'note', '')), 300), '')
  from jsonb_array_elements(coalesce(p_statuses, '[]')) x
  on conflict (plan_id, player_id) do update set status = excluded.status, note = excluded.note;
  return v_plan;
end $$;
revoke all on function public.save_squad_plan(uuid, int, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_squad_plan(uuid, int, text, jsonb, jsonb, text) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.82.0','feature','Squad planner',
  'Plan next season''s squad: a formation with a starter and two back-ups per position, every player''s outlook (confirmed, likely, unsure, leaving; a signed contract counts as confirmed), try-out and join applicants as targets, the gaps per position, suggested players with the reasons, warnings and an analysis by the assistant. For admins and the team''s coaches.','2026-11-27')
on conflict (version) do nothing;
