-- 0012 Arabic, lineups (formations + pitch slots), live match events with automatic score and statistics.

-- ===== Arabic (ar) =====
create or replace function app.valid_translations(j jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(j) = 'object'
     and not exists (select 1 from jsonb_object_keys(j) k where k not in ('fi','fr','ar'))
     and not exists (select 1 from jsonb_each(j) e where jsonb_typeof(e.value) <> 'object')
$$;
alter table profiles          drop constraint profiles_locale_check,          add constraint profiles_locale_check          check (locale in ('en','fi','fr','ar'));
alter table contact_messages  drop constraint contact_messages_locale_check,  add constraint contact_messages_locale_check  check (locale in ('en','fi','fr','ar'));
alter table join_requests     drop constraint join_requests_locale_check,     add constraint join_requests_locale_check     check (locale in ('en','fi','fr','ar'));

-- ===== Formations (reference data used by the lineup builder; y: 0 = opponent goal, 100 = own goal) =====
create table formations (
  code text primary key,
  name text not null,
  slots jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) = 11),
  sort_order int not null default 100
);
insert into formations (code, name, slots, sort_order) values
  ('4-4-2','4-4-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":20.0,"y":72.0},{"slot":3,"role":"DF","x":40.0,"y":72.0},{"slot":4,"role":"DF","x":60.0,"y":72.0},{"slot":5,"role":"DF","x":80.0,"y":72.0},{"slot":6,"role":"MF","x":20.0,"y":44.0},{"slot":7,"role":"MF","x":40.0,"y":44.0},{"slot":8,"role":"MF","x":60.0,"y":44.0},{"slot":9,"role":"MF","x":80.0,"y":44.0},{"slot":10,"role":"FW","x":33.3,"y":16.0},{"slot":11,"role":"FW","x":66.7,"y":16.0}]',0),
  ('4-3-3','4-3-3','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":20.0,"y":72.0},{"slot":3,"role":"DF","x":40.0,"y":72.0},{"slot":4,"role":"DF","x":60.0,"y":72.0},{"slot":5,"role":"DF","x":80.0,"y":72.0},{"slot":6,"role":"MF","x":25.0,"y":44.0},{"slot":7,"role":"MF","x":50.0,"y":44.0},{"slot":8,"role":"MF","x":75.0,"y":44.0},{"slot":9,"role":"FW","x":25.0,"y":16.0},{"slot":10,"role":"FW","x":50.0,"y":16.0},{"slot":11,"role":"FW","x":75.0,"y":16.0}]',1),
  ('4-2-3-1','4-2-3-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":20.0,"y":72.0},{"slot":3,"role":"DF","x":40.0,"y":72.0},{"slot":4,"role":"DF","x":60.0,"y":72.0},{"slot":5,"role":"DF","x":80.0,"y":72.0},{"slot":6,"role":"MF","x":33.3,"y":53.3},{"slot":7,"role":"MF","x":66.7,"y":53.3},{"slot":8,"role":"MF","x":25.0,"y":34.7},{"slot":9,"role":"MF","x":50.0,"y":34.7},{"slot":10,"role":"MF","x":75.0,"y":34.7},{"slot":11,"role":"FW","x":50,"y":16.0}]',2),
  ('3-5-2','3-5-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":16.7,"y":44.0},{"slot":6,"role":"MF","x":33.3,"y":44.0},{"slot":7,"role":"MF","x":50.0,"y":44.0},{"slot":8,"role":"MF","x":66.7,"y":44.0},{"slot":9,"role":"MF","x":83.3,"y":44.0},{"slot":10,"role":"FW","x":33.3,"y":16.0},{"slot":11,"role":"FW","x":66.7,"y":16.0}]',3),
  ('3-4-3','3-4-3','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":20.0,"y":44.0},{"slot":6,"role":"MF","x":40.0,"y":44.0},{"slot":7,"role":"MF","x":60.0,"y":44.0},{"slot":8,"role":"MF","x":80.0,"y":44.0},{"slot":9,"role":"FW","x":25.0,"y":16.0},{"slot":10,"role":"FW","x":50.0,"y":16.0},{"slot":11,"role":"FW","x":75.0,"y":16.0}]',4),
  ('5-3-2','5-3-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":16.7,"y":72.0},{"slot":3,"role":"DF","x":33.3,"y":72.0},{"slot":4,"role":"DF","x":50.0,"y":72.0},{"slot":5,"role":"DF","x":66.7,"y":72.0},{"slot":6,"role":"DF","x":83.3,"y":72.0},{"slot":7,"role":"MF","x":25.0,"y":44.0},{"slot":8,"role":"MF","x":50.0,"y":44.0},{"slot":9,"role":"MF","x":75.0,"y":44.0},{"slot":10,"role":"FW","x":33.3,"y":16.0},{"slot":11,"role":"FW","x":66.7,"y":16.0}]',5),
  ('4-1-4-1','4-1-4-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":20.0,"y":72.0},{"slot":3,"role":"DF","x":40.0,"y":72.0},{"slot":4,"role":"DF","x":60.0,"y":72.0},{"slot":5,"role":"DF","x":80.0,"y":72.0},{"slot":6,"role":"MF","x":50,"y":53.3},{"slot":7,"role":"MF","x":20.0,"y":34.7},{"slot":8,"role":"MF","x":40.0,"y":34.7},{"slot":9,"role":"MF","x":60.0,"y":34.7},{"slot":10,"role":"MF","x":80.0,"y":34.7},{"slot":11,"role":"FW","x":50,"y":16.0}]',6),
  ('4-5-1','4-5-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":20.0,"y":72.0},{"slot":3,"role":"DF","x":40.0,"y":72.0},{"slot":4,"role":"DF","x":60.0,"y":72.0},{"slot":5,"role":"DF","x":80.0,"y":72.0},{"slot":6,"role":"MF","x":16.7,"y":44.0},{"slot":7,"role":"MF","x":33.3,"y":44.0},{"slot":8,"role":"MF","x":50.0,"y":44.0},{"slot":9,"role":"MF","x":66.7,"y":44.0},{"slot":10,"role":"MF","x":83.3,"y":44.0},{"slot":11,"role":"FW","x":50,"y":16.0}]',7);
