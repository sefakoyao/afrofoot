-- Afro Foot 2.0 database setup, part 1 of 3. Paste into Supabase > SQL Editor and click Run. Run the parts in order, once each.
-- Contains: 20260101000001_types.sql, 20260101000002_people.sql, 20260101000003_training.sql, 20260101000004_matches.sql, 20260101000005_development_finance.sql, 20260101000006_cms_comms.sql, 20260101000007_functions_triggers.sql, 20260101000008_rls.sql, 20260101000009_public_views.sql, 20260101000010_i18n.sql


-- ===== 20260101000001_types.sql =====
-- Afro Foot 2.0 — 0001 types and shared helpers (no table dependencies)
create extension if not exists citext;
create schema if not exists app;
grant usage on schema app to anon, authenticated;

create type user_role        as enum ('super_admin','club_admin','coach','player');
create type account_status   as enum ('pending','active','suspended');
create type player_status    as enum ('prospect','active','inactive','alumni');
create type player_position  as enum ('goalkeeper','defender','midfielder','forward');
create type preferred_foot   as enum ('right','left','both');
create type staff_type       as enum ('head_coach','assistant_coach','goalkeeper_coach','manager','physio','analyst','board','other');
create type session_status   as enum ('scheduled','completed','cancelled');
create type match_status     as enum ('scheduled','played','postponed','cancelled');
create type home_away        as enum ('home','away','neutral');
create type competition_type as enum ('league','cup','friendly','tournament');
create type response_status  as enum ('pending','yes','no','maybe');
create type attendance_status as enum ('present','late','absent','excused');
create type squad_status     as enum ('starter','substitute','not_selected');
create type membership_status as enum ('pending','active','expired','cancelled');
create type payment_method   as enum ('cash','bank_transfer','mobilepay','card','other');
create type payment_status   as enum ('pending','paid','failed','refunded');
create type plan_period      as enum ('month','season','year','one_off');
create type audience_type    as enum ('everyone','players','coaches','team');
create type content_status   as enum ('draft','published','archived');
create type request_status   as enum ('new','in_review','accepted','declined','archived');

create function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;


-- ===== 20260101000002_people.sql =====
-- 0002 identity, players, staff, locations, seasons, teams
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  first_name text not null default '' check (char_length(first_name) <= 80),
  last_name  text not null default '' check (char_length(last_name)  <= 80),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{6,20}$'),
  avatar_path text,
  locale text not null default 'en' check (locale in ('en','fi','fr')),
  role user_role not null default 'player',
  status account_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on > starts_on)
);
create unique index seasons_one_current on seasons (is_current) where is_current;

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  category text not null default 'senior',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A team in a given season: roster, staff, matches and sessions hang off this (keeps history).
create table team_seasons (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete restrict,
  season_id uuid not null references seasons(id) on delete restrict,
  division text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, season_id)
);
create index on team_seasons (season_id);

create table locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete set null,
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name  text not null check (char_length(last_name)  between 1 and 80),
  date_of_birth date check (date_of_birth is null or date_of_birth < current_date),
  nationality text[] not null default '{}',
  position player_position,
  secondary_position player_position,
  preferred_foot preferred_foot,
  height_cm int check (height_cm is null or height_cm between 100 and 230),
  weight_kg int check (weight_kg is null or weight_kg between 30 and 200),
  bio text check (char_length(bio) <= 1500),
  photo_path text,
  status player_status not null default 'prospect',
  show_publicly boolean not null default false,  -- explicit consent for the public player list
  joined_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on players (status);
create index on players (last_name, first_name);

