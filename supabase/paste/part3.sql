-- Afro Foot 2.0 database setup, part 3 of 3. Paste into Supabase > SQL Editor and click Run. Run the parts in order, once each.
-- Contains: 20260101000015_locations_events_enrolment.sql, 20260101000016_versions_revisions.sql, 20260101000017_membership_fees.sql, 20260101000018_release_0_11_0.sql, 20260101000019_fees_invoices_sponsor_packages.sql, 20260101000020_release_0_12_1.sql, 20260101000021_insurance_prices.sql, 20260101000022_fee_status_signin_block.sql, 20260101000023_lineup_templates.sql, 20260101000024_phone_country_code.sql, 20260101000025_enrolment_nationality_code.sql, 20260101000026_release_0_15_0.sql, seed.sql


-- ===== 20260101000015_locations_events_enrolment.sql =====
-- 0015 Saved locations with route guide, event types (practice / game / friendly) with division, public player enrolment.

-- ===== Saved locations + route guide =====
alter table locations
  add column kind text not null default 'pitch' check (kind in ('pitch','hall','gym','field','other')),
  add column postal_code text check (char_length(postal_code) <= 12),
  add column latitude numeric(9,6) check (latitude between -90 and 90),
  add column longitude numeric(9,6) check (longitude between -180 and 180),
  add column maps_url text check (maps_url ~ '^https://[^\s]+$' and char_length(maps_url) <= 500),
  add column directions text check (char_length(directions) <= 1500),   -- how to find the pitch from the nearest stop / entrance
  add column parking text check (char_length(parking) <= 500),
  add column transit text check (char_length(transit) <= 500),
  add column active boolean not null default true,
  add column created_by uuid references profiles(id) on delete set null default auth.uid(),
  add constraint locations_coords_pair check ((latitude is null) = (longitude is null));
create unique index locations_unique on locations (lower(name), lower(coalesce(city, '')));
create trigger touch before update on locations for each row execute function app.touch_updated_at();
-- Admins manage every location (admin_all). Coaches can save new ones and fix the ones they added.
create policy coach_insert on locations for insert to authenticated with check (app.role() = 'coach' and created_by = auth.uid());
create policy coach_update on locations for update to authenticated using (app.role() = 'coach' and created_by = auth.uid()) with check (app.role() = 'coach' and created_by = auth.uid());
create trigger audit after insert or update or delete on locations for each row execute function app.audit();

-- ===== Event types =====
create type event_type as enum ('practice','game','friendly');
alter table matches
  add column event_type event_type not null default 'game' check (event_type <> 'practice'),
  add column division text check (char_length(division) between 1 and 80),
  add constraint matches_division_for_games check (event_type = 'friendly' or division is not null);

-- One calendar for coaches, admins and players (RLS of the underlying tables applies).
create view team_schedule with (security_invoker = true) as
select s.id, 'practice'::event_type as event_type, s.team_season_id, s.title, null::text as division, s.starts_at, s.ends_at, s.location_id, s.status::text as status
from training_sessions s
union all
select m.id, m.event_type, m.team_season_id, m.opponent, m.division, m.kickoff_at, m.kickoff_at + interval '2 hours', m.location_id, m.status::text
from matches m;
grant select on team_schedule to authenticated;

-- Public fixtures: venue address and route link are public information for visitors.
create or replace view public_fixtures as
select m.id, t.name as team_name, c.name as competition, m.opponent, m.home_away, m.kickoff_at, m.status, m.goals_for, m.goals_against, l.name as venue, l.city, m.live_state,
       m.event_type, m.division, l.address as venue_address, l.maps_url as venue_maps_url
from matches m join team_seasons ts on ts.id = m.team_season_id and ts.is_public join teams t on t.id = ts.team_id
left join competitions c on c.id = m.competition_id left join locations l on l.id = m.location_id
where m.status in ('scheduled','played');
grant select on public_fixtures to anon, authenticated;

-- ===== Public player enrolment =====
create view public_membership_plans as
select id, name, description, amount_cents, currency, period from membership_plans where active;
grant select on public_membership_plans to anon, authenticated;

