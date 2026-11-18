-- 0057 Shirt number requests (release 0.47.0).
-- A player asks for a free squad number in their team for the season; the team's coach or an admin approves or declines.
-- Approving writes the number to team_players.jersey_number (unique per team and season, migration 0002), so it is no
-- longer free; other open requests for the same number in that team are declined automatically. A player who already
-- had a number gets the new one and the old one is free again. Nobody approves their own request (a player-coach).
-- shirt_numbers(team_season) lists 1–99 for a team: who has it, how many open requests, free.

create table jersey_requests (
  id uuid primary key default gen_random_uuid(),
  team_season_id uuid not null references team_seasons(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  number int not null check (number between 1 and 99),
  note text check (note is null or char_length(note) between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) between 1 and 200),
  created_at timestamptz not null default now()
);
create unique index jersey_requests_one_open on jersey_requests (team_season_id, player_id) where status = 'pending';
create index on jersey_requests (team_season_id, status);
alter table jersey_requests enable row level security;
-- reads: the player (own requests), the team's coaches, admins; writes only through the functions below
create policy own_read on jersey_requests for select to authenticated using (player_id = app.my_player_id());
create policy staff_read on jersey_requests for select to authenticated using (app.is_admin() or app.coaches_ts(team_season_id));
revoke all on jersey_requests from anon;
create trigger audit after insert or update or delete on jersey_requests for each row execute function app.audit();

-- Who may decide for a team: an admin, or a coach of that team; never for their own request.
create function app.can_decide_jersey(p_ts uuid, p_player uuid) returns boolean language sql stable security definer set search_path = public as
$$ select (app.is_admin() or app.coaches_ts(p_ts)) and p_player is distinct from app.my_player_id() $$;

-- Numbers 1–99 of one team for the season: who wears it, open requests, and whether it is free.
-- For the team's players, its coaches and admins (teammates already see each other's numbers in team_roster).
create function public.shirt_numbers(p_ts uuid) returns table (number int, player_id uuid, player_name text, requests int, mine_requested boolean, free boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not (app.is_admin() or app.coaches_ts(p_ts) or exists (select 1 from team_players where team_season_id = p_ts and player_id = app.my_player_id() and left_on is null)) then
    raise exception 'not your team' using errcode = '42501';
  end if;
  return query
  select n, tp.player_id, case when tp.player_id is null then null else p.first_name || ' ' || p.last_name end,
         (select count(*)::int from jersey_requests r where r.team_season_id = p_ts and r.number = n and r.status = 'pending'),
         exists (select 1 from jersey_requests r where r.team_season_id = p_ts and r.number = n and r.status = 'pending' and r.player_id = app.my_player_id()),
         tp.player_id is null
  from generate_series(1, 99) n
  left join team_players tp on tp.team_season_id = p_ts and tp.jersey_number = n and tp.left_on is null
  left join players p on p.id = tp.player_id
  order by n;
end $$;
revoke all on function public.shirt_numbers(uuid) from public, anon;
grant execute on function public.shirt_numbers(uuid) to authenticated;

-- A player asks for a free number in one of their teams; an open request of theirs for that team is replaced.
create function public.request_shirt_number(p_ts uuid, p_number int, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_player uuid := app.my_player_id(); v_id uuid;
begin
  if v_player is null or not app.is_active() then raise exception 'members only' using errcode = '42501'; end if;
  if not exists (select 1 from team_players where team_season_id = p_ts and player_id = v_player and left_on is null) then raise exception 'not your team' using errcode = '42501'; end if;
  if p_number is null or p_number not between 1 and 99 then raise exception 'number 1–99' using errcode = '22023'; end if;
  if exists (select 1 from team_players where team_season_id = p_ts and jersey_number = p_number and left_on is null) then raise exception 'number taken' using errcode = '23505'; end if;
  update jersey_requests set status = 'withdrawn', decided_at = now() where team_season_id = p_ts and player_id = v_player and status = 'pending';
  insert into jersey_requests (team_season_id, player_id, number, note) values (p_ts, v_player, p_number, nullif(trim(p_note), '')) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_shirt_number(uuid, int, text) from public, anon;
grant execute on function public.request_shirt_number(uuid, int, text) to authenticated;

create function public.withdraw_shirt_request(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update jersey_requests set status = 'withdrawn', decided_at = now() where id = p_request and player_id = app.my_player_id() and status = 'pending';
  if not found then raise exception 'no open request' using errcode = '22023'; end if;
end $$;
revoke all on function public.withdraw_shirt_request(uuid) from public, anon;
grant execute on function public.withdraw_shirt_request(uuid) to authenticated;

-- Approve: the number becomes the player's squad number; others asking for it are declined. Decline: with an optional reason.
create function public.decide_shirt_request(p_request uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r jersey_requests;
begin
  select * into r from jersey_requests where id = p_request for update;
  if r.id is null or r.status <> 'pending' then raise exception 'no open request' using errcode = '22023'; end if;
  if not app.can_decide_jersey(r.team_season_id, r.player_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_approve then
    if exists (select 1 from team_players where team_season_id = r.team_season_id and jersey_number = r.number and left_on is null and player_id <> r.player_id) then
      raise exception 'number taken' using errcode = '23505';
    end if;
    update team_players set jersey_number = r.number, updated_at = now() where team_season_id = r.team_season_id and player_id = r.player_id and left_on is null;
    if not found then raise exception 'player not in the team' using errcode = '22023'; end if;
    update jersey_requests set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '') where id = r.id;
    -- declined without a note: the player's page says the number went to someone else (in their language)
    update jersey_requests set status = 'declined', decided_by = auth.uid(), decided_at = now(), decision_note = null
     where team_season_id = r.team_season_id and number = r.number and status = 'pending' and id <> r.id;
  else
    update jersey_requests set status = 'declined', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '') where id = r.id;
  end if;
end $$;
revoke all on function public.decide_shirt_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_shirt_request(uuid, boolean, text) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.47.0','feature','Shirt number requests',
  'Players ask for a free squad number in their team (My profile); the coach or an admin approves or declines. Approved numbers are no longer free. Admin → Teams & events → Shirt numbers lists the free numbers of every team for a season.','2026-11-18')
on conflict (version) do nothing;