alter table matches
  add column formation text references formations(code),
  add column live_state text not null default 'not_started' check (live_state in ('not_started','first_half','half_time','second_half','full_time')),
  add column live_started_at timestamptz;
alter table match_squad
  add column slot int check (slot between 1 and 11),
  add column captain boolean not null default false;
create unique index match_squad_slot on match_squad (match_id, slot) where slot is not null;
create unique index match_squad_one_captain on match_squad (match_id) where captain;

-- Lineup rules: only roster players, max 11 starters / 12 substitutes, locked for coaches once the match has kicked off.
create function app.check_squad() returns trigger language plpgsql security definer set search_path = public as $$
declare m matches; n int;
begin
  select * into m from matches where id = new.match_id;
  if not exists (select 1 from team_players tp where tp.team_season_id = m.team_season_id and tp.player_id = new.player_id and tp.left_on is null) then
    raise exception 'Player is not on the roster of this team' using errcode = '23514'; end if;
  if m.live_state <> 'not_started' and auth.uid() is not null and not app.is_admin() then
    raise exception 'The lineup is locked once the match has started' using errcode = '42501'; end if;
  if new.status <> 'starter' then new.slot := null; end if;
  if new.status = 'not_selected' then new.captain := false; end if;
  if new.status = 'starter' then
    select count(*) into n from match_squad where match_id = new.match_id and status = 'starter' and id is distinct from new.id;
    if n >= 11 then raise exception 'A lineup has at most 11 starters' using errcode = '23514'; end if;
  elsif new.status = 'substitute' then
    select count(*) into n from match_squad where match_id = new.match_id and status = 'substitute' and id is distinct from new.id;
    if n >= 12 then raise exception 'At most 12 substitutes' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
create trigger check_squad before insert or update on match_squad for each row execute function app.check_squad();

-- ===== Live match events =====
create type match_event_type as enum ('kickoff','half_time','second_half','full_time','goal','own_goal','penalty_scored','penalty_missed',
  'yellow_card','second_yellow','red_card','substitution','injury','note');
create table match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  type match_event_type not null,
  side text not null default 'us' check (side in ('us','opponent')),
  minute int not null default 0 check (minute between 0 and 130),
  added_minute int not null default 0 check (added_minute between 0 and 20),
  player_id uuid references players(id) on delete restrict,          -- scorer / carded / player coming ON
  assist_player_id uuid references players(id) on delete restrict,
  player_out_id uuid references players(id) on delete restrict,      -- substitution: player going OFF
  opponent_label text check (char_length(opponent_label) <= 80),    -- opponent events: shirt number or name
  note text check (char_length(note) <= 300),
  voided boolean not null default false,                             -- corrections void an event; nothing is deleted by coaches
  voided_by uuid references profiles(id) on delete set null, voided_at timestamptz,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (side = 'us' or (player_id is null and assist_player_id is null and player_out_id is null)),
  check (type in ('goal','penalty_scored') or assist_player_id is null),
  check (assist_player_id is null or assist_player_id <> player_id),
  check (type <> 'substitution' or side = 'opponent' or (player_id is not null and player_out_id is not null and player_id <> player_out_id)),
  check (type in ('substitution') or player_out_id is null),
  check (type not in ('goal','penalty_scored','own_goal','penalty_missed','yellow_card','second_yellow','red_card','injury') or side = 'opponent' or player_id is not null),
  check (type in ('goal','penalty_scored','own_goal','penalty_missed','yellow_card','second_yellow','red_card','injury','substitution') or (player_id is null and side = 'us'))
);
create index on match_events (match_id, minute, added_minute, created_at);
create index on match_events (player_id);

