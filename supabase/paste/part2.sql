-- Afro Foot 2.0 database setup, part 2 of 3. Paste into Supabase > SQL Editor and click Run. Run the parts in order, once each.
-- Contains: 20260101000011_federation.sql, 20260101000012_arabic_lineups_live.sql, 20260101000013_tryouts_billing.sql, 20260101000014_schedule_ratings_mvp_profile.sql


-- ===== 20260101000011_federation.sql =====
-- 0011 Finnish FA (Palloliitto / Torneopal) read-only mirror.
-- The sync job (service role) writes these tables; the site and app only read them.
-- `payload` keeps the raw API object so mappings can be corrected without re-fetching.
create table federation_competitions (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  name text not null, category text, season_label text,
  competition_id uuid references competitions(id) on delete set null,  -- link to our own competition record
  show_publicly boolean not null default false,                         -- publish its standings on www.afrofoot.club
  payload jsonb, synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table federation_teams (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  name text not null, club_name text, logo_url text check (logo_url is null or logo_url ~ '^https://'),
  team_id uuid references teams(id) on delete set null,                 -- set when this is one of OUR teams
  payload jsonb, synced_at timestamptz not null default now()
);
create table federation_matches (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  competition_external_id text not null,
  home_external_id text, away_external_id text,
  home_name text not null, away_name text not null,
  kickoff_at timestamptz, venue text, status text,
  home_goals int check (home_goals >= 0), away_goals int check (away_goals >= 0),
  match_id uuid references matches(id) on delete set null,              -- link to our match when it is ours
  payload jsonb, synced_at timestamptz not null default now()
);
create index on federation_matches (competition_external_id, kickoff_at);
create table federation_standings (
  id uuid primary key default gen_random_uuid(),
  competition_external_id text not null,
  team_external_id text not null, team_name text not null,
  position int not null check (position > 0),
  played int not null default 0, won int not null default 0, drawn int not null default 0, lost int not null default 0,
  goals_for int not null default 0, goals_against int not null default 0, points int not null default 0,
  payload jsonb, synced_at timestamptz not null default now(),
  unique (competition_external_id, team_external_id)
);
create table federation_players (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  team_external_id text, display_name text not null, shirt_number int,
  player_id uuid references players(id) on delete set null,             -- manual link, set by an administrator (never guessed)
  payload jsonb, synced_at timestamptz not null default now()
);
create table federation_player_stats (
  id uuid primary key default gen_random_uuid(),
  player_external_id text not null, competition_external_id text not null,
  appearances int not null default 0, goals int not null default 0, assists int not null default 0,
  yellow_cards int not null default 0, red_cards int not null default 0, minutes int,
  payload jsonb, synced_at timestamptz not null default now(),
  unique (player_external_id, competition_external_id)
);
create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null, status text not null default 'running' check (status in ('running','ok','failed')),
  rows_upserted int not null default 0, error text,
  started_at timestamptz not null default now(), finished_at timestamptz
);
create index on sync_runs (started_at desc);

do $$ declare t text; begin
  foreach t in array array['federation_competitions','federation_teams','federation_matches','federation_standings','federation_players','federation_player_stats','sync_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (app.is_admin()) with check (app.is_admin())', t);
  end loop;
  -- signed-in members (players, coaches) may read league data
  foreach t in array array['federation_competitions','federation_teams','federation_matches','federation_standings'] loop
    execute format('create policy member_read on public.%I for select to authenticated using (app.is_active())', t);
  end loop;