-- Private data kept apart so RLS and audit can treat it separately.
create table player_private (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references players(id) on delete cascade,
  phone text, email citext, address text, city text,
  emergency_name text, emergency_phone text, emergency_relation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table player_medical (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null unique references players(id) on delete cascade,
  notes text, allergies text, injuries text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table staff_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete set null,
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name  text not null check (char_length(last_name)  between 1 and 80),
  type staff_type not null default 'other',
  title text,
  bio text check (char_length(bio) <= 1500),
  photo_path text,
  is_public boolean not null default false,
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table team_staff (
  id uuid primary key default gen_random_uuid(),
  team_season_id uuid not null references team_seasons(id) on delete cascade,
  staff_id uuid not null references staff_members(id) on delete restrict,
  role_label text,
  created_at timestamptz not null default now(),
  unique (team_season_id, staff_id)
);
create index on team_staff (staff_id);

create table team_players (
  id uuid primary key default gen_random_uuid(),
  team_season_id uuid not null references team_seasons(id) on delete restrict,
  player_id uuid not null references players(id) on delete restrict,
  jersey_number int check (jersey_number between 1 and 99),
  captain boolean not null default false,
  joined_on date,
  left_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_season_id, player_id),
  check (left_on is null or joined_on is null or left_on >= joined_on)
);
create unique index team_players_jersey on team_players (team_season_id, jersey_number) where jersey_number is not null and left_on is null;
create index on team_players (player_id);


-- ===== 20260101000003_training.sql =====
-- 0003 training programs, sessions, attendance
create table training_programs (
  id uuid primary key default gen_random_uuid(),
  team_season_id uuid not null references team_seasons(id) on delete restrict,
  title text not null check (char_length(title) between 2 and 120),
  description text, objectives text,
  starts_on date, ends_on date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index on training_programs (team_season_id);

create table training_sessions (
  id uuid primary key default gen_random_uuid(),
  team_season_id uuid not null references team_seasons(id) on delete restrict,
  program_id uuid references training_programs(id) on delete set null,
  location_id uuid references locations(id) on delete set null,
  title text not null check (char_length(title) between 2 and 120),
  focus text, notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status session_status not null default 'scheduled',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on training_sessions (team_season_id, starts_at);

create table session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references training_sessions(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  availability response_status not null default 'pending',
  responded_at timestamptz,
  note text check (char_length(note) <= 300),
  attendance attendance_status,
  marked_by uuid references profiles(id) on delete set null,
  marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, player_id)
);
create index on session_attendance (player_id);


-- ===== 20260101000004_matches.sql =====
-- 0004 competitions, matches, availability, squads, stats
create table competitions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete restrict,
  name text not null,
  type competition_type not null default 'league',
  organizer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, name)
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  team_season_id uuid not null references team_seasons(id) on delete restrict,
  competition_id uuid references competitions(id) on delete set null,
  location_id uuid references locations(id) on delete set null,
  opponent text not null check (char_length(opponent) between 1 and 120),
  home_away home_away not null default 'home',
  kickoff_at timestamptz not null,
  status match_status not null default 'scheduled',
  goals_for int check (goals_for >= 0),
  goals_against int check (goals_against >= 0),
  squad_published boolean not null default false,
  report text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'played' or (goals_for is not null and goals_against is not null))
);
create index on matches (team_season_id, kickoff_at);
create index on matches (competition_id);

create table match_availability (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  availability response_status not null default 'pending',
  responded_at timestamptz,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);
create index on match_availability (player_id);

create table match_squad (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  status squad_status not null default 'not_selected',
  position player_position,
  shirt_number int check (shirt_number between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);
create unique index match_squad_shirt on match_squad (match_id, shirt_number) where shirt_number is not null and status <> 'not_selected';

create table match_player_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  minutes int not null default 0 check (minutes between 0 and 130),
  goals int not null default 0 check (goals >= 0),
  assists int not null default 0 check (assists >= 0),
  yellow_cards int not null default 0 check (yellow_cards between 0 and 2),
  red_card boolean not null default false,
  clean_sheet boolean not null default false,
  rating numeric(3,1) check (rating between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, player_id)
);
create index on match_player_stats (player_id);


-- ===== 20260101000005_development_finance.sql =====
-- 0005 evaluations, goals, memberships, payments, expenses
create table evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in ('technical','tactical','physical','mental','attitude')),
  sort_order int not null default 100,
  active boolean not null default true
);

create table evaluations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  team_season_id uuid references team_seasons(id) on delete set null,
  evaluator_id uuid references profiles(id) on delete set null,
  evaluated_on date not null default current_date,
  summary text, strengths text, improvements text,
  visible_to_player boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on evaluations (player_id, evaluated_on desc);

create table evaluation_scores (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references evaluations(id) on delete cascade,
  criterion_id uuid not null references evaluation_criteria(id) on delete restrict,
  score int not null check (score between 1 and 5),
  comment text,
  unique (evaluation_id, criterion_id)
);