-- Validation: involved players must be in the squad; substitutions must make sense; no events after full time (except admins).
create function app.check_match_event() returns trigger language plpgsql security definer set search_path = public as $$
declare m matches; st squad_status; on_pitch boolean;
begin
  select * into m from matches where id = new.match_id;
  if m.status in ('cancelled','postponed') then raise exception 'Match is not being played' using errcode = '23514'; end if;
  if m.live_state = 'full_time' and auth.uid() is not null and not app.is_admin() then
    raise exception 'The match is finished; ask an administrator to correct it' using errcode = '42501'; end if;
  if new.player_id is not null then
    select status into st from match_squad where match_id = new.match_id and player_id = new.player_id;
    if st is null or st = 'not_selected' then raise exception 'Player is not in the match squad' using errcode = '23514'; end if;
    if new.type = 'substitution' and st <> 'substitute' then raise exception 'Only a substitute can come on' using errcode = '23514'; end if;
    if new.type = 'substitution' and exists (select 1 from match_events e where e.match_id = new.match_id and e.type = 'substitution' and e.player_id = new.player_id and not e.voided and e.id is distinct from new.id) then
      raise exception 'This substitute has already played' using errcode = '23514'; end if;
  end if;
  if new.assist_player_id is not null and not exists (select 1 from match_squad where match_id = new.match_id and player_id = new.assist_player_id and status <> 'not_selected') then
    raise exception 'Assisting player is not in the match squad' using errcode = '23514'; end if;
  if new.player_out_id is not null then
    select (s.status = 'starter' or exists (select 1 from match_events e where e.match_id = new.match_id and e.type = 'substitution' and e.player_id = s.player_id and not e.voided))
           and not exists (select 1 from match_events e where e.match_id = new.match_id and e.type = 'substitution' and e.player_out_id = s.player_id and not e.voided and e.id is distinct from new.id)
      into on_pitch from match_squad s where s.match_id = new.match_id and s.player_id = new.player_out_id;
    if coalesce(on_pitch, false) is false then raise exception 'The player going off is not on the pitch' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
create trigger check_event before insert or update on match_events for each row execute function app.check_match_event();

-- Statistics for a finished match, derived from events (idempotent; keeps manual ratings).
create function app.finalize_match_stats(p_match uuid) returns void language plpgsql security definer set search_path = public as $$
declare m matches; endmin int;
begin
  select * into m from matches where id = p_match;
  select greatest(90, coalesce(max(minute), 90)) into endmin from match_events where match_id = p_match and type = 'full_time' and not voided;
  insert into match_player_stats (match_id, player_id, minutes, goals, assists, yellow_cards, red_card, clean_sheet)
  select s.match_id, s.player_id,
    greatest(0, least(endmin, coalesce(
        (select min(e.minute) from match_events e where e.match_id = s.match_id and not e.voided and e.player_id = s.player_id and e.type in ('red_card','second_yellow')),
        (select e.minute from match_events e where e.match_id = s.match_id and not e.voided and e.type = 'substitution' and e.player_out_id = s.player_id limit 1), endmin))
      - case when s.status = 'starter' then 0 else coalesce((select e.minute from match_events e where e.match_id = s.match_id and not e.voided and e.type = 'substitution' and e.player_id = s.player_id limit 1), endmin) end),
    (select count(*) from match_events e where e.match_id = s.match_id and not e.voided and e.side = 'us' and e.type in ('goal','penalty_scored') and e.player_id = s.player_id),
    (select count(*) from match_events e where e.match_id = s.match_id and not e.voided and e.assist_player_id = s.player_id),
    least(2, (select count(*) from match_events e where e.match_id = s.match_id and not e.voided and e.type in ('yellow_card','second_yellow') and e.player_id = s.player_id)),
    exists (select 1 from match_events e where e.match_id = s.match_id and not e.voided and e.type in ('red_card','second_yellow') and e.player_id = s.player_id),
    (s.position = 'goalkeeper' and s.status = 'starter' and coalesce(m.goals_against, 0) = 0)
  from match_squad s where s.match_id = p_match and s.status <> 'not_selected'
  on conflict (match_id, player_id) do update set minutes = excluded.minutes, goals = excluded.goals, assists = excluded.assists,
    yellow_cards = excluded.yellow_cards, red_card = excluded.red_card, clean_sheet = excluded.clean_sheet;
end $$;