create table player_enrolments (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name  text not null check (char_length(last_name)  between 1 and 80),
  date_of_birth date not null check (date_of_birth between date '1960-01-01' and current_date - 5 * 365),
  email citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone text not null check (char_length(phone) between 5 and 40),
  position player_position not null,
  nationality text check (char_length(nationality) <= 80),
  address text check (char_length(address) <= 200),
  city text check (char_length(city) <= 80),
  previous_team text check (char_length(previous_team) <= 120),
  palloliitto_url text check (palloliitto_url ~ '^https://tulospalvelu\.palloliitto\.fi(/[^\s]*)?$' and char_length(palloliitto_url) <= 300),
  guardian_name text check (char_length(guardian_name) <= 120),
  guardian_phone text check (char_length(guardian_phone) <= 40),
  plan_id uuid references membership_plans(id) on delete set null,
  payment_method payment_method check (payment_method in ('mobilepay','bank_transfer','invoice')),
  terms_accepted boolean not null check (terms_accepted),
  privacy_accepted boolean not null check (privacy_accepted),
  photo_consent boolean not null default false,
  public_listing boolean not null default false,
  locale text not null default 'en' check (locale in ('en','fi','fr','ar')),
  status request_status not null default 'new',
  internal_note text check (char_length(internal_note) <= 2000),
  reviewed_by uuid references profiles(id) on delete set null,
  player_id uuid references players(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index enrolment_one_open on player_enrolments (lower(email::text), date_of_birth) where status in ('new','in_review');
create trigger touch before update on player_enrolments for each row execute function app.touch_updated_at();
create function app.check_enrolment() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and not coalesce(app.is_admin(), false) and (new.status <> 'new' or new.reviewed_by is not null or new.player_id is not null or new.internal_note is not null) then
    raise exception 'Review fields are set by the club' using errcode = '42501'; end if;
  if age(current_date, new.date_of_birth) < interval '18 years' and (coalesce(trim(new.guardian_name), '') = '' or coalesce(trim(new.guardian_phone), '') = '') then
    raise exception 'A parent or guardian name and phone are required for players under 18' using errcode = '23514'; end if;
  return new;
end $$;
create trigger check_enrolment before insert or update on player_enrolments for each row execute function app.check_enrolment();
alter table player_enrolments enable row level security;
create policy admin_all on player_enrolments for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy enrol_public_insert on player_enrolments for insert to anon, authenticated with check (status = 'new' and reviewed_by is null and player_id is null);
grant insert on player_enrolments to anon;
revoke select, update, delete on player_enrolments from anon;
create trigger audit after insert or update or delete on player_enrolments for each row execute function app.audit('redact');

-- Approval creates the player record (prospect). The server then invites the person by e-mail so they can create their account and profile.
create function public.approve_enrolment(p_id uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare e player_enrolments; pid uuid;
begin
  if not app.is_admin() then raise exception 'Only administrators can approve enrolments' using errcode = '42501'; end if;
  select * into e from player_enrolments where id = p_id for update;
  if e.id is null then raise exception 'Unknown enrolment' using errcode = '22023'; end if;
  if e.status not in ('new','in_review') then raise exception 'This enrolment has already been processed' using errcode = '23514'; end if;
  insert into players (first_name, last_name, date_of_birth, position, status, show_publicly)
    values (e.first_name, e.last_name, e.date_of_birth, e.position, 'prospect', e.public_listing) returning id into pid;
  insert into player_private (player_id, phone, email, address, city, emergency_name, emergency_phone)
    values (pid, e.phone, e.email, e.address, e.city, e.guardian_name, e.guardian_phone);
  update player_enrolments set status = 'accepted', reviewed_by = auth.uid(), player_id = pid where id = p_id;
  return pid;
end $$;
grant execute on function public.approve_enrolment(uuid) to authenticated;


-- ===== 20260101000016_versions_revisions.sql =====
-- 0016 Change tracking for admins: release/version log + content revision history (pages, news) with restore.

-- ===== Release log =====
create table app_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  kind text not null default 'feature' check (kind in ('feature','fix','design','security','content')),
  title text not null check (char_length(title) between 3 and 140),
  notes text not null default '' check (char_length(notes) <= 4000),
  released_at timestamptz not null default now(),
  released_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table app_releases enable row level security;
create policy releases_admin_read on app_releases for select to authenticated using (app.is_admin());
create policy releases_super_write on app_releases for all to authenticated using (app.is_super()) with check (app.is_super());
grant select on app_releases to authenticated;
grant insert, update, delete on app_releases to authenticated;
create trigger audit after insert or update or delete on app_releases for each row execute function app.audit();

-- latest version number only: safe to show in the public footer
create view public_app_version with (security_invoker = false) as
  select version, released_at from app_releases order by released_at desc, created_at desc limit 1;
grant select on public_app_version to anon, authenticated;

-- ===== Content revisions =====
create table content_revisions (
  id uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in ('pages','news_posts')),
  record_id uuid not null,
  revision int not null,
  snapshot jsonb not null,
  changed_fields text[] not null default '{}',
  change_note text check (char_length(change_note) <= 300),
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  restored_from uuid references content_revisions(id) on delete set null,
  unique (table_name, record_id, revision)
);
create index on content_revisions (table_name, record_id, revision desc);
alter table content_revisions enable row level security;
create policy revisions_admin_read on content_revisions for select to authenticated using (app.is_admin());
grant select on content_revisions to authenticated;   -- no client writes: only the trigger writes

create function app.snapshot_revision() returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb := to_jsonb(new); rev int; changed text[]; note text := nullif(current_setting('app.change_note', true), '');
        src uuid := nullif(current_setting('app.restored_from', true), '')::uuid;
begin
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    if (o - 'updated_at' - 'updated_by') = (n - 'updated_at' - 'updated_by') then return new; end if;
    select coalesce(array_agg(k order by k), '{}') into changed from jsonb_each(n) e(k, v)
      where k not in ('updated_at','updated_by') and o->k is distinct from v;
  else
    changed := array['created'];
  end if;
  select coalesce(max(revision), 0) + 1 into rev from content_revisions where table_name = tg_table_name and record_id = new.id;
  insert into content_revisions (table_name, record_id, revision, snapshot, changed_fields, change_note, changed_by, restored_from)
  values (tg_table_name, new.id, rev, n, changed, note, auth.uid(), src);
  return new;
end $$;
create trigger revisions after insert or update on pages     for each row execute function app.snapshot_revision();
create trigger revisions after insert or update on news_posts for each row execute function app.snapshot_revision();

-- restore: writes the old content back as a NEW revision (history is never rewritten); restored content is set to draft
create function public.restore_revision(p_revision uuid, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare r content_revisions; newrev int;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into r from content_revisions where id = p_revision;
  if not found then raise exception 'revision not found'; end if;
  perform set_config('app.change_note', coalesce(p_note, 'Restored revision ' || r.revision), true);
  perform set_config('app.restored_from', r.id::text, true);
  if r.table_name = 'pages' then
    update pages set title = r.snapshot->>'title', body_md = r.snapshot->>'body_md', seo_description = r.snapshot->>'seo_description',
      status = 'draft', updated_by = auth.uid() where id = r.record_id;
  else
    update news_posts set title = r.snapshot->>'title', excerpt = r.snapshot->>'excerpt', body_md = r.snapshot->>'body_md',
      cover_path = r.snapshot->>'cover_path', status = 'draft', published_at = null where id = r.record_id;
  end if;
  select max(revision) into newrev from content_revisions where table_name = r.table_name and record_id = r.record_id;
  return newrev;
end $$;
revoke all on function public.restore_revision(uuid, text) from public, anon;
grant execute on function public.restore_revision(uuid, text) to authenticated;

-- ===== Release history so far =====
insert into app_releases (version, kind, title, notes, released_at) values
 ('0.1.0','feature','Database, roles and permissions','Schema, row-level security, audit log, 4 roles.','2026-10-20'),
 ('0.2.0','feature','Languages and design system','English, Finnish, French; tokens and logo colours.','2026-10-24'),
 ('0.3.0','feature','Arabic, lineups and live match events','RTL layout, formations, goals, assists, cards, substitutions.','2026-10-28'),
 ('0.4.0','feature','Tryouts and membership payments','Tryout form, monthly/quarterly/yearly plans, MobilePay, wire, invoice.','2026-11-02'),
 ('0.5.0','feature','Training schedule, ratings, MVP, profiles','Recurring sessions, admin ratings, MVP vote with 24 h publish, photo-required profile.','2026-11-06'),
 ('0.6.0','feature','Locations, event types, enrolment','Saved pitches, route guide, Practice/Game/Friendly with division, enrolment page.','2026-11-10'),
 ('0.7.0','design','Big-club editorial design','Two-tier menu, black hero, news/results modules, values footer.','2026-11-12'),
 ('0.8.0','design','Rounded, simpler design','Nunito typeface, pill buttons, soft cards.','2026-11-13'),
 ('0.9.0','feature','Hero slider with video, version history','Dark hero slider using live club data and a video background; release log and page revision history for admins.','2026-11-13'),
 ('0.9.1','content','Women and Juniors pages, enrolment moved','Enrolment reached from the menu and team pages instead of the front page; Women and Juniors pages marked Upcoming.','2026-11-13');


-- ===== 20260101000017_membership_fees.sql =====
-- 0017 Club membership fees: 20 EUR / month, 60 EUR / quarter, 240 EUR / year. Release 0.10.0.
insert into membership_plans (name, description, amount_cents, currency, period, active) values
  ('Monthly',   'Membership billed every month',    2000,  'EUR', 'month',   true),
  ('Quarterly', 'Membership billed every 3 months', 6000,  'EUR', 'quarter', true),
  ('Yearly',    'Membership billed once a year',    24000, 'EUR', 'year',    true)
on conflict (name) do update set amount_cents = excluded.amount_cents, period = excluded.period, description = excluded.description, active = true;

insert into app_releases (version, kind, title, notes, released_at) values
  ('0.10.0','feature','Enrolment, Membership, Join and Contact pages','Separate public pages with their own menu items; fees 20 / 60 / 240 EUR; enrolment page no longer renders under the front page.', '2026-11-13')
on conflict (version) do nothing;


-- ===== 20260101000018_release_0_11_0.sql =====
-- 0018 Release 0.11.0: Team page; tryout and player enrolment live on the Join page; membership contents updated.
insert into app_releases (version, kind, title, notes, released_at) values
  ('0.11.0','feature','Team page, Join page with enrolment and tryout',
   'Included in membership: training, jersey and training bibs (without personal name), the app. Not included: player license, training ball, other training kits, shoes, socks, warm-up suits, drinking bottle. Tryout form removed from the front page.', '2026-11-13')
on conflict (version) do nothing;


-- ===== 20260101000019_fees_invoices_sponsor_packages.sql =====
-- 0019 Federation fees (license + insurance by age), invoice requests, Paytrail provider, sponsor packages. Release 0.12.0.

-- ===== Paytrail as a payment provider (bank payment). Provider names are config; secrets stay in env. =====
alter table payments       drop constraint payments_provider_check;
alter table payments       add constraint payments_provider_check check (provider in ('mobilepay','paytrail'));
alter table payment_events drop constraint payment_events_provider_check;
alter table payment_events add constraint payment_events_provider_check check (provider in ('mobilepay','paytrail'));

-- ===== Federation fees (not part of the club membership fee) =====
create table federation_fees (
  id uuid primary key default gen_random_uuid(),
  season int not null check (season between 2024 and 2100),
  kind text not null check (kind in ('license','insurance')),
  band text not null check (band ~ '^[a-z0-9_]+$'),             -- e.g. junior_2015_plus, junior_2007_2014, adult, under_12, age_12_69
  label text not null check (char_length(label) between 2 and 120),
  amount_cents int check (amount_cents is null or amount_cents >= 0),  -- null when the price is chosen at purchase
  currency text not null default 'EUR' check (currency = 'EUR'),
  notes text check (char_length(notes) <= 1000),
  verified boolean not null default false,                       -- true once an admin checked it against palloliitto.fi
  source_url text not null default 'https://www.palloliitto.fi/kilpailut/pelipassit-ja-vakuutukset' check (source_url ~ '^https://'),
  sort_order int not null default 100,
  active boolean not null default true,
  translations jsonb not null default '{}'::jsonb check (app.valid_translations(translations)),
  updated_at timestamptz not null default now(),
  unique (season, kind, band)
);
create trigger touch before update on federation_fees for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on federation_fees for each row execute function app.audit();
alter table federation_fees enable row level security;
create policy fees_public on federation_fees for select to anon, authenticated using (active);
create policy fees_admin  on federation_fees for all to authenticated using (app.is_admin()) with check (app.is_admin());
grant select on federation_fees to anon;
grant select, insert, update, delete on federation_fees to authenticated;

-- Season 2026 as quoted by clubs from Palloliitto's list; NOT verified against the official page yet (verified = false).
insert into federation_fees (season, kind, band, label, amount_cents, notes, sort_order) values
 (2026,'license','junior_2015_plus','Junior, born 2015 or later',2700,'Indicative. Verify on palloliitto.fi before publishing as final.',10),
 (2026,'license','junior_2007_2014','Junior, born 2007–2014',4300,'Indicative. Verify on palloliitto.fi before publishing as final.',20),
 (2026,'license','adult','Adult',5300,'Indicative. Verify on palloliitto.fi before publishing as final.',30),
 (2026,'insurance','under_12','Under 12',null,'Children under 12 with a player pass are covered by the federation group arrangement (per Palloliitto insurance document 2026). Confirm.',10),
 (2026,'insurance','age_12_69','Age 12 – 69',null,'Federation group insurance: broad cover (care compensation 3 000 EUR, deductible 100–300 EUR) or narrow cover (1 500 EUR, deductible 150 EUR). Optional leisure-time accident cover 40 or 80 EUR. Price is shown when buying the pass; annual prices range 10–695 EUR.',20),
 (2026,'insurance','age_70_plus','Age 70 and over',null,'Not covered by the federation group insurance. Arrange your own cover.',30),
 (2026,'insurance','adult_league','Adults in adult competitive leagues',null,'The adult hobby insurance is not valid in Palloliitto adult competitive leagues.',40);

-- ===== Invoice requests =====
create table invoice_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  plan_id uuid not null references membership_plans(id) on delete restrict,
  full_name text not null check (char_length(full_name) between 2 and 120),
  email citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone text check (phone is null or phone ~ '^[+0-9 ()-]{6,25}$'),
  player_name text check (char_length(player_name) <= 120),               -- when a parent pays for a child
  address text not null check (char_length(address) between 3 and 200),
  postal_code text not null check (char_length(postal_code) between 2 and 12),
  city text not null check (char_length(city) between 2 and 80),
  reference_note text check (char_length(reference_note) <= 200),
  locale text not null default 'en' check (locale in ('en','fi','fr','ar')),
  consent boolean not null check (consent),
  status text not null default 'new' check (status in ('new','invoiced','paid','cancelled')),
  invoice_number text,
  handled_by uuid references profiles(id) on delete set null,
  handled_at timestamptz
);
create unique index invoice_requests_one_open on invoice_requests (lower(email::text), plan_id) where status = 'new';
alter table invoice_requests enable row level security;
create policy invreq_insert on invoice_requests for insert to anon, authenticated with check (status = 'new' and handled_by is null and invoice_number is null and handled_at is null);
create policy invreq_admin_read on invoice_requests for select to authenticated using (app.is_admin());
create policy invreq_admin_upd  on invoice_requests for update to authenticated using (app.is_admin()) with check (app.is_admin());
grant insert on invoice_requests to anon, authenticated;
grant select, update on invoice_requests to authenticated;
create trigger audit after insert or update or delete on invoice_requests for each row execute function app.audit('redact');

-- ===== Sponsor packages ("how to sponsor") + sponsor enquiries =====
create table sponsor_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  summary text not null check (char_length(summary) between 5 and 400),
  benefits text[] not null default '{}',
  price_note text not null default 'On request' check (char_length(price_note) <= 80),
  sort_order int not null default 100,
  active boolean not null default true,
  translations jsonb not null default '{}'::jsonb check (app.valid_translations(translations)),
  updated_at timestamptz not null default now()
);
create trigger touch before update on sponsor_packages for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on sponsor_packages for each row execute function app.audit();
alter table sponsor_packages enable row level security;
create policy pkg_public on sponsor_packages for select to anon, authenticated using (active);
create policy pkg_admin  on sponsor_packages for all to authenticated using (app.is_admin()) with check (app.is_admin());
grant select on sponsor_packages to anon;
grant select, insert, update, delete on sponsor_packages to authenticated;
insert into sponsor_packages (name, summary, benefits, sort_order) values
 ('Main partner','Your brand on the match shirt and across the club.', array['Logo on the match shirt','Logo on website and app','Banner at home games','Social media features'], 10),
 ('Partner','Visible support for the club all season.', array['Logo on website','Banner at home games','Mentions in newsletters'], 20),
 ('Supporter','Help young players and the community.', array['Name on the supporters list','Thank-you post'], 30),
 ('In-kind partner','Kit, equipment, venues or services instead of money.', array['Agreed visibility in return'], 40);

alter table contact_messages add column company text check (char_length(company) <= 120);

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.12.0','feature','Membership details, insurance by age, invoice requests, Sponsors page','Federation license and insurance info by age; Paytrail bank payment; invoice request form; sponsor packages and how to sponsor.','2026-11-13')
on conflict (version) do nothing;


-- ===== 20260101000020_release_0_12_1.sql =====
-- 0020 Release 0.12.1: insurance options shown in full for ages 12-69 on the Membership page (no schema change).
insert into app_releases (version, kind, title, notes, released_at) values
 ('0.12.1','fix','Insurance options shown in full for ages 12–69','Broad cover, narrow cover and optional leisure-time accident cover are now listed for ages 12–19 and 20–69.','2026-11-13')
on conflict (version) do nothing;


-- ===== 20260101000021_insurance_prices.sql =====
-- 0021 Insurance prices by age/status, season 2026. Release 0.12.2.
-- Source: Palloliitto insurance document 2026 (price row V10..V31) and club pages quoting it.
-- The federation's own age table could not be read automatically, so every row stays verified = false until an admin checks it.
update federation_fees set notes = 'Price depends on birth year (see the price rows). Optional leisure-time accident cover 40 or 80 EUR.' where season = 2026 and kind = 'insurance' and band = 'under_12';
insert into federation_fees (season, kind, band, label, amount_cents, notes, sort_order) values
 (2026,'insurance','born_2020_plus','Born 2020 or later',1000,'Seen on a club page quoting Palloliitto (code V22). Verify.',11),
 (2026,'insurance','born_2015','Born 2015',7000,'Seen on a club page quoting Palloliitto (code V21 d, 70 EUR). Verify.',12),
 (2026,'insurance','born_2009_2011','Born 2009 – 2011 (ages 15 – 17)',23000,'Seen on a club page quoting Palloliitto (code V20 b, 230 EUR). Verify.',21),
 (2026,'insurance','adult_amateur_broad','Adult amateur, broad cover',39500,'Inferred from the federation PDF price row (V10). Verify.',31),
 (2026,'insurance','adult_amateur_narrow','Adult amateur, narrow cover',15000,'Inferred from the federation PDF price row (V11). Verify.',32),
 (2026,'insurance','contract_amateur_broad','Contracted amateur, broad cover',69500,'Inferred from the federation PDF price row (V12). Verify.',33),
 (2026,'insurance','contract_amateur_narrow','Contracted amateur, narrow cover',32500,'Inferred from the federation PDF price row (V13). Verify.',34)
on conflict (season, kind, band) do update set amount_cents = excluded.amount_cents, notes = excluded.notes, label = excluded.label;
insert into app_releases (version, kind, title, notes, released_at) values
 ('0.12.2','content','Insurance prices by age','Yearly insurance prices by birth year / status on the Membership page; unverified rows flagged.','2026-11-13')
on conflict (version) do nothing;


-- ===== 20260101000022_fee_status_signin_block.sql =====
-- 0022 Players see what they have paid / owe; players with overdue membership fees cannot sign in. Release 0.13.0.

-- ===== Policy (single row, admin-editable) =====
create table fee_policy (
  id uuid primary key default gen_random_uuid(),
  single boolean not null default true unique check (single),   -- guarantees exactly one row
  enabled boolean not null default true,
  grace_days int not null default 14 check (grace_days between 0 and 120),
  updated_at timestamptz not null default now()
);
insert into fee_policy default values;
create trigger touch before update on fee_policy for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on fee_policy for each row execute function app.audit();
alter table fee_policy enable row level security;
create policy fee_policy_admin on fee_policy for all to authenticated using (app.is_admin()) with check (app.is_admin());
grant select, update on fee_policy to authenticated;

-- ===== Admin override per player (players cannot edit these: not in their allowed-columns list) =====
alter table players
  add column fee_exempt_until date,
  add column fee_exempt_reason text check (char_length(fee_exempt_reason) <= 200);

-- ===== Core rule =====
-- A player is blocked when the policy is on, they have no exemption, and any fee is still unpaid more than grace_days after its due date.
create function app.player_blocked(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select fp.enabled
       and p.role = 'player' and p.status = 'active'
       and not coalesce(pl.fee_exempt_until >= current_date, false)
       and exists (select 1 from payments pay
                    where pay.player_id = pl.id and pay.status in ('pending','failed')
                      and pay.due_on is not null and pay.due_on + fp.grace_days < current_date)
    from fee_policy fp cross join profiles p left join players pl on pl.profile_id = p.id
    where p.id = p_user
  ), false)