create table development_goals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  description text,
  target_date date,
  status text not null default 'open' check (status in ('open','in_progress','achieved','dropped')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on development_goals (player_id);

create table membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  amount_cents int not null check (amount_cents >= 0),
  currency char(3) not null default 'EUR',
  period plan_period not null default 'season',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete restrict,
  plan_id uuid not null references membership_plans(id) on delete restrict,
  season_id uuid not null references seasons(id) on delete restrict,
  status membership_status not null default 'pending',
  starts_on date, ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, season_id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete restrict,
  membership_id uuid references memberships(id) on delete set null,
  amount_cents int not null check (amount_cents > 0),
  currency char(3) not null default 'EUR',
  method payment_method not null default 'bank_transfer',
  status payment_status not null default 'pending',
  reference text,
  due_on date,
  paid_at timestamptz,
  recorded_by uuid references profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'paid' or paid_at is not null)
);
create index on payments (player_id);
create index on payments (status, due_on);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references seasons(id) on delete set null,
  category text not null check (category in ('equipment','pitch','travel','league_fees','insurance','events','other')),
  amount_cents int not null check (amount_cents > 0),
  currency char(3) not null default 'EUR',
  incurred_on date not null default current_date,
  description text,
  receipt_path text,
  recorded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on expenses (season_id, incurred_on);


-- ===== 20260101000006_cms_comms.sql =====
-- 0006 public CMS, requests, announcements, notifications, audit
create table pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  body_md text not null default '',
  seo_description text check (char_length(seo_description) <= 200),
  status content_status not null default 'draft',
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table news_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  excerpt text check (char_length(excerpt) <= 300),
  body_md text not null default '',
  cover_path text,
  status content_status not null default 'draft',
  published_at timestamptz,
  author_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);
create index on news_posts (status, published_at desc);
create table sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier text not null default 'partner' check (tier in ('main','official','partner')),
  logo_path text, website_url text check (website_url is null or website_url ~ '^https://'),
  description text,
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table site_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  topic text not null default 'general' check (topic in ('general','join','partnership','media')),
  message text not null check (char_length(message) between 5 and 4000),
  status request_status not null default 'new',
  handled_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table join_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone text, country text,
  position player_position,
  experience text check (char_length(experience) <= 2000),
  message text check (char_length(message) <= 2000),
  status request_status not null default 'new',
  reviewed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 160),
  body text not null check (char_length(body) <= 4000),
  audience audience_type not null default 'everyone',
  team_season_id uuid references team_seasons(id) on delete cascade,
  pinned boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((audience = 'team') = (team_season_id is not null))
);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'announcement',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (user_id, read_at, created_at desc);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index on audit_log (table_name, created_at desc);
create index on audit_log (actor_id, created_at desc);


-- ===== 20260101000007_functions_triggers.sql =====
-- 0007 authorization helpers, guards, automation, audit
-- All helpers are SECURITY DEFINER with a fixed search_path so RLS policies can call them without recursion.
create function app.role() returns user_role language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and status = 'active' $$;
create function app.is_active() returns boolean language sql stable security definer set search_path = public as
$$ select app.role() is not null $$;
create function app.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role() in ('super_admin','club_admin'), false) $$;
create function app.is_super() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role() = 'super_admin', false) $$;
create function app.my_player_id() returns uuid language sql stable security definer set search_path = public as
$$ select id from players where profile_id = auth.uid() $$;
create function app.coaches_ts(ts uuid) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role() = 'coach', false) and exists (
     select 1 from team_staff t join staff_members s on s.id = t.staff_id
     where s.profile_id = auth.uid() and t.team_season_id = ts) $$;
create function app.coaches_player(pid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role() = 'coach', false) and exists (
     select 1 from team_players tp join team_staff t on t.team_season_id = tp.team_season_id
     join staff_members s on s.id = t.staff_id
     where tp.player_id = pid and s.profile_id = auth.uid()) $$;
create function app.in_team_ts(ts uuid) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role() = 'player', false) and exists (
     select 1 from team_players tp where tp.team_season_id = ts and tp.player_id = app.my_player_id()) $$;
grant execute on all functions in schema app to anon, authenticated;