end $$;
create policy coach_read on federation_players      for select to authenticated using (app.role() = 'coach');
create policy coach_read on federation_player_stats for select to authenticated using (app.role() = 'coach');
create function app.owns_federation_player(ext text) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from federation_players fp where fp.external_id = ext and fp.player_id = app.my_player_id()) $$;
grant execute on function app.owns_federation_player(text) to authenticated;
create policy self_read on federation_player_stats for select to authenticated using (app.owns_federation_player(player_external_id));
revoke all on federation_competitions, federation_teams, federation_matches, federation_standings, federation_players, federation_player_stats, sync_runs from anon;
do $$ declare t text; begin
  foreach t in array array['federation_teams','federation_players'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit()', t);
  end loop; end $$;

-- Public, column-limited views: only competitions an administrator marked "show publicly".
create view public_standings as
select c.name as competition, c.category, s.position, s.team_name, s.played, s.won, s.drawn, s.lost, s.goals_for, s.goals_against, s.points, s.synced_at
from federation_standings s join federation_competitions c on c.external_id = s.competition_external_id and c.show_publicly;
create view public_league_fixtures as
select c.name as competition, m.kickoff_at, m.home_name, m.away_name, m.home_goals, m.away_goals, m.venue, m.status
from federation_matches m join federation_competitions c on c.external_id = m.competition_external_id and c.show_publicly;
grant select on public_standings, public_league_fixtures to anon, authenticated;

-- Configuration lives in site_settings (admin-only): {"enabled": false, "competition_ids": [], "team_ids": []}
insert into site_settings (key, value, is_public) values ('federation', '{"enabled": false, "competition_ids": [], "team_ids": []}', false) on conflict (key) do nothing;


-- ===== 20260101000012_arabic_lineups_live.sql =====
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


-- ===== 20260101000013_tryouts_billing.sql =====
-- 0013 Player tryout requests + membership billing (monthly / quarterly / yearly; MobilePay, wire transfer, invoice).

-- ===== Billing =====
alter type plan_period add value if not exists 'quarter' before 'season';
alter type payment_method add value if not exists 'invoice';

alter table memberships
  add column auto_renew boolean not null default false,
  add column next_due_on date;
alter table payments
  add column invoice_number text unique,
  add column invoice_sent_at timestamptz,
  add column provider text check (provider in ('mobilepay')),
  add column provider_ref text,
  add column checkout_url text;
create unique index payments_provider_ref on payments (provider, provider_ref) where provider_ref is not null;

-- Finnish reference number (viitenumero): base digits + check digit, weights 7-3-1 from the right.
create function app.finnish_reference(base bigint) returns text language sql immutable as $$
  with d as (select regexp_split_to_table(reverse(base::text), '') :: int as v, generate_series(0, length(base::text) - 1) as i)
  select base::text || ((10 - coalesce(sum(v * (array[7,3,1])[i % 3 + 1]), 0) % 10) % 10)::text from d
$$;
create sequence payment_ref_seq start 1000;
create function app.payment_defaults() returns trigger language plpgsql as $$
begin
  if new.method in ('bank_transfer','invoice') and new.reference is null then new.reference := app.finnish_reference(nextval('payment_ref_seq')); end if;
  if new.method = 'invoice' and new.invoice_number is null then new.invoice_number := to_char(now(), 'YYYY') || '-' || lpad(currval('payment_ref_seq')::text, 5, '0'); end if;
  return new;
end $$;
create trigger payment_defaults before insert on payments for each row execute function app.payment_defaults();

-- Webhook log for MobilePay (written only by the server with the service role; idempotent by event id). No policies: nobody else can read it.
create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('mobilepay')),
  event_id text not null,
  payment_id uuid references payments(id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);
alter table payment_events enable row level security;
revoke all on payment_events from anon, authenticated;

-- ===== Player tryouts =====
create table tryout_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name  text not null check (char_length(last_name)  between 1 and 80),
  date_of_birth date not null check (date_of_birth between date '1960-01-01' and current_date - 5 * 365),
  email citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone text not null check (char_length(phone) between 5 and 40),
  position player_position not null,
  previous_team text check (char_length(previous_team) <= 120),
  palloliitto_url text check (palloliitto_url ~ '^https://tulospalvelu\.palloliitto\.fi(/[^\s]*)?$' and char_length(palloliitto_url) <= 300),
  guardian_name text check (char_length(guardian_name) <= 120),
  guardian_phone text check (char_length(guardian_phone) <= 40),
  message text check (char_length(message) <= 2000),
  locale text not null default 'en' check (locale in ('en','fi','fr','ar')),
  status request_status not null default 'new',
  tryout_on date,
  internal_note text check (char_length(internal_note) <= 2000),
  reviewed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tryout_one_open on tryout_requests (lower(email::text), date_of_birth) where status in ('new','in_review');
create trigger touch before update on tryout_requests for each row execute function app.touch_updated_at();

-- Under-18s need a guardian. Applicants cannot set review fields.
create function app.check_tryout() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and not coalesce(app.is_admin(), false) then
    if new.status <> 'new' or new.reviewed_by is not null or new.tryout_on is not null or new.internal_note is not null then
      raise exception 'Review fields are set by the club' using errcode = '42501'; end if;
  end if;
  if age(current_date, new.date_of_birth) < interval '18 years' and (coalesce(trim(new.guardian_name), '') = '' or coalesce(trim(new.guardian_phone), '') = '') then
    raise exception 'A parent or guardian name and phone are required for players under 18' using errcode = '23514'; end if;
  return new;
end $$;
create trigger check_tryout before insert or update on tryout_requests for each row execute function app.check_tryout();

alter table tryout_requests enable row level security;
create policy admin_all on tryout_requests for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy tryout_public_insert on tryout_requests for insert to anon, authenticated with check (status = 'new' and reviewed_by is null);
grant insert on tryout_requests to anon;
revoke select, update, delete on tryout_requests from anon;
create trigger audit after insert or update or delete on tryout_requests for each row execute function app.audit('redact');

-- Admin list with the applicant's age.
create view tryout_requests_admin with (security_invoker = true) as
select t.*, date_part('year', age(current_date, t.date_of_birth))::int as age from tryout_requests t;
grant select on tryout_requests_admin to authenticated;


-- ===== 20260101000014_schedule_ratings_mvp_profile.sql =====
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