$$;
revoke all on function app.player_blocked(uuid) from public, anon, authenticated;

-- Defence in depth for sessions that are already open: blocked players lose member-level reads (they can still read their own payments).
create or replace function app.is_active() returns boolean language sql stable security definer set search_path = public as
$$ select app.role() is not null and not app.player_blocked(auth.uid()) $$;

-- ===== Sign-in block: Supabase Auth "Custom Access Token" hook. Runs on every sign-in and token refresh. =====
create function public.custom_access_token_hook(event jsonb) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if app.player_blocked((event->>'user_id')::uuid) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'membership_fees_overdue'));
  end if;
  return event;
end $$;
revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
    grant usage on schema app to supabase_auth_admin;
    grant execute on function app.player_blocked(uuid) to supabase_auth_admin;
    grant select on fee_policy, profiles, players, payments to supabase_auth_admin;
  end if;
end $$;

-- ===== What a player sees =====
create view my_payments as
  select p.id, p.amount_cents, p.currency, p.status, p.method, p.due_on, p.paid_at, p.reference, p.invoice_number, p.checkout_url,
         case when p.status = 'paid' then 'paid'
              when p.status in ('pending','failed') and p.due_on is not null and p.due_on < current_date then 'overdue'
              else p.status::text end as display_status
  from payments p where p.player_id = app.my_player_id();