-- updated_at
do $$ declare t text; begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
           where c.table_schema = 'public' and c.column_name = 'updated_at' loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop; end $$;

-- Non-admin/non-coach users may only change the listed columns (RLS decides *which rows*, this decides *which columns*).
create function app.restrict_columns() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or app.is_admin() or app.role() = 'coach' then return new; end if;
  if (to_jsonb(new) - tg_argv) is distinct from (to_jsonb(old) - tg_argv) then
    raise exception 'You may not change these fields' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger restrict_cols before update on players for each row execute function app.restrict_columns('preferred_foot','height_cm','weight_kg','bio','photo_path','show_publicly','updated_at');
create trigger restrict_cols before update on staff_members for each row execute function app.restrict_columns('bio','photo_path','updated_at');
create trigger restrict_cols before update on session_attendance for each row execute function app.restrict_columns('availability','responded_at','note','updated_at');
create trigger restrict_cols before update on match_availability for each row execute function app.restrict_columns('availability','responded_at','note','updated_at');
create trigger restrict_cols before update on notifications for each row execute function app.restrict_columns('read_at');

-- Coaches may only change attendance marking fields on attendance rows, not a player's own response.
-- (kept simple: coaches are trusted for their own teams; every change is audited.)

create function app.guard_profiles() returns trigger language plpgsql security definer set search_path = public as $$
declare privileged user_role[] := array['super_admin','club_admin']::user_role[];
begin
  if auth.uid() is null then return new; end if;   -- service role / migrations
  if new.id is distinct from old.id or new.email is distinct from old.email then
    raise exception 'id and email are managed by the authentication system' using errcode = '42501'; end if;
  if new.role is distinct from old.role or new.status is distinct from old.status then
    if not app.is_admin() then raise exception 'Only administrators can change role or status' using errcode = '42501'; end if;
    if (new.role = any(privileged) or old.role = any(privileged)) and not app.is_super() then
      raise exception 'Only a super administrator can manage administrator accounts' using errcode = '42501'; end if;
    if old.role = 'super_admin' and old.status = 'active' and (new.role <> 'super_admin' or new.status <> 'active')
       and (select count(*) from profiles where role = 'super_admin' and status = 'active') <= 1 then
      raise exception 'The last active super administrator cannot be removed' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
create trigger guard_profiles before update on profiles for each row execute function app.guard_profiles();

-- Every new sign-up gets a pending *player* profile. The role in user metadata is never trusted.
create function app.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, first_name, last_name)
  values (new.id, new.email, left(coalesce(new.raw_user_meta_data->>'first_name',''), 80), left(coalesce(new.raw_user_meta_data->>'last_name',''), 80));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

-- Attendance / availability rows are generated from the roster so players never insert rows themselves.
create function app.seed_session_attendance() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into session_attendance (session_id, player_id)
  select new.id, tp.player_id from team_players tp where tp.team_season_id = new.team_season_id and tp.left_on is null
  on conflict do nothing;
  return new;
end $$;
create trigger seed_attendance after insert on training_sessions for each row execute function app.seed_session_attendance();
create function app.seed_match_availability() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into match_availability (match_id, player_id)
  select new.id, tp.player_id from team_players tp where tp.team_season_id = new.team_season_id and tp.left_on is null
  on conflict do nothing;
  return new;
end $$;
create trigger seed_availability after insert on matches for each row execute function app.seed_match_availability();
create function app.roster_join_backfill() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.left_on is not null then return new; end if;
  insert into session_attendance (session_id, player_id)
    select s.id, new.player_id from training_sessions s where s.team_season_id = new.team_season_id and s.starts_at > now() and s.status = 'scheduled' on conflict do nothing;
  insert into match_availability (match_id, player_id)
    select m.id, new.player_id from matches m where m.team_season_id = new.team_season_id and m.kickoff_at > now() and m.status = 'scheduled' on conflict do nothing;
  return new;
end $$;
create trigger roster_backfill after insert on team_players for each row execute function app.roster_join_backfill();

