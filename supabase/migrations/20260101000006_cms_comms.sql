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
