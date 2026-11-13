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