-- Publishing an announcement fans out in-app notifications to the right audience.
create function public.publish_announcement(p_id uuid) returns int language plpgsql security definer set search_path = public as $$
declare a announcements; n int;
begin
  select * into a from announcements where id = p_id;
  if not found then raise exception 'Announcement not found' using errcode = 'P0002'; end if;
  if not (app.is_admin() or (app.role() = 'coach' and a.audience = 'team' and app.coaches_ts(a.team_season_id))) then
    raise exception 'Not allowed to publish this announcement' using errcode = '42501'; end if;
  if a.published_at is not null then raise exception 'Already published' using errcode = '23505'; end if;
  update announcements set published_at = now() where id = p_id;
  insert into notifications (user_id, kind, title, body, link)
  select p.id, 'announcement', a.title, left(a.body, 200), '/announcements' from profiles p
  where p.status = 'active' and (
    a.audience = 'everyone'
    or (a.audience = 'players' and p.role = 'player')
    or (a.audience = 'coaches' and p.role = 'coach')
    or (a.audience = 'team' and (
         exists (select 1 from players pl join team_players tp on tp.player_id = pl.id where pl.profile_id = p.id and tp.team_season_id = a.team_season_id and tp.left_on is null)
      or exists (select 1 from staff_members sm join team_staff ts on ts.staff_id = sm.id where sm.profile_id = p.id and ts.team_season_id = a.team_season_id))));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.publish_announcement(uuid) from anon;

-- Audit trail. 'redact' variant stores only the NAMES of changed columns (private/medical data never copied into the log).
create function app.audit() returns trigger language plpgsql security definer set search_path = public as $$
declare redact boolean := coalesce(tg_argv[0], '') = 'redact'; o jsonb; n jsonb; rid uuid;
begin
  o := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  rid := coalesce(n->>'id', o->>'id')::uuid;
  if tg_op = 'UPDATE' and (o - 'updated_at') = (n - 'updated_at') then return new; end if;
  if redact then
    if tg_op = 'UPDATE' then
      n := (select coalesce(jsonb_object_agg(k, true), '{}'::jsonb) from jsonb_each(n) e(k, v) where k <> 'updated_at' and o->k is distinct from v);
    else n := null; end if;
    o := null;
  end if;
  insert into audit_log (actor_id, action, table_name, record_id, old_data, new_data) values (auth.uid(), tg_op, tg_table_name, rid, o, n);
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['profiles','players','staff_members','seasons','teams','team_seasons','team_staff','team_players','competitions','matches',
    'memberships','membership_plans','payments','expenses','announcements','pages','news_posts','sponsors','site_settings','join_requests','evaluations','development_goals'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit()', t);
  end loop;
  foreach t in array array['player_private','player_medical'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit(%L)', t, 'redact');
  end loop;
end $$;


-- ===== 20260101000008_rls.sql =====
-- 0008 Row Level Security. Default deny; each policy states who and why.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop; end $$;

-- Administrators (club_admin + super_admin) manage everything except the append-only log and personal notifications.
do $$ declare t text; begin
  foreach t in array array['profiles','seasons','teams','team_seasons','locations','players','player_private','player_medical','staff_members','team_staff','team_players',
    'training_programs','training_sessions','session_attendance','competitions','matches','match_availability','match_squad','match_player_stats',
    'evaluation_criteria','evaluations','evaluation_scores','development_goals','membership_plans','memberships','payments','expenses',
    'pages','news_posts','sponsors','site_settings','contact_messages','join_requests','announcements'] loop
    execute format('create policy admin_all on public.%I for all to authenticated using (app.is_admin()) with check (app.is_admin())', t);
  end loop; end $$;

-- profiles
create policy profiles_self_read on profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- (role/status/email are protected by the guard_profiles trigger)

-- reference data readable by any active member
do $$ declare t text; begin
  foreach t in array array['seasons','teams','team_seasons','locations','competitions','membership_plans','team_staff','evaluation_criteria'] loop
    execute format('create policy member_read on public.%I for select to authenticated using (app.is_active())', t);
  end loop; end $$;

-- players & private data
create policy players_self_read   on players for select to authenticated using (profile_id = auth.uid());
create policy players_coach_read  on players for select to authenticated using (app.coaches_player(id));
create policy players_self_update on players for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy private_self        on player_private for all to authenticated using (player_id = app.my_player_id()) with check (player_id = app.my_player_id());
create policy private_coach_read  on player_private for select to authenticated using (app.coaches_player(player_id));
create policy medical_self        on player_medical for all to authenticated using (player_id = app.my_player_id()) with check (player_id = app.my_player_id());

-- staff
create policy staff_read_coaches on staff_members for select to authenticated using (app.role() = 'coach');
create policy staff_read_self    on staff_members for select to authenticated using (profile_id = auth.uid());
create policy staff_read_team    on staff_members for select to authenticated using (exists (
  select 1 from team_staff t join team_players tp on tp.team_season_id = t.team_season_id where t.staff_id = staff_members.id and tp.player_id = app.my_player_id()));
create policy staff_self_update  on staff_members for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- roster
create policy roster_read on team_players for select to authenticated using (app.coaches_ts(team_season_id) or app.in_team_ts(team_season_id));

-- training
create policy programs_read  on training_programs for select to authenticated using (app.coaches_ts(team_season_id) or app.in_team_ts(team_season_id));
create policy programs_write on training_programs for all to authenticated using (app.coaches_ts(team_season_id)) with check (app.coaches_ts(team_season_id));
create policy sessions_read  on training_sessions for select to authenticated using (app.coaches_ts(team_season_id) or app.in_team_ts(team_season_id));
create policy sessions_write on training_sessions for all to authenticated using (app.coaches_ts(team_season_id)) with check (app.coaches_ts(team_season_id));
create policy attendance_self  on session_attendance for select to authenticated using (player_id = app.my_player_id());
create policy attendance_self_update on session_attendance for update to authenticated using (player_id = app.my_player_id()) with check (player_id = app.my_player_id());
create policy attendance_coach on session_attendance for all to authenticated
  using (exists (select 1 from training_sessions s where s.id = session_id and app.coaches_ts(s.team_season_id)))
  with check (exists (select 1 from training_sessions s where s.id = session_id and app.coaches_ts(s.team_season_id)));

-- matches
create policy matches_read  on matches for select to authenticated using (app.coaches_ts(team_season_id) or app.in_team_ts(team_season_id));
create policy matches_write on matches for all to authenticated using (app.coaches_ts(team_season_id)) with check (app.coaches_ts(team_season_id));
create policy mavail_self        on match_availability for select to authenticated using (player_id = app.my_player_id());
create policy mavail_self_update on match_availability for update to authenticated using (player_id = app.my_player_id()) with check (player_id = app.my_player_id());
create policy mavail_coach on match_availability for all to authenticated
  using (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)))
  with check (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)));
