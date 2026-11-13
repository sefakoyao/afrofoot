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
