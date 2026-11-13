-- 0014 Training schedule (recurring), admin-only player ratings, match MVP voting (results published 24 h after the match),
--      player profile completion (photo required).

-- ===== Training schedule =====
create table training_schedules (
  id uuid primary key default gen_random_uuid(),
  team_season_id uuid not null references team_seasons(id) on delete restrict,
  program_id uuid references training_programs(id) on delete set null,
  location_id uuid references locations(id) on delete set null,
  title text not null check (char_length(title) between 2 and 120),
  focus text,
  weekday int not null check (weekday between 1 and 7),           -- ISO: 1 = Monday
  start_time time not null,
  duration_min int not null check (duration_min between 15 and 240),
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index on training_schedules (team_season_id);
create trigger touch before update on training_schedules for each row execute function app.touch_updated_at();
alter table training_sessions add column schedule_id uuid references training_schedules(id) on delete set null;
create unique index training_sessions_schedule_slot on training_sessions (schedule_id, starts_at) where schedule_id is not null;

-- Creates the sessions of a weekly schedule up to p_until (max 120 days ahead). Idempotent; returns how many were created.
create function public.generate_training_sessions(p_schedule uuid, p_until date) returns int language plpgsql security definer set search_path = public as $$
declare sch training_schedules; d date; n int := 0; c int;
begin
  select * into sch from training_schedules where id = p_schedule;
  if sch.id is null then raise exception 'Unknown schedule' using errcode = '22023'; end if;
  if auth.uid() is not null and not (app.is_admin() or app.coaches_ts(sch.team_season_id)) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if not sch.active then return 0; end if;
  p_until := least(p_until, current_date + 120, coalesce(sch.ends_on, current_date + 120));
  for d in select g::date from generate_series(greatest(sch.starts_on, current_date), p_until, interval '1 day') g loop
    if extract(isodow from d) = sch.weekday then
      insert into training_sessions (team_season_id, program_id, location_id, title, focus, starts_at, ends_at, schedule_id)
      values (sch.team_season_id, sch.program_id, sch.location_id, sch.title, sch.focus,
              (d + sch.start_time) at time zone 'Europe/Helsinki', (d + sch.start_time) at time zone 'Europe/Helsinki' + make_interval(mins => sch.duration_min), sch.id)
      on conflict (schedule_id, starts_at) where schedule_id is not null do nothing;
      get diagnostics c = row_count; n := n + c;
    end if;
  end loop;
  return n;
end $$;
grant execute on function public.generate_training_sessions(uuid, date) to authenticated;

alter table training_schedules enable row level security;
create policy admin_all on training_schedules for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy coach_all on training_schedules for all to authenticated using (app.coaches_ts(team_season_id)) with check (app.coaches_ts(team_season_id));
create policy team_read on training_schedules for select to authenticated using (app.in_team_ts(team_season_id));
create trigger audit after insert or update or delete on training_schedules for each row execute function app.audit();

-- ===== Player ratings (administrators only) =====
create table player_ratings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete restrict,
  season_id uuid not null references seasons(id) on delete restrict,
  match_id uuid references matches(id) on delete set null,
  category text not null default 'overall' check (category in ('overall','technical','tactical','physical','attitude')),
  score numeric(3,1) not null check (score between 1 and 10),
  note text check (char_length(note) <= 1000),
  rated_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index on player_ratings (player_id, season_id);
alter table player_ratings enable row level security;
create policy admin_all on player_ratings for all to authenticated using (app.is_admin()) with check (app.is_admin());
create trigger audit after insert or update or delete on player_ratings for each row execute function app.audit('redact');
create view player_rating_summary with (security_invoker = true) as
select player_id, season_id, category, round(avg(score), 1) as average, count(*) as ratings from player_ratings group by 1, 2, 3;
grant select on player_rating_summary to authenticated;

-- ===== Match MVP =====
alter table matches add column completed_at timestamptz, add column mvp_reminders_sent int not null default 0;
create function app.stamp_completed() returns trigger language plpgsql as $$
begin
  if new.status = 'played' and new.completed_at is null and (tg_op = 'INSERT' or old.status is distinct from 'played') then new.completed_at := now(); end if;
  if new.status <> 'played' then new.completed_at := null; new.mvp_reminders_sent := 0; end if;
  return new;
end $$;
create trigger stamp_completed before insert or update on matches for each row execute function app.stamp_completed();
update matches set completed_at = kickoff_at + interval '2 hours' where status = 'played' and completed_at is null;

create table mvp_votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  voter_player_id uuid not null references players(id) on delete cascade default app.my_player_id(),
  candidate_player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (match_id, voter_player_id),
  check (voter_player_id <> candidate_player_id)
);
create index on mvp_votes (match_id, candidate_player_id);
create function app.check_mvp_vote() returns trigger language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = new.match_id;
  if m.completed_at is null then raise exception 'Voting opens when the match is finished' using errcode = '23514'; end if;
  if now() >= m.completed_at + interval '24 hours' then raise exception 'Voting is closed' using errcode = '23514'; end if;
  if not exists (select 1 from match_squad where match_id = new.match_id and player_id = new.voter_player_id and status <> 'not_selected') then
    raise exception 'Only players who were in the match squad can vote' using errcode = '42501'; end if;
  if not exists (select 1 from match_squad where match_id = new.match_id and player_id = new.candidate_player_id and status <> 'not_selected') then
    raise exception 'The candidate was not in the match squad' using errcode = '23514'; end if;
  return new;