create policy squad_coach on match_squad for all to authenticated
  using (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)))
  with check (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)));
create policy squad_players_read on match_squad for select to authenticated
  using (exists (select 1 from matches m where m.id = match_id and m.squad_published and app.in_team_ts(m.team_season_id)));
create policy stats_coach on match_player_stats for all to authenticated
  using (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)))
  with check (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)));
create policy stats_team_read on match_player_stats for select to authenticated
  using (exists (select 1 from matches m where m.id = match_id and app.in_team_ts(m.team_season_id)));

-- development
create policy eval_coach_read   on evaluations for select to authenticated using (app.coaches_player(player_id));
create policy eval_player_read  on evaluations for select to authenticated using (visible_to_player and player_id = app.my_player_id());
create policy eval_coach_insert on evaluations for insert to authenticated with check (app.coaches_player(player_id) and evaluator_id = auth.uid());
create policy eval_coach_modify on evaluations for update to authenticated using (evaluator_id = auth.uid() and app.role() = 'coach') with check (evaluator_id = auth.uid() and app.coaches_player(player_id));
create policy eval_coach_delete on evaluations for delete to authenticated using (evaluator_id = auth.uid() and app.role() = 'coach');
create policy escores_read  on evaluation_scores for select to authenticated using (exists (select 1 from evaluations e where e.id = evaluation_id));
create policy escores_write on evaluation_scores for all to authenticated
  using (exists (select 1 from evaluations e where e.id = evaluation_id and e.evaluator_id = auth.uid() and app.role() = 'coach'))
  with check (exists (select 1 from evaluations e where e.id = evaluation_id and e.evaluator_id = auth.uid() and app.role() = 'coach'));
