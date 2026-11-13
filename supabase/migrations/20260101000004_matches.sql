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