end $$;
create trigger check_vote before insert or update on mvp_votes for each row execute function app.check_mvp_vote();
alter table mvp_votes enable row level security;
create policy own_read   on mvp_votes for select to authenticated using (voter_player_id = app.my_player_id());
create policy own_insert on mvp_votes for insert to authenticated with check (voter_player_id = app.my_player_id());
create policy own_update on mvp_votes for update to authenticated using (voter_player_id = app.my_player_id()) with check (voter_player_id = app.my_player_id());
create policy admin_read on mvp_votes for select to authenticated using (app.is_admin());
create policy admin_delete on mvp_votes for delete to authenticated using (app.is_admin());
create trigger audit after insert or update or delete on mvp_votes for each row execute function app.audit('redact');

-- Results exist only 24 h after the match; before that nobody (not even coaches) sees the count.
create function public.mvp_result(p_match uuid) returns table (player_id uuid, votes int, is_winner boolean) language plpgsql stable security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  if m.id is null or m.completed_at is null or now() < m.completed_at + interval '24 hours' then return; end if;
  if not (app.is_admin() or app.coaches_ts(m.team_season_id) or app.in_team_ts(m.team_season_id)) then return; end if;
  return query select v.candidate_player_id, count(*)::int, count(*) = max(count(*)) over () from mvp_votes v where v.match_id = p_match group by v.candidate_player_id order by 2 desc;
end $$;
grant execute on function public.mvp_result(uuid) to authenticated;

create view public_mvp as
select r.match_id, case when p.show_publicly then p.first_name || ' ' || p.last_name else 'Player #' || coalesce(s.shirt_number::text, '?') end as player_label, r.votes
from (select v.match_id, v.candidate_player_id, count(*)::int as votes, rank() over (partition by v.match_id order by count(*) desc) as rnk from mvp_votes v group by 1, 2) r
join matches m on m.id = r.match_id and m.completed_at + interval '24 hours' <= now()
join team_seasons ts on ts.id = m.team_season_id and ts.is_public
join players p on p.id = r.candidate_player_id
left join match_squad s on s.match_id = r.match_id and s.player_id = r.candidate_player_id
where r.rnk = 1;
grant select on public_mvp to anon, authenticated;

-- Reminders: called by the scheduled job (service role) or an admin. One reminder right after the match, one 12 h later, to squad players who have not voted yet.
create function public.send_mvp_reminders() returns int language plpgsql security definer set search_path = public as $$
declare m record; stage int; n int := 0; c int;
begin
  if auth.uid() is not null and not app.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  for m in select * from matches where completed_at is not null and now() < completed_at + interval '24 hours' loop
    stage := case when now() >= m.completed_at + interval '12 hours' then 2 else 1 end;
    continue when m.mvp_reminders_sent >= stage;
    insert into notifications (user_id, kind, title, body, link)
    select p.profile_id, 'mvp_vote', 'Vote for the match MVP', 'Voting closes 24 hours after the match.', '/matches/' || m.id || '/mvp'
    from match_squad s join players p on p.id = s.player_id
    where s.match_id = m.id and s.status <> 'not_selected' and p.profile_id is not null
      and not exists (select 1 from mvp_votes v where v.match_id = m.id and v.voter_player_id = s.player_id);
    get diagnostics c = row_count; n := n + c;
    update matches set mvp_reminders_sent = stage where id = m.id;
  end loop;
  return n;
end $$;
grant execute on function public.send_mvp_reminders() to authenticated;

-- ===== Player profile: photo required to complete it =====
alter table players
  add column profile_completed_at timestamptz,
  add constraint players_photo_path_format check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$');
create function app.check_profile_complete() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.profile_completed_at is not null and (tg_op = 'INSERT' or old.profile_completed_at is null) then
    if new.photo_path is null then raise exception 'A profile picture is required' using errcode = '23514'; end if;
    if new.date_of_birth is null or new.position is null then raise exception 'Date of birth and position are required' using errcode = '23514'; end if;
    if not exists (select 1 from player_private pp where pp.player_id = new.id and coalesce(trim(pp.phone), '') <> '') then
      raise exception 'A phone number is required' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
create trigger check_profile_complete before insert or update on players for each row execute function app.check_profile_complete();
do $$ begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'] where id = 'player-photos';
  end if;
end $$;