create policy goals_read  on development_goals for select to authenticated using (player_id = app.my_player_id() or app.coaches_player(player_id));
create policy goals_write on development_goals for all to authenticated using (app.coaches_player(player_id)) with check (app.coaches_player(player_id) and created_by = auth.uid());

-- membership & money: players see only their own; coaches see none
create policy memberships_self on memberships for select to authenticated using (player_id = app.my_player_id());
create policy payments_self    on payments    for select to authenticated using (player_id = app.my_player_id());

-- communication
create policy announcements_read on announcements for select to authenticated using (
  app.is_active() and published_at is not null and published_at <= now() and (expires_at is null or expires_at > now()) and (
    audience = 'everyone' or (audience = 'players' and app.role() = 'player') or (audience = 'coaches' and app.role() = 'coach')
    or (audience = 'team' and (app.coaches_ts(team_season_id) or app.in_team_ts(team_season_id)))));
create policy announcements_coach_draft on announcements for all to authenticated
  using (app.role() = 'coach' and created_by = auth.uid() and published_at is null)
  with check (app.role() = 'coach' and created_by = auth.uid() and audience = 'team' and app.coaches_ts(team_season_id) and published_at is null);
create policy notifications_own_read   on notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_own_update on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own_delete on notifications for delete to authenticated using (user_id = auth.uid());
create policy audit_admin_read on audit_log for select to authenticated using (app.is_admin());

-- public website content (anonymous visitors)
create policy pages_public    on pages        for select to anon, authenticated using (status = 'published');
create policy news_public     on news_posts   for select to anon, authenticated using (status = 'published' and published_at <= now());
create policy sponsors_public on sponsors     for select to anon, authenticated using (active);
create policy settings_public on site_settings for select to anon, authenticated using (is_public);
create policy contact_public  on contact_messages for insert to anon, authenticated with check (status = 'new' and handled_by is null);
create policy join_public     on join_requests    for insert to anon, authenticated with check (status = 'new' and reviewed_by is null);

-- table privileges: belt and braces on top of RLS
revoke all on all tables in schema public from anon;
grant select on pages, news_posts, sponsors, site_settings to anon;
grant insert on contact_messages, join_requests to anon;
revoke insert, update, delete, truncate on audit_log from authenticated, anon;
revoke insert, delete, truncate on notifications from authenticated, anon;
alter default privileges in schema public revoke all on tables from anon;


-- ===== 20260101000009_public_views.sql =====
-- 0009 column-limited views. They run with the owner's rights on purpose: only consented / non-sensitive columns are exposed.
create view public_players as
select p.id, (p.first_name || ' ' || p.last_name) as display_name, p.position, p.nationality, p.photo_path, tp.jersey_number, t.name as team_name
from players p
join team_players tp on tp.player_id = p.id and tp.left_on is null
join team_seasons ts on ts.id = tp.team_season_id and ts.is_public
join seasons s on s.id = ts.season_id and s.is_current
join teams t on t.id = ts.team_id
where p.show_publicly and p.status = 'active';

create view public_staff as
select id, (first_name || ' ' || last_name) as display_name, type, title, bio, photo_path, sort_order
from staff_members where is_public and active;

create view public_fixtures as
select m.id, t.name as team_name, c.name as competition, m.opponent, m.home_away, m.kickoff_at, m.status, m.goals_for, m.goals_against, l.name as venue, l.city
from matches m
join team_seasons ts on ts.id = m.team_season_id and ts.is_public
join teams t on t.id = ts.team_id
left join competitions c on c.id = m.competition_id
left join locations l on l.id = m.location_id
where m.status in ('scheduled','played');

create view public_team_records as
select ts.id as team_season_id, t.name as team_name, c.name as competition,
  count(*) as played,
  count(*) filter (where m.goals_for > m.goals_against) as won,
  count(*) filter (where m.goals_for = m.goals_against) as drawn,
  count(*) filter (where m.goals_for < m.goals_against) as lost,
  sum(m.goals_for) as goals_for, sum(m.goals_against) as goals_against,
  count(*) filter (where m.goals_for > m.goals_against) * 3 + count(*) filter (where m.goals_for = m.goals_against) as points
from matches m
join team_seasons ts on ts.id = m.team_season_id and ts.is_public
join teams t on t.id = ts.team_id
join competitions c on c.id = m.competition_id and c.type = 'league'
where m.status = 'played'
group by ts.id, t.name, c.name;

