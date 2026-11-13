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