grant select on my_payments to authenticated;

create function public.my_payment_summary() returns table (
  team_name text, paid_cents bigint, owed_cents bigint, overdue_cents bigint,
  next_due_on date, sign_in_blocked_from date, exempt_until date, grace_days int, policy_enabled boolean)
language sql stable security definer set search_path = public as $$
  with me as (select app.my_player_id() as id),
  fp as (select * from fee_policy),
  t as (select tm.name from team_players tp join team_seasons ts on ts.id = tp.team_season_id join teams tm on tm.id = ts.team_id, me
         where tp.player_id = me.id and tp.left_on is null order by ts.created_at desc limit 1)
  select (select name from t),
         coalesce(sum(p.amount_cents) filter (where p.status = 'paid'), 0),
         coalesce(sum(p.amount_cents) filter (where p.status in ('pending','failed')), 0),
         coalesce(sum(p.amount_cents) filter (where p.status in ('pending','failed') and p.due_on < current_date), 0),
         min(p.due_on) filter (where p.status in ('pending','failed')),
         min(p.due_on) filter (where p.status in ('pending','failed') and p.due_on is not null) + (select grace_days from fp),
         (select fee_exempt_until from players where id = (select id from me)),
         (select grace_days from fp), (select enabled from fp)
  from payments p where p.player_id = (select id from me)
