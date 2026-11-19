-- 0059 The club's shirt numbers and releasing a number (release 0.50.0).
-- The club only has shirts with some numbers (e.g. 1–39). Admin → Shirt numbers keeps that list in site_settings
-- 'shirts' {numbers: [...]}; without it every number 1–99 counts. Players can only ask for, and staff only give,
-- numbers from the list (also on the admin team page: a trigger on team_players). A number already worn outside the
-- list stays until it is released, and shows as "not in the club's numbers".
-- release_shirt_number(): an admin, or the team's coach (never for themselves), takes a number back from a player.

create function app.shirt_set() returns int[] language sql stable security definer set search_path = public as $$
  select coalesce(
    (select array_agg(distinct n order by n) from site_settings s, jsonb_array_elements_text(s.value -> 'numbers') e(v), lateral (select e.v::int as n) x
      where s.key = 'shirts' and x.n between 1 and 99),
    array(select generate_series(1, 99)))
$$;

-- squad numbers outside the club's list are refused when they are given or changed (an existing one may stay)
create function app.shirt_in_set() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.jersey_number is not null and (tg_op = 'INSERT' or new.jersey_number is distinct from old.jersey_number)
     and not (new.jersey_number = any (app.shirt_set())) then
    raise exception 'shirt number % is not one of the club''s numbers', new.jersey_number using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger shirt_in_set before insert or update of jersey_number on team_players for each row execute function app.shirt_in_set();

-- The grid: the club's numbers, plus any number worn outside them (in_set false), so it can be released.
drop function public.shirt_numbers(uuid);
create function public.shirt_numbers(p_ts uuid) returns table (number int, player_id uuid, player_name text, requests int, mine_requested boolean, free boolean, in_set boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_set int[] := app.shirt_set();
begin
  if not (app.is_admin() or app.coaches_ts(p_ts) or exists (select 1 from team_players where team_season_id = p_ts and player_id = app.my_player_id() and left_on is null)) then
    raise exception 'not your team' using errcode = '42501';
  end if;
  return query
  select n, tp.player_id, case when tp.player_id is null then null else p.first_name || ' ' || p.last_name end,
         (select count(*)::int from jersey_requests r where r.team_season_id = p_ts and r.number = n and r.status = 'pending'),
         exists (select 1 from jersey_requests r where r.team_season_id = p_ts and r.number = n and r.status = 'pending' and r.player_id = app.my_player_id()),
         tp.player_id is null and n = any (v_set),
         n = any (v_set)
  from (select unnest(v_set) as n
        union select jersey_number from team_players where team_season_id = p_ts and left_on is null and jersey_number is not null) nums
  left join team_players tp on tp.team_season_id = p_ts and tp.jersey_number = nums.n and tp.left_on is null
  left join players p on p.id = tp.player_id
  order by n;
end $$;
revoke all on function public.shirt_numbers(uuid) from public, anon;
grant execute on function public.shirt_numbers(uuid) to authenticated;

-- Asking for a number outside the club's list is refused (the rest as in 0057).
create or replace function public.request_shirt_number(p_ts uuid, p_number int, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_player uuid := app.my_player_id(); v_id uuid;
begin
  if v_player is null or not app.is_active() then raise exception 'members only' using errcode = '42501'; end if;
  if not exists (select 1 from team_players where team_season_id = p_ts and player_id = v_player and left_on is null) then raise exception 'not your team' using errcode = '42501'; end if;
  if p_number is null or not (p_number = any (app.shirt_set())) then raise exception 'not one of the club''s numbers' using errcode = '22023'; end if;
  if exists (select 1 from team_players where team_season_id = p_ts and jersey_number = p_number and left_on is null) then raise exception 'number taken' using errcode = '23505'; end if;
  update jersey_requests set status = 'withdrawn', decided_at = now() where team_season_id = p_ts and player_id = v_player and status = 'pending';
  insert into jersey_requests (team_season_id, player_id, number, note) values (p_ts, v_player, p_number, nullif(trim(p_note), '')) returning id into v_id;
  return v_id;
end $$;

-- Takes a number back from a player (it becomes free if it is one of the club's numbers).
create function public.release_shirt_number(p_ts uuid, p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.can_decide_jersey(p_ts, p_player) then raise exception 'not allowed' using errcode = '42501'; end if;
  update team_players set jersey_number = null, updated_at = now() where team_season_id = p_ts and player_id = p_player and left_on is null and jersey_number is not null;
  if not found then raise exception 'no number to release' using errcode = '22023'; end if;
end $$;
revoke all on function public.release_shirt_number(uuid, uuid) from public, anon;
grant execute on function public.release_shirt_number(uuid, uuid) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.50.0','feature','The club''s shirt numbers, releasing a number',
  'Admin → Shirt numbers: set the numbers the club has shirts for (e.g. 1–39); players only see and ask for those. Admins and coaches can release a number from a player.','2026-11-19')
on conflict (version) do nothing;