-- Every change to events recomputes the live state, the score and (when finished) the statistics.
create function app.apply_match_events() returns trigger language plpgsql security definer set search_path = public as $$
declare mid uuid := coalesce(new.match_id, old.match_id); gf int; ga int; st text;
begin
  select count(*) filter (where (side = 'us' and type in ('goal','penalty_scored')) or (side = 'opponent' and type = 'own_goal')),
         count(*) filter (where (side = 'opponent' and type in ('goal','penalty_scored')) or (side = 'us' and type = 'own_goal'))
    into gf, ga from match_events where match_id = mid and not voided;
  select case when exists (select 1 from match_events where match_id = mid and type = 'full_time' and not voided) then 'full_time'
              when exists (select 1 from match_events where match_id = mid and type = 'second_half' and not voided) then 'second_half'
              when exists (select 1 from match_events where match_id = mid and type = 'half_time' and not voided) then 'half_time'
              when exists (select 1 from match_events where match_id = mid and type = 'kickoff' and not voided) then 'first_half'
              else 'not_started' end into st;
  update matches set goals_for = case when st = 'not_started' and gf = 0 and ga = 0 then goals_for else gf end,
                     goals_against = case when st = 'not_started' and gf = 0 and ga = 0 then goals_against else ga end,
                     live_state = st,
                     live_started_at = case when st = 'not_started' then null else coalesce(live_started_at, now()) end,
                     status = case when st = 'full_time' then 'played'::match_status when status = 'played' and st <> 'full_time' then 'scheduled'::match_status else status end
   where id = mid;
  if st = 'full_time' then perform app.finalize_match_stats(mid); end if;
  return null;
end $$;
create trigger apply_events after insert or update or delete on match_events for each row execute function app.apply_match_events();

-- RLS
alter table formations enable row level security; alter table match_events enable row level security;
create policy admin_all on formations   for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy member_read on formations for select to authenticated using (app.is_active());
create policy admin_all on match_events for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy events_coach_read   on match_events for select to authenticated using (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)));
create policy events_coach_insert on match_events for insert to authenticated with check (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)));
create policy events_coach_update on match_events for update to authenticated using (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id))) with check (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)));
create policy events_team_read    on match_events for select to authenticated using (not voided and exists (select 1 from matches m where m.id = match_id and app.in_team_ts(m.team_season_id)));
revoke all on formations, match_events from anon;
create trigger audit after insert or update or delete on match_events for each row execute function app.audit();
create trigger audit after insert or update or delete on match_squad  for each row execute function app.audit();

-- Public views: live score, timeline and published lineups. Names appear only for players who agreed to be public; others show as "Player #shirt".
create or replace view public_fixtures as
select m.id, t.name as team_name, c.name as competition, m.opponent, m.home_away, m.kickoff_at, m.status, m.goals_for, m.goals_against, l.name as venue, l.city, m.live_state
from matches m join team_seasons ts on ts.id = m.team_season_id and ts.is_public join teams t on t.id = ts.team_id
left join competitions c on c.id = m.competition_id left join locations l on l.id = m.location_id
where m.status in ('scheduled','played');
create view public_match_events as
select e.id, e.match_id, e.type, e.side, e.minute, e.added_minute, e.created_at,
  case when e.side = 'opponent' then e.opponent_label when p.show_publicly then p.first_name || ' ' || p.last_name else 'Player #' || coalesce(s.shirt_number::text, '?') end as player_label,
  case when a.id is null then null when a.show_publicly then a.first_name || ' ' || a.last_name else 'Player #' || coalesce(sa.shirt_number::text, '?') end as assist_label,
  case when o.id is null then null when o.show_publicly then o.first_name || ' ' || o.last_name else 'Player #' || coalesce(so.shirt_number::text, '?') end as player_out_label
from match_events e
join matches m on m.id = e.match_id join team_seasons ts on ts.id = m.team_season_id and ts.is_public
left join players p on p.id = e.player_id left join match_squad s on s.match_id = e.match_id and s.player_id = e.player_id
left join players a on a.id = e.assist_player_id left join match_squad sa on sa.match_id = e.match_id and sa.player_id = e.assist_player_id
left join players o on o.id = e.player_out_id left join match_squad so on so.match_id = e.match_id and so.player_id = e.player_out_id
where not e.voided and e.type not in ('injury','note');
create view public_lineups as
select s.match_id, m.formation, s.status, s.slot, s.shirt_number, s.position, s.captain,
  case when p.show_publicly then p.first_name || ' ' || p.last_name else 'Player #' || coalesce(s.shirt_number::text, '?') end as player_label
from match_squad s join matches m on m.id = s.match_id and m.squad_published
join team_seasons ts on ts.id = m.team_season_id and ts.is_public join players p on p.id = s.player_id
where s.status <> 'not_selected';
grant select on public_fixtures, public_match_events, public_lineups to anon, authenticated;

-- Live updates in the app: Supabase Realtime (RLS applies). The public site polls the views above every 10–15 s.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table match_events, matches, match_squad;
  end if;
end $$;