$$;
revoke all on function public.my_payment_summary() from public, anon;
grant execute on function public.my_payment_summary() to authenticated;

-- ===== Admin tools =====
create function public.fee_overview() returns table (player_id uuid, player_name text, team_name text, owed_cents bigint, oldest_due date, days_overdue int, blocked boolean, exempt_until date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query
  select pl.id, pl.first_name || ' ' || pl.last_name,
         (select tm.name from team_players tp join team_seasons ts on ts.id = tp.team_season_id join teams tm on tm.id = ts.team_id where tp.player_id = pl.id and tp.left_on is null order by ts.created_at desc limit 1),
         sum(p.amount_cents), min(p.due_on), greatest(0, current_date - min(p.due_on))::int,
         coalesce(pl.profile_id is not null and app.player_blocked(pl.profile_id), false), pl.fee_exempt_until
  from players pl join payments p on p.player_id = pl.id and p.status in ('pending','failed')
  group by pl.id order by min(p.due_on) nulls last;
end $$;
revoke all on function public.fee_overview() from public, anon;
grant execute on function public.fee_overview() to authenticated;

create function public.set_fee_exemption(p_player uuid, p_until date, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update players set fee_exempt_until = p_until, fee_exempt_reason = p_reason where id = p_player;
  if not found then raise exception 'player not found'; end if;
end $$;
revoke all on function public.set_fee_exemption(uuid, date, text) from public, anon;
grant execute on function public.set_fee_exemption(uuid, date, text) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.13.0','feature','Payment status for players, sign-in block for unpaid fees',
  'Players see paid and owed amounts and their team; players with fees overdue beyond the grace period (default 14 days) cannot sign in until paid or exempted by an admin.','2026-11-13')
on conflict (version) do nothing;


-- ===== 20260101000023_lineup_templates.sql =====
-- 0023 Release 0.14.0: saved lineup templates (formation, positions, bench, tactic arrows, private coach notes).
-- Only the team's coaches and admins can see or change them; players and the public never can.
create table lineup_templates (
  id uuid primary key default gen_random_uuid(),
  team_season_id uuid not null references team_seasons(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  formation text not null check (char_length(formation) between 3 and 12),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 20000),  -- slots, positions, bench, captain, arrows, kit, pitch
  coach_notes text check (char_length(coach_notes) <= 2000),                                                        -- private to coaches
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_season_id, name)
);
create index on lineup_templates (team_season_id);
create trigger touch before update on lineup_templates for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on lineup_templates for each row execute function app.audit();
alter table lineup_templates enable row level security;
revoke all on lineup_templates from anon;
create policy lt_coach on lineup_templates for all to authenticated
  using (app.is_admin() or app.coaches_ts(team_season_id)) with check (app.is_admin() or app.coaches_ts(team_season_id));