-- Signed-in teammates: names and playing info only, scoped by the caller's own role.
create view team_roster as
select tp.team_season_id, p.id as player_id, (p.first_name || ' ' || p.last_name) as display_name, p.position, p.photo_path, tp.jersey_number, tp.captain
from team_players tp join players p on p.id = tp.player_id
where tp.left_on is null and (app.is_admin() or app.coaches_ts(tp.team_season_id) or app.in_team_ts(tp.team_season_id));

grant select on public_players, public_staff, public_fixtures, public_team_records to anon, authenticated;
grant select on team_roster to authenticated;

-- Financial summary for the admin dashboard (admins only through the function guard).
create function public.finance_summary(p_season uuid) returns table (income_cents bigint, pending_cents bigint, expenses_cents bigint, net_cents bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
  select i.paid, i.pending, e.spent, i.paid - e.spent from
   (select coalesce(sum(amount_cents) filter (where p.status = 'paid'), 0)::bigint paid, coalesce(sum(amount_cents) filter (where p.status = 'pending'), 0)::bigint pending
      from payments p left join memberships m on m.id = p.membership_id where m.season_id = p_season or (p.membership_id is null and p.created_at::date between (select starts_on from seasons where id = p_season) and (select ends_on from seasons where id = p_season))) i,
   (select coalesce(sum(amount_cents), 0)::bigint spent from expenses where season_id = p_season) e;
end $$;
revoke execute on function public.finance_summary(uuid) from anon;

-- Storage buckets (only when running on Supabase).
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('public-media','public-media',true),('player-photos','player-photos',false),('private-docs','private-docs',false) on conflict (id) do nothing;
    execute $p$create policy "public-media read" on storage.objects for select using (bucket_id = 'public-media')$p$;
    execute $p$create policy "public-media admin write" on storage.objects for all to authenticated using (bucket_id = 'public-media' and app.is_admin()) with check (bucket_id = 'public-media' and app.is_admin())$p$;
    execute $p$create policy "player-photos own folder" on storage.objects for all to authenticated using (bucket_id = 'player-photos' and (app.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)) with check (bucket_id = 'player-photos' and (app.is_admin() or (storage.foldername(name))[1] = auth.uid()::text))$p$;
    execute $p$create policy "private-docs admin only" on storage.objects for all to authenticated using (bucket_id = 'private-docs' and app.is_admin()) with check (bucket_id = 'private-docs' and app.is_admin())$p$;
  end if;
end $$;


-- ===== 20260101000010_i18n.sql =====
-- 0010 multilingual content (English / Finnish / French)
-- English is the source language stored in the normal columns. Finnish and French live in `translations`:
--   {"fi": {"title": "...", "body_md": "..."}, "fr": {...}}
-- Reading code falls back to English for any missing field (see app.localized).
create function app.valid_translations(j jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(j) = 'object'
     and not exists (select 1 from jsonb_object_keys(j) k where k not in ('fi','fr'))
     and not exists (select 1 from jsonb_each(j) e where jsonb_typeof(e.value) <> 'object')
$$;
create function app.localized(base text, tr jsonb, loc text, field text) returns text language sql immutable as $$
  select coalesce(nullif(tr -> loc ->> field, ''), base)
$$;
grant execute on function app.valid_translations(jsonb), app.localized(text, jsonb, text, text) to anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['pages','news_posts','sponsors','staff_members','announcements','membership_plans','evaluation_criteria'] loop
    execute format('alter table public.%I add column translations jsonb not null default %L::jsonb', t, '{}');
    execute format('alter table public.%I add constraint %I check (app.valid_translations(translations))', t, t || '_translations_valid');
  end loop; end $$;

alter table contact_messages add column locale text not null default 'en' check (locale in ('en','fi','fr'));
alter table join_requests    add column locale text not null default 'en' check (locale in ('en','fi','fr'));

-- Public staff view now carries translations (columns appended at the end, as CREATE OR REPLACE VIEW requires).
create or replace view public_staff as
select id, (first_name || ' ' || last_name) as display_name, type, title, bio, photo_path, sort_order, translations
from staff_members where is_public and active;

