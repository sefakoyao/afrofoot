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