insert into app_releases (version, kind, title, notes, released_at) values
  ('0.14.0','feature','Better lineup builder',
   'Auto-fill, player availability, search and filters, substitutes strip, lineup check, tactic arrows, undo and redo, kit and pitch styles, saved lineups with private coach notes, image download and copy as text.', '2026-11-13')
on conflict (version) do nothing;


-- ===== 20260101000024_phone_country_code.sql =====
-- 0024 Release 0.14.1: phone numbers must include the country code (e.g. +358 40 123 4567).
-- NOT VALID = checked for every new or changed row; old rows are left alone until they are edited (then run VALIDATE CONSTRAINT after cleaning data).
alter table profiles add constraint profiles_phone_e164 check (phone is null or regexp_replace(phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table player_private add constraint player_private_phone_e164 check (phone is null or regexp_replace(phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table player_private add constraint player_private_emergency_phone_e164 check (emergency_phone is null or regexp_replace(emergency_phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table join_requests add constraint join_requests_phone_e164 check (phone is null or regexp_replace(phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table tryout_requests add constraint tryout_requests_phone_e164 check (phone is null or regexp_replace(phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table tryout_requests add constraint tryout_requests_guardian_phone_e164 check (guardian_phone is null or regexp_replace(guardian_phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table player_enrolments add constraint player_enrolments_phone_e164 check (phone is null or regexp_replace(phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table player_enrolments add constraint player_enrolments_guardian_phone_e164 check (guardian_phone is null or regexp_replace(guardian_phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table invoice_requests add constraint invoice_requests_phone_e164 check (phone is null or regexp_replace(phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;

insert into app_releases (version, kind, title, notes, released_at) values
  ('0.14.1','feature','Lineup photos and calendar, phone country code',
   'Lineup: grass field with player photos on team-coloured shirts. Profile and forms: selectable birth-date calendar. Phone numbers must start with the country code, for example +358.', '2026-11-13')
on conflict (version) do nothing;


-- ===== 20260101000025_enrolment_nationality_code.sql =====
-- 0025 Release 0.14.2: enrolment nationality is chosen from a country list and stored as a two-letter ISO country code (e.g. FI, GH).
alter table player_enrolments add constraint player_enrolments_nationality_iso check (nationality is null or nationality ~ '^[A-Z]{2}$') not valid;
insert into app_releases (version, kind, title, notes, released_at) values
  ('0.14.2','feature','Join page: collapsible forms, country list, calendar styling',
   'Tryout and enrolment forms open and close; nationality is picked from a country list; the birth-date calendar has a dark, readable header; membership FAQ updated.', '2026-11-13')
on conflict (version) do nothing;


-- ===== 20260101000026_release_0_15_0.sql =====
-- 0026 Release 0.15.0: new typeface (Figtree).
insert into app_releases (version, kind, title, notes, released_at) values
  ('0.15.0','design','New typeface: Figtree','Figtree replaces Nunito for Latin text and headings. Arabic keeps Cairo.', '2026-11-13')
on conflict (version) do nothing;


-- ===== seed.sql =====
-- Reference data only (no fake people, no demo content).
insert into evaluation_criteria (name, category, sort_order) values
 ('First touch','technical',10),('Passing','technical',20),('Shooting','technical',30),('Dribbling','technical',40),
 ('Positioning','tactical',50),('Decision making','tactical',60),('Pressing and recovery','tactical',70),
 ('Speed','physical',80),('Stamina','physical',90),('Strength','physical',100),
 ('Focus','mental',110),('Confidence','mental',120),
 ('Punctuality','attitude',130),('Teamwork','attitude',140),('Respect and fair play','attitude',150)
on conflict (name) do nothing;
insert into site_settings (key, value, is_public) values
 ('club', '{"name":"Afro Foot Club","legal_name":"Afro Foot Club ry","tagline":"Where the world plays as one.","founded":2020,"country":"Finland","fifa_id":"149PZFE"}', true),
 ('contact', '{"email":"info@afrofoot.club","phone":"+358 50 477 3030","contact_person":"Sefako Yao, GM"}', true),
 ('social', '{"facebook":"https://facebook.com/afrofootclub","twitter":"https://twitter.com/AfroFootClub","instagram":"https://instagram.com/afrofootclub"}', true),
 ('locale', '{"timezone":"Europe/Helsinki","currency":"EUR","languages":["en","fi","fr"]}', true)
on conflict (key) do nothing;

