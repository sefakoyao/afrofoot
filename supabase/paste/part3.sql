-- Afro Foot 2.0 database setup, part 3 of 3. Paste into Supabase > SQL Editor and click Run. Run the parts in order, once each.
-- Contains: 20260101000015_locations_events_enrolment.sql, 20260101000016_versions_revisions.sql, 20260101000017_membership_fees.sql, 20260101000018_release_0_11_0.sql, 20260101000019_fees_invoices_sponsor_packages.sql, 20260101000020_release_0_12_1.sql, 20260101000021_insurance_prices.sql, 20260101000022_fee_status_signin_block.sql, 20260101000023_lineup_templates.sql, 20260101000024_phone_country_code.sql, 20260101000025_enrolment_nationality_code.sql, 20260101000026_release_0_15_0.sql, 20260101000027_automatic_invoices.sql, 20260101000028_code_of_conduct.sql, 20260101000029_event_replies.sql, 20260101000030_player_contracts.sql, 20260101000031_match_day.sql, 20260101000032_lineup_board.sql, 20260101000033_social_sign_in.sql, 20260101000034_events_public_schedule.sql, 20260101000035_phone_sign_up.sql, 20260101000036_invoice_after_consents.sql, 20260101000037_automatic_contracts.sql, 20260101000038_amateur_contract.sql, 20260101000040_federation_sync.sql, 20260101000041_squad_consent_stats.sql, 20260101000042_squad_from_palloliitto.sql, 20260101000043_top_scorers.sql, 20260101000044_signin_help.sql, 20260101000045_player_coach.sql, 20260101000046_requests_inbox.sql, 20260101000047_match_details.sql, seed.sql


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


-- ===== 20260101000027_automatic_invoices.sql =====
-- 0027 Automatic membership invoices: invoice lines, billing details, and a nightly job that issues the invoices that are due.
-- An invoice is a payment with method 'invoice' (invoice number and Finnish reference number come from app.payment_defaults, 0013).

-- ===== Billing details printed on every invoice (filled in by an administrator; public so the website can show them for transfers) =====
insert into site_settings (key, value, is_public) values ('billing', jsonb_build_object(
  'legal_name', '', 'street', '', 'postal_city', '', 'business_id', '',
  'iban', '', 'bic', '', 'bank', '', 'email', '', 'phone', '', 'website', '', 'contact_person', '',
  'payment_terms_days', 14,     -- due date = invoice date + this many days (never before the period starts)
  'lead_days', 14,              -- issue the invoice this many days before the period starts
  'late_interest', '8.00'       -- shown on the invoice, per cent
), true) on conflict (key) do nothing;

-- ===== Invoice lines =====
create table payment_lines (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  position int not null default 1 check (position between 1 and 100),
  description text not null check (char_length(description) between 1 and 200),
  line_date date,
  quantity numeric(8,2) not null default 1 check (quantity > 0),
  unit text not null default 'kpl' check (char_length(unit) between 1 and 10),
  unit_price_cents int not null check (unit_price_cents >= 0),
  vat_percent numeric(4,2) not null default 0 check (vat_percent between 0 and 30),
  created_at timestamptz not null default now(),
  unique (payment_id, position)
);
create index on payment_lines (payment_id);
alter table payment_lines enable row level security;
create policy admin_all on payment_lines for all to authenticated using (app.is_admin()) with check (app.is_admin());
-- Players read the lines of their own invoices (same rule as payments_self).
create policy lines_self on payment_lines for select to authenticated
  using (exists (select 1 from payments p where p.id = payment_id and p.player_id = app.my_player_id()));
create trigger audit after insert or update or delete on payment_lines for each row execute function app.audit();
revoke all on payment_lines from anon;

-- ===== Issue the invoices that are due =====
-- A membership is invoiced when it is active, set to renew automatically, has a next invoice date within lead_days, a plan with a
-- price and a regular period, and has not ended. Each invoice covers one plan period with one line per month (one line for a season),
-- then next_due_on moves to the next period, so running this again never invoices the same period twice.
-- Returns the number of invoices issued. Nothing happens while the club's IBAN is not filled in.
create function app.generate_due_invoices(p_today date default (now() at time zone 'Europe/Helsinki')::date) returns int
language plpgsql security definer set search_path = public as $$
declare
  b jsonb; terms int; lead int; m record; months int; per int; i int; v_pay uuid; n int := 0;
begin
  select value into b from site_settings where key = 'billing';
  if b is null or coalesce(b->>'iban', '') = '' then
    raise notice 'Billing details (IBAN) are missing: no invoices issued.';
    return 0;
  end if;
  terms := greatest(0, least(120, coalesce((b->>'payment_terms_days')::int, 14)));
  lead := greatest(0, least(60, coalesce((b->>'lead_days')::int, 14)));
  for m in
    select ms.id, ms.player_id, ms.next_due_on, ms.ends_on, mp.amount_cents, mp.currency, mp.period
    from memberships ms join membership_plans mp on mp.id = ms.plan_id
    where ms.status = 'active' and ms.auto_renew and ms.next_due_on is not null and ms.next_due_on - lead <= p_today
      and mp.amount_cents > 0 and mp.period in ('month', 'quarter', 'year', 'season')
      and (ms.ends_on is null or ms.next_due_on <= ms.ends_on)
    order by ms.next_due_on
    for update of ms skip locked
  loop
    months := case m.period when 'month' then 1 when 'quarter' then 3 when 'year' then 12 end;  -- null for a season
    insert into payments (player_id, membership_id, amount_cents, currency, method, status, due_on, invoice_sent_at, notes)
    values (m.player_id, m.id, m.amount_cents, m.currency, 'invoice', 'pending', greatest(p_today + terms, m.next_due_on), now(), 'automatic invoice')
    returning id into v_pay;
    if months is null then
      insert into payment_lines (payment_id, position, description, line_date, unit_price_cents) values (v_pay, 1, 'Membership fees', m.next_due_on, m.amount_cents);
    else
      per := m.amount_cents / months;   -- whole cents; the last line takes the remainder so the lines add up exactly
      for i in 0 .. months - 1 loop
        insert into payment_lines (payment_id, position, description, line_date, unit_price_cents)
        values (v_pay, i + 1, 'Membership fees', (m.next_due_on + make_interval(months => i))::date,
                case when i = months - 1 then m.amount_cents - per * (months - 1) else per end);
      end loop;
    end if;
    update memberships set next_due_on = case when months is null then null else (m.next_due_on + make_interval(months => months))::date end
    where id = m.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function app.generate_due_invoices(date) from public, anon, authenticated;

-- "Run now" for administrators (the nightly job runs the same function).
create function public.run_invoice_generation() returns int language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return app.generate_due_invoices();
end $$;
revoke all on function public.run_invoice_generation() from public, anon;
grant execute on function public.run_invoice_generation() to authenticated;

-- Players see the invoice number with their own payments (my_payments already has it); nothing else changes for them.

-- ===== Nightly schedule (Supabase pg_cron). 04:15 UTC = 06:15 or 07:15 in Helsinki. Skipped where pg_cron is not available. =====
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('afrofoot-invoices', '15 4 * * *', 'select app.generate_due_invoices()');
    exception when others then
      raise notice 'Could not schedule the invoice job (%). In Supabase: Database > Extensions > enable pg_cron, then run: select cron.schedule(''afrofoot-invoices'', ''15 4 * * *'', ''select app.generate_due_invoices()'');', sqlerrm;
    end;
  else
    raise notice 'pg_cron is not available here: schedule app.generate_due_invoices() another way.';
  end if;
end $$;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.16.0','feature','Automatic membership invoices',
  'Invoices are issued automatically for active memberships set to renew (one line per month, one invoice per plan period), with the club''s bank details, Finnish reference number and bank barcode. Players open them from their page.','2026-11-15')
on conflict (version) do nothing;


-- ===== 20260101000028_code_of_conduct.sql =====
-- 0028 Code of Conduct: versions of the club's code and each member's consent to the current one. Release 0.17.0.
-- A new version (is_current) asks everyone again: consent is recorded per version and never edited (append-only, audited).

create table conduct_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (version ~ '^[0-9A-Za-z._-]{1,20}$'),
  title text not null check (char_length(title) between 3 and 160),
  published_label text check (char_length(published_label) <= 80),       -- as printed on the document, e.g. "Updated November 2027"
  body text not null check (char_length(body) between 10 and 40000),      -- "## Heading", "- bullet" and paragraphs; shown in the app
  pdf_path text check (pdf_path ~ '^/documents/[a-z0-9._-]+\.pdf$'),     -- the signed original, served by the app
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index conduct_versions_one_current on conduct_versions (is_current) where is_current;
alter table conduct_versions enable row level security;
create policy admin_all on conduct_versions for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy member_read on conduct_versions for select to authenticated using (app.is_active());
create trigger audit after insert or update or delete on conduct_versions for each row execute function app.audit();
revoke all on conduct_versions from anon;

create table conduct_consents (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references conduct_versions(id) on delete restrict,
  profile_id uuid not null references profiles(id) on delete cascade,
  consented_at timestamptz not null default now(),
  unique (version_id, profile_id)
);
create index on conduct_consents (profile_id);
alter table conduct_consents enable row level security;
-- Members agree for themselves, to the current version only, and can read their own consents.
create policy consent_self_insert on conduct_consents for insert to authenticated
  with check (profile_id = auth.uid() and app.is_active() and exists (select 1 from conduct_versions v where v.id = version_id and v.is_current));
create policy consent_self_read on conduct_consents for select to authenticated using (profile_id = auth.uid());
-- Admins see everyone's; coaches see the players of their own teams (to know who still has to agree).
create policy consent_admin_read on conduct_consents for select to authenticated using (app.is_admin());
create policy consent_coach_read on conduct_consents for select to authenticated
  using (exists (select 1 from players pl where pl.profile_id = conduct_consents.profile_id and app.coaches_player(pl.id)));
create trigger audit after insert or update or delete on conduct_consents for each row execute function app.audit();
revoke all on conduct_consents from anon;
revoke update, delete on conduct_consents from authenticated;   -- a consent is never changed or withdrawn silently

-- The club's Code of Ethics as published (PDF "Afro Foot Club Code of Conduct 2027").
insert into conduct_versions (version, title, published_label, pdf_path, is_current, body) values ('2027', 'Code of Ethics', 'Updated November 2027',
 '/documents/afro-foot-club-code-of-ethics-2027.pdf', true, $body$## I. Preamble
Officially registered with the Finnish Patent and Registration Office (PRH) on 24th July, 2020 as "Afro Foot Club ry," domiciled in Helsinki, Finland. The AFRO FOOT Club ry is for sports and recreation. It is a community that operates on the principle of equality, encouraging participation based on trust and respect.
All those involved with the game at every level, whether as a player, spectator, match official, coach, founder, or administrator, have a responsibility, above and beyond compliance with the law, to act according to the highest standards of integrity and ensure that the game's reputation is and remains high.
This Code of Conduct applies to all those involved in football under the auspices of The AFRO FOOT Club.
This is designed to ensure that all team members refrain from actions that could breach, violate, threaten, upset, insult, demean, or discriminate against anyone based on their gender, race, nationality, beliefs, caste, disability, age, religious or political views, sexual orientation, social status, ethnic background, language, marital or civil partnerships, and color.
All club stakeholders share responsibility for fostering a clean, healthy environment. They are tasked with maintaining the premises in a clean, tidy condition to enhance the club's positive image.
## II. Respect
Respect is the AFRO FOOT Club's response to a clear message from throughout the game.
Football's health depends upon high standards of behavior on and off the pitch.
- It is a behavioral code for the AFRO FOOT Club.
- It is about recognizing that the integrity of the game is more important than the match result.
- It is for ALL and plays a key part in uniting the game.
- Respect involves establishing clear guidelines on acceptable and unacceptable conduct within the AFRO FOOT Club and throughout SUOMEN PALLOLIITTO.
- It is about those involved taking responsibility for the consequences of their actions.
- It is about supporting match officials in doing their jobs effectively and efficiently.
- Respect is not a slogan. Football players are collectively responsible for creating a safe, fun, and inclusive environment where the game can take place.
The Respect Codes of Conduct specify expectations for all participants in a game, including players, coaches, match officials, and spectators, to ensure a safe, enjoyable, and inclusive environment. They also list various sanctions for those who break these codes.
Our collective duty is to uphold high standards of conduct during every game, both on and off the field. Please do your part and adhere to the Club's Respect Code of Conduct for Players/Members, Spectators, Coaches, Team Managers, and Club Officials below.
## III. Code of conduct for members/players
As a team member/player, I will:
- Adhere to the laws of the game by promoting its reputation and taking all possible steps to ensure that it is not brought into disrepute.
- Consistently display and promote high standards of behavior and fair play.
- Ensure the game is played and conducted in accordance with the principles of disciplined sporting behavior. Acknowledge that relying solely on match officials to maintain these principles is insufficient.
- Arrive for training and matches in good time to prepare thoroughly and with appropriate kit for the activity.
- Always respect, observe, and acknowledge the match officials' and other disciplinary bodies' decisions, and, should the need arise, respectfully seek the audience's attention.
- Never engage in undue public criticism of the match officials.
- Never engage in bullying, intimidation, or harassment towards any team player.
- I always speak about my teammates, the opponents, and the coach or manager. I shall not commit any doping offenses under the World Anti-Doping Agency (WADA) Code.
- Do not engage in, support, tolerate, or promote offensive, insulting, or abusive language, gestures, anti-social behavior, lewd acts, excessive drinking, prohibited substances, rule violations, rough play, or force any club member to participate in such activities towards any players, match officials, or spectators.
- Cooperate with coaches, managers, match officials, teammates, and opponents, and endeavor never to forget that we all make mistakes.
- Win or lose with dignity. Thank you, and shake hands with the opposing team and the referee at the end of every game.
I understand that if I do not follow this Code of Conduct, any or all of the following actions may be taken by SUOMEN PALLOLIITTO or The AFRO FOOT Club against me: I may be:
- Be required to apologize to teammates, the opposing team, the referee, or the team manager.
- Receive a warning from the coach.
- Receive a written warning from the club committee.
- Be dropped or substituted.
- Be suspended from training.
- Not selected for the upcoming team.
- Be required to serve a suspension.
- Be fined.
- In extreme circumstances, I may be required to leave the club indefinitely.
## IV. Code of conduct for spectators
As a Spectator, I will:
- Remember that children watch and play for FUN; let us set a good example for them and extend the same respect to them as we do to adults.
- I appreciate the effort, good play, and success of both teams.
- Respect the Referee's decisions even when I disagree with them.
- Remain behind the touchline and within the Designated Spectators' Area (where provided).
- Support positively: Let the coach and players do their jobs, and refrain from ridiculing or scolding them for mistakes, or from confusing players by telling them what to do.
- Respect and encourage the players to respect the opponents, coaches, referees, and match officials.
- I endeavor to understand the laws and rules of the game so I can better observe and comment on what I see.
- Never engage in or tolerate profane, offensive, insulting, or abusive language or behavior, or harass physically or verbally any players, managers, coaches, match officials, or other spectators.
I understand that if I do not follow this Code of Conduct, any or all of the following actions may be taken by SUOMEN PALLOLIITTO or The AFRO FOOT Club against me: I may be:
- Issued with a verbal warning from a club or league official.
- Required to meet with the club committee.
- Obligated to leave the match venue by the club.
- Requested by the club not to attend future games.
- I have had my club membership suspended or revoked.
- Required to leave the club.
## V. Code of conduct for coaches, team managers and club officials
As a Coach, Team Manager, and Club Official, I will:
- I will always use my position to set a positive example for the people I am responsible for and always consider their well-being and safety.
- Show respect to others involved in the game, including match officials, opponents' players, coaches, managers, officials, and spectators. Ensure that all activities are appropriate to the age, experience, and ability of those participating.
- Adhere to the laws and spirit of the game by consistently displaying high standards of behavior and by developing an appropriate working relationship with participants based on mutual respect and trust.
- Promote positive aspects of the sport, such as Fair Play and high standards of behavior.
- Respect the match official's decision and encourage participants to do the same. They should take responsibility for their performance and behavior and value overall performance rather than just results.
- Never enter the field of play without the referee's permission, and never exert undue influence over performers to obtain personal benefit or reward.
- Never engage in, condone, tolerate, or promote offensive, insulting, or abusive language, gestures, antisocial behavior, lewd acts, or excessive drinking, the use of prohibited substances, rule violations, or rough play, or force any club member to participate in such activities toward any or all players, match officials, or spectators.
- Be gracious in victory and defeat.
I understand that if I do not follow this Code of Conduct, any or all of the following actions may be taken by SUOMEN PALLOLIITTO or The AFRO FOOT Club against me: I may be:
- Suspended by the club from attending or officiating in any matches.
- Stripped of any decision-making abilities.
- Receive a written warning from the Club Committee.
- Suspended or fined by the SUOMEN PALLOLIITTO.
- In extreme circumstances, they may be required to leave the match venue or be sacked by the club.
## Afro Foot members' playbook
- Stay disciplined on the bench — only designated players handle changes and coaching.
- Take warm-ups seriously from the start.
- Always respect the referee, regardless of the result.
- Win, lose, or draw — we stand together.
- Maintain team image — everyone must behave appropriately at all times.
- Represent Afrofoot with pride on and off the pitch.
I hereby agree to these terms.$body$)
on conflict (version) do nothing;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.17.0','feature','Code of Conduct consent, player calendar and membership tabs',
  'Players read and agree to the club''s Code of Conduct in the app (per version); admins and coaches see who has not agreed. The player page has Calendar and Membership tabs.','2026-11-15')
on conflict (version) do nothing;


-- ===== 20260101000029_event_replies.sql =====
-- 0029 Event replies: players sign in (yes) or out (no) for trainings, matches and friendlies from their calendar.
-- The rows already exist (seeded from the roster, migration 0007) and players may update their own (policies
-- attendance_self_update / mavail_self_update, columns limited by app.restrict_columns). This adds the rules the
-- database did not enforce yet: a player may only answer before the event starts and while it is still scheduled,
-- and the answer time is always set by the database.

create function app.guard_event_reply() returns trigger language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_status text; v_self boolean;
begin
  if new.availability is not distinct from old.availability and new.note is not distinct from old.note then
    new.responded_at := old.responded_at; -- the answer time follows the answer and cannot be set on its own
    return new;
  end if;
  new.responded_at := case when new.availability = 'pending' then null else now() end;
  -- Coaches and admins may correct answers at any time (e.g. a player who called in).
  v_self := exists (select 1 from players p where p.id = new.player_id and p.profile_id = auth.uid());
  if not v_self or app.is_admin() or app.role() = 'coach' then return new; end if;
  if tg_table_name = 'session_attendance' then
    select s.starts_at, s.status::text into v_start, v_status from training_sessions s where s.id = new.session_id;
  else
    select m.kickoff_at, m.status::text into v_start, v_status from matches m where m.id = new.match_id;
  end if;
  if v_status is distinct from 'scheduled' or v_start <= now() then
    raise exception 'Replies are closed for this event' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger guard_reply before update on session_attendance for each row execute function app.guard_event_reply();
create trigger guard_reply before update on match_availability for each row execute function app.guard_event_reply();


-- ===== 20260101000030_player_contracts.sql =====
-- 0030 Digital player contracts (1, 2 or 3 years) between the club and a player. Release 0.18.0.
-- Flow: an admin drafts a contract from the template → sends it (text locked, fingerprint stored) → the player signs
-- with their name in the app (or declines) → a club admin countersigns → active. Confidential: only the player and
-- admins can read it, never coaches. Every change is audited.

create type contract_status as enum ('draft', 'sent', 'player_signed', 'active', 'declined', 'cancelled', 'terminated');

-- ===== Template (admins edit it; a new draft starts from it) =====
create table contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 80),
  body text not null check (char_length(body) between 50 and 40000),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contract_templates_one_default on contract_templates (is_default) where is_default;
alter table contract_templates enable row level security;
create policy admin_all on contract_templates for all to authenticated using (app.is_admin()) with check (app.is_admin());
revoke all on contract_templates from anon;
create trigger audit after insert or update or delete on contract_templates for each row execute function app.audit();
create trigger touch_updated_at before update on contract_templates for each row execute function app.touch_updated_at();

-- ===== Contracts =====
create table player_contracts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete restrict,
  team_season_id uuid references team_seasons(id) on delete set null,
  title text not null check (char_length(title) between 3 and 160),
  years smallint not null check (years between 1 and 3),
  starts_on date not null,
  ends_on date not null,
  body text not null check (char_length(body) between 50 and 40000),
  body_sha256 text check (body_sha256 ~ '^[0-9a-f]{64}$'),   -- fingerprint of the text the player was sent and signed
  status contract_status not null default 'draft',
  sent_at timestamptz,
  player_signed_at timestamptz,
  player_signed_name text check (char_length(player_signed_name) between 2 and 160),
  club_signed_at timestamptz,
  club_signed_by uuid references profiles(id) on delete set null,
  club_signed_name text check (char_length(club_signed_name) between 2 and 160),
  declined_at timestamptz,
  decline_reason text check (char_length(decline_reason) <= 500),
  cancelled_at timestamptz,
  terminated_on date,
  termination_reason text check (char_length(termination_reason) <= 500),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on > starts_on),
  check (ends_on <= starts_on + make_interval(years => years::int)),            -- the term fits the chosen 1, 2 or 3 years
  check (status = 'draft' or (sent_at is not null and body_sha256 is not null)),
  check (status not in ('player_signed', 'active', 'terminated') or (player_signed_at is not null and player_signed_name is not null)),
  check (status not in ('active', 'terminated') or (club_signed_at is not null and club_signed_name is not null)),
  check (status <> 'terminated' or terminated_on is not null)
);
create index on player_contracts (player_id);
create index on player_contracts (status);
alter table player_contracts enable row level security;
create policy admin_all on player_contracts for all to authenticated using (app.is_admin()) with check (app.is_admin());
-- The player reads their own contracts once sent (never drafts). Signing goes through sign_contract / decline_contract.
create policy contract_self_read on player_contracts for select to authenticated using (player_id = app.my_player_id() and status <> 'draft');
revoke all on player_contracts from anon;
create trigger audit after insert or update or delete on player_contracts for each row execute function app.audit();
create trigger touch_updated_at before update on player_contracts for each row execute function app.touch_updated_at();

-- Allowed status changes, the text locked once sent, signatures only by the right person, no overlapping contracts.
create function app.guard_contract() returns trigger language plpgsql security definer set search_path = public as $$
declare v_player_profile uuid;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Only drafts can be deleted' using errcode = 'check_violation'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then raise exception 'A contract starts as a draft' using errcode = 'check_violation'; end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and (new.body, new.player_id, new.starts_on, new.ends_on, new.years, new.title, new.body_sha256, new.sent_at)
        is distinct from (old.body, old.player_id, old.starts_on, old.ends_on, old.years, old.title, old.body_sha256, old.sent_at) then
      raise exception 'A sent contract cannot be changed' using errcode = 'check_violation';
    end if;
    if new.status is distinct from old.status then
      if not ((old.status = 'draft' and new.status in ('sent', 'cancelled'))
           or (old.status = 'sent' and new.status in ('player_signed', 'declined', 'cancelled'))
           or (old.status = 'player_signed' and new.status in ('active', 'cancelled'))
           or (old.status = 'active' and new.status = 'terminated')) then
        raise exception 'Contract cannot go from % to %', old.status, new.status using errcode = 'check_violation';
      end if;
      select profile_id into v_player_profile from players where id = new.player_id;
      if new.status = 'sent' then
        if position('[[' in new.body) > 0 then raise exception 'Fill in every [[…]] blank before sending' using errcode = 'check_violation'; end if;
        new.sent_at := now();
        new.body_sha256 := encode(sha256(convert_to(new.body, 'UTF8')), 'hex');
      elsif new.status in ('player_signed', 'declined') then
        if auth.uid() is distinct from v_player_profile then raise exception 'Only the player can sign or decline' using errcode = '42501'; end if;
        if new.status = 'player_signed' then new.player_signed_at := now(); else new.declined_at := now(); end if;
      elsif new.status = 'active' then
        if not app.is_admin() or auth.uid() is not distinct from v_player_profile then
          raise exception 'A club admin countersigns' using errcode = '42501';
        end if;
        new.club_signed_at := now();
        new.club_signed_by := auth.uid();
        new.club_signed_name := coalesce(nullif(trim((select first_name || ' ' || last_name from profiles where id = auth.uid())), ''), 'Club representative');
      elsif new.status = 'cancelled' then
        new.cancelled_at := now();
      end if;
    end if;
    -- signature fields only change together with the matching status change above
    if new.status = old.status and (new.player_signed_at, new.player_signed_name, new.club_signed_at, new.club_signed_by, new.club_signed_name)
        is distinct from (old.player_signed_at, old.player_signed_name, old.club_signed_at, old.club_signed_by, old.club_signed_name) then
      raise exception 'Signatures cannot be edited' using errcode = 'check_violation';
    end if;
  end if;
  -- one live contract at a time for the same dates
  if new.status in ('sent', 'player_signed', 'active') and exists (
      select 1 from player_contracts c where c.player_id = new.player_id and c.id <> new.id
        and c.status in ('sent', 'player_signed', 'active') and daterange(c.starts_on, c.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')) then
    raise exception 'This player already has a contract for these dates' using errcode = 'unique_violation';
  end if;
  return new;
end $$;
create trigger guard before insert or update or delete on player_contracts for each row execute function app.guard_contract();

-- ===== Player actions (security definer: players have no update right on the table) =====
create function public.sign_contract(p_id uuid, p_name text) returns void language plpgsql security definer set search_path = public as $$
declare c player_contracts; v_expected text; norm text;
begin
  select * into c from player_contracts where id = p_id and player_id = app.my_player_id() and status = 'sent' for update;
  if not found or not app.is_active() then raise exception 'No contract to sign' using errcode = 'no_data_found'; end if;
  if c.ends_on < current_date then raise exception 'This contract has expired' using errcode = 'check_violation'; end if;
  if c.body_sha256 is distinct from encode(sha256(convert_to(c.body, 'UTF8')), 'hex') then raise exception 'Contract text changed' using errcode = 'check_violation'; end if;
  norm := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
  select lower(regexp_replace(trim(first_name || ' ' || last_name), '\s+', ' ', 'g')) into v_expected from profiles where id = auth.uid();
  if norm = '' or norm is distinct from v_expected then raise exception 'Type your full name as it appears on your account' using errcode = 'check_violation'; end if;
  update player_contracts set status = 'player_signed', player_signed_name = regexp_replace(trim(p_name), '\s+', ' ', 'g') where id = p_id;
end $$;

create function public.decline_contract(p_id uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(p_reason, '')) > 500 then raise exception 'Reason too long' using errcode = 'check_violation'; end if;
  update player_contracts set status = 'declined', decline_reason = nullif(trim(p_reason), '')
   where id = p_id and player_id = app.my_player_id() and status = 'sent' and app.is_active();
  if not found then raise exception 'No contract to decline' using errcode = 'no_data_found'; end if;
end $$;
revoke all on function public.sign_contract(uuid, text) from public, anon;
revoke all on function public.decline_contract(uuid, text) from public, anon;
grant execute on function public.sign_contract(uuid, text) to authenticated;
grant execute on function public.decline_contract(uuid, text) to authenticated;

-- ===== Default template =====
-- {{…}} is filled in when a draft is created; [[…]] must be completed by the admin before the contract can be sent.
insert into contract_templates (name, is_default, body) values ('Player contract', true, $body$## {{club}} – {{team}}
This player contract is made between {{club}} (the club) and {{player}} (the player) for {{years_text}}, from {{starts}} to {{ends}}.
With this agreement, the club and the player agree on their mutual rights and obligations.
## Season and objectives
[[Describe the team's league and season, e.g. the series the team plays in and the objective for the season.]]
## Obligations of the club
- To provide high-quality and sufficient training facilities.
- To provide high-quality coaching.
- To provide the team and players with the necessary match and training equipment: balls, match kits and training equipment (excluding football boots and shin guards).
- To cover the costs related to playing and training, excluding players' playing licences and club membership fees.
- To treat all players appropriately and equally.
## Fees
The club pays the following fees on behalf of the player:
- [[Fee paid by the club, e.g. playing licence, EUR amount]]
If the player transfers to another club during the contract period, the player or the player's new club reimburses the club for the fees above, unless otherwise agreed between the player and the club. The player may also reimburse these fees during the contract period, in which case they will not be charged again later.
Fees for later seasons of this contract (playing licence, team fee) are agreed separately before each season and amount to at most EUR [[maximum per year]] per year.
## Rights of the club
- To select and field players in the manner it considers best to achieve its objectives.
- To move players between the club's teams at the discretion of the head coach.
- To terminate this agreement if the player fails to fulfil their obligations.
## Obligations of the player
- To participate in training sessions and matches whenever possible.
- To report absences in the agreed manner (in the club app).
- To pay the club membership fee according to their membership plan.
- To obtain insurance, if the player deems it necessary.
- To participate at least once per season in a volunteer event organised by the team, or otherwise pay EUR [[amount]] per year to the team.
- To follow the club's Code of Conduct and behave appropriately at club and team events, and elsewhere when wearing club apparel.
- Upon transferring to another club or retiring, to pay any unpaid fees under this agreement and to return all match and training equipment received from the club.
## Confidentiality
The parties undertake to keep the contents of this agreement confidential.
## Term and signature
This agreement enters into force on {{starts}} and expires on {{ends}}.
This agreement is signed electronically in the Afro Foot Club app: first by the player, then by a club representative.$body$)
on conflict (name) do nothing;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.18.0','feature','Digital player contracts, event sign-in and out, how to pay',
  'Admins draft 1-, 2- or 3-year player contracts from a template; players sign in the app and a club admin countersigns (PDF for both). Players sign in or out of trainings and matches from their calendar until the start; coaches see the replies. The Membership tab shows how to pay each open invoice.','2026-11-15')
on conflict (version) do nothing;


-- ===== 20260101000031_match_day.sql =====
-- 0031 Match day for coaches. Release 0.19.0.
-- 1. Coaches read the contracts of the players in their own teams (sent, signed or ended; never drafts, never the template).
-- 2. Pre-game protocol on each match: meeting time and place, warm-up, strategy briefing (all before kick-off).
-- 3. Game plan: a lineup style (defensive, balanced, midfield domination, high press, counter-attack, wing play) with
--    team instructions, and a short plan for the players. The lineup itself (match_squad, formations) and the live
--    events (match_events with automatic score and statistics) already exist (migration 0012).

-- ===== 1. Contracts for coaches =====
create policy contract_coach_read on player_contracts for select to authenticated
  using (status <> 'draft' and app.coaches_player(player_id));

-- ===== 2 + 3. Protocol and game plan on matches =====
alter table matches
  add column meet_at timestamptz,
  add column meeting_point text check (char_length(meeting_point) <= 120),
  add column warmup_at timestamptz,
  add column briefing_at timestamptz,
  add column tactic_style text check (tactic_style in ('defensive', 'balanced', 'midfield', 'high_press', 'counter', 'wing_play')),
  add column defensive_line text check (defensive_line in ('low', 'mid', 'high')),
  add column pressing text check (pressing in ('low', 'medium', 'high')),
  add column width text check (width in ('narrow', 'balanced', 'wide')),
  add column tempo text check (tempo in ('slow', 'balanced', 'fast')),
  add column game_plan text check (char_length(game_plan) <= 2000),
  -- every protocol step happens on match day before kick-off (at most 6 hours before)
  add constraint matches_protocol_times check (
    (meet_at is null or (meet_at <= kickoff_at and meet_at >= kickoff_at - interval '6 hours')) and
    (warmup_at is null or (warmup_at <= kickoff_at and warmup_at >= kickoff_at - interval '6 hours')) and
    (briefing_at is null or (briefing_at <= kickoff_at and briefing_at >= kickoff_at - interval '6 hours')));

-- Players already read their team's matches (matches_read). The protocol is for them; nothing private is stored here.
comment on column matches.game_plan is 'Shown to the squad once the lineup is published.';

-- ===== Save a whole lineup in one step (runs as the coach: RLS and the squad rules of migration 0012 still apply) =====
-- p_starters: [{"slot": 1..11, "player": uuid}], p_subs: [uuid], p_captain: one of them or null.
create function public.save_lineup(p_match uuid, p_formation text, p_starters jsonb, p_subs jsonb, p_captain uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare slots jsonb; n int;
begin
  if jsonb_typeof(p_starters) <> 'array' or jsonb_typeof(p_subs) <> 'array' then raise exception 'Bad lineup' using errcode = '22023'; end if;
  if jsonb_array_length(p_starters) > 11 or jsonb_array_length(p_subs) > 12 then raise exception 'Too many players' using errcode = '23514'; end if;
  select f.slots into slots from formations f where f.code = p_formation;
  if slots is null then raise exception 'Unknown formation' using errcode = '23503'; end if;
  update matches set formation = p_formation where id = p_match;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Not your match' using errcode = '42501'; end if;
  if (select count(distinct x) from (select e->>'player' x from jsonb_array_elements(p_starters) e union all select s #>> '{}' from jsonb_array_elements(p_subs) s) q)
     <> jsonb_array_length(p_starters) + jsonb_array_length(p_subs) then raise exception 'A player can only be picked once' using errcode = '23514'; end if;
  if (select count(distinct e->>'slot') from jsonb_array_elements(p_starters) e) <> jsonb_array_length(p_starters) then raise exception 'Two players in one position' using errcode = '23514'; end if;
  if p_captain is not null and not (p_captain::text in (select e->>'player' from jsonb_array_elements(p_starters) e union all select s #>> '{}' from jsonb_array_elements(p_subs) s)) then
    raise exception 'The captain must be in the squad' using errcode = '23514'; end if;
  update match_squad set status = 'not_selected', slot = null, captain = false where match_id = p_match;
  insert into match_squad (match_id, player_id, status, slot, position, shirt_number, captain)
  select p_match, (e->>'player')::uuid, 'starter', (e->>'slot')::int,
         (case (select r->>'role' from jsonb_array_elements(slots) r where (r->>'slot')::int = (e->>'slot')::int)
            when 'GK' then 'goalkeeper' when 'DF' then 'defender' when 'MF' then 'midfielder' else 'forward' end)::player_position,
         (select tp.jersey_number from team_players tp join matches m on m.team_season_id = tp.team_season_id where m.id = p_match and tp.player_id = (e->>'player')::uuid and tp.left_on is null),
         coalesce((e->>'player')::uuid = p_captain, false)
    from jsonb_array_elements(p_starters) e
  on conflict (match_id, player_id) do update set status = excluded.status, slot = excluded.slot, position = excluded.position, shirt_number = excluded.shirt_number, captain = excluded.captain;
  insert into match_squad (match_id, player_id, status, position, shirt_number, captain)
  select p_match, (s #>> '{}')::uuid, 'substitute', pl.position,
         (select tp.jersey_number from team_players tp join matches m on m.team_season_id = tp.team_season_id where m.id = p_match and tp.player_id = pl.id and tp.left_on is null),
         coalesce(pl.id = p_captain, false)
    from jsonb_array_elements(p_subs) s join players pl on pl.id = (s #>> '{}')::uuid
  on conflict (match_id, player_id) do update set status = excluded.status, slot = null, position = excluded.position, shirt_number = excluded.shirt_number, captain = excluded.captain;
end $$;
revoke all on function public.save_lineup(uuid, text, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_lineup(uuid, text, jsonb, jsonb, uuid) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.19.0','feature','Match day for coaches',
  'Coaches add matches and friendlies, plan the pre-game protocol (meeting, warm-up, briefing, kick-off), choose a lineup style with team instructions, pick the lineup on a pitch using the players'' replies, and run the live scoreboard. Coaches can read their players'' contracts and the Code of Conduct.','2026-11-15')
on conflict (version) do nothing;


-- ===== 20260101000032_lineup_board.sql =====
-- 0032 Lineup board. Release 0.20.0.
-- 1. Formats 5 v 5 to 11 v 11: formations get a size (format) and 18 new shapes for 9, 8, 7 and 5 players.
-- 2. Player photos: players upload their own photo (storage bucket player-photos, own folder, migration 0009);
--    coaches can view the photos of their own players. photo_path must point into the player's own folder.
-- 3. Rotation plan: planned substitutions per match, private to the team's coaches (fair playing time).
-- 4. save_lineup saves the whole board in one step: formation, players, bench, captain, rotation plan, lineup style,
--    team instructions and the plan for the players. Fixes the style not reaching the lineup (it was saved separately
--    and then overwritten by the board's formation).

-- ===== 1. Formats =====
alter table formations drop constraint formations_slots_check;
alter table formations add column format smallint not null default 11;
alter table formations add constraint formations_format check (format in (5, 7, 8, 9, 11) and jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) = format);
insert into formations (code, name, slots, sort_order, format) values
  ('3-3-2','3-3-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":25.0,"y":44.0},{"slot":6,"role":"MF","x":50.0,"y":44.0},{"slot":7,"role":"MF","x":75.0,"y":44.0},{"slot":8,"role":"FW","x":33.3,"y":16.0},{"slot":9,"role":"FW","x":66.7,"y":16.0}]',200,9),
  ('3-2-3','3-2-3','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":33.3,"y":44.0},{"slot":6,"role":"MF","x":66.7,"y":44.0},{"slot":7,"role":"FW","x":25.0,"y":16.0},{"slot":8,"role":"FW","x":50.0,"y":16.0},{"slot":9,"role":"FW","x":75.0,"y":16.0}]',201,9),
  ('2-4-2','2-4-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":20.0,"y":44.0},{"slot":5,"role":"MF","x":40.0,"y":44.0},{"slot":6,"role":"MF","x":60.0,"y":44.0},{"slot":7,"role":"MF","x":80.0,"y":44.0},{"slot":8,"role":"FW","x":33.3,"y":16.0},{"slot":9,"role":"FW","x":66.7,"y":16.0}]',202,9),
  ('3-4-1','3-4-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":20.0,"y":44.0},{"slot":6,"role":"MF","x":40.0,"y":44.0},{"slot":7,"role":"MF","x":60.0,"y":44.0},{"slot":8,"role":"MF","x":80.0,"y":44.0},{"slot":9,"role":"FW","x":50.0,"y":16.0}]',203,9),
  ('4-3-1','4-3-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":20.0,"y":72.0},{"slot":3,"role":"DF","x":40.0,"y":72.0},{"slot":4,"role":"DF","x":60.0,"y":72.0},{"slot":5,"role":"DF","x":80.0,"y":72.0},{"slot":6,"role":"MF","x":25.0,"y":44.0},{"slot":7,"role":"MF","x":50.0,"y":44.0},{"slot":8,"role":"MF","x":75.0,"y":44.0},{"slot":9,"role":"FW","x":50.0,"y":16.0}]',204,9),
  ('3-3-1','3-3-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":25.0,"y":44.0},{"slot":6,"role":"MF","x":50.0,"y":44.0},{"slot":7,"role":"MF","x":75.0,"y":44.0},{"slot":8,"role":"FW","x":50.0,"y":16.0}]',205,8),
  ('2-3-2','2-3-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":25.0,"y":44.0},{"slot":5,"role":"MF","x":50.0,"y":44.0},{"slot":6,"role":"MF","x":75.0,"y":44.0},{"slot":7,"role":"FW","x":33.3,"y":16.0},{"slot":8,"role":"FW","x":66.7,"y":16.0}]',206,8),
  ('3-2-2','3-2-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":33.3,"y":44.0},{"slot":6,"role":"MF","x":66.7,"y":44.0},{"slot":7,"role":"FW","x":33.3,"y":16.0},{"slot":8,"role":"FW","x":66.7,"y":16.0}]',207,8),
  ('4-2-1','4-2-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":20.0,"y":72.0},{"slot":3,"role":"DF","x":40.0,"y":72.0},{"slot":4,"role":"DF","x":60.0,"y":72.0},{"slot":5,"role":"DF","x":80.0,"y":72.0},{"slot":6,"role":"MF","x":33.3,"y":44.0},{"slot":7,"role":"MF","x":66.7,"y":44.0},{"slot":8,"role":"FW","x":50.0,"y":16.0}]',208,8),
  ('2-4-1','2-4-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":20.0,"y":44.0},{"slot":5,"role":"MF","x":40.0,"y":44.0},{"slot":6,"role":"MF","x":60.0,"y":44.0},{"slot":7,"role":"MF","x":80.0,"y":44.0},{"slot":8,"role":"FW","x":50.0,"y":16.0}]',209,8),
  ('2-3-1','2-3-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":25.0,"y":44.0},{"slot":5,"role":"MF","x":50.0,"y":44.0},{"slot":6,"role":"MF","x":75.0,"y":44.0},{"slot":7,"role":"FW","x":50.0,"y":16.0}]',210,7),
  ('3-2-1','3-2-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":33.3,"y":44.0},{"slot":6,"role":"MF","x":66.7,"y":44.0},{"slot":7,"role":"FW","x":50.0,"y":16.0}]',211,7),
  ('2-2-2','2-2-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":33.3,"y":44.0},{"slot":5,"role":"MF","x":66.7,"y":44.0},{"slot":6,"role":"FW","x":33.3,"y":16.0},{"slot":7,"role":"FW","x":66.7,"y":16.0}]',212,7),
  ('2-1-2-1','2-1-2-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":50.0,"y":53.3},{"slot":5,"role":"MF","x":33.3,"y":34.7},{"slot":6,"role":"MF","x":66.7,"y":34.7},{"slot":7,"role":"FW","x":50.0,"y":16.0}]',213,7),
  ('1-2-1','1-2-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":50.0,"y":72.0},{"slot":3,"role":"MF","x":33.3,"y":44.0},{"slot":4,"role":"MF","x":66.7,"y":44.0},{"slot":5,"role":"FW","x":50.0,"y":16.0}]',214,5),
  ('2-1-1','2-1-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":50.0,"y":44.0},{"slot":5,"role":"FW","x":50.0,"y":16.0}]',215,5),
  ('2-2','2-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"FW","x":33.3,"y":16.0},{"slot":5,"role":"FW","x":66.7,"y":16.0}]',216,5),
  ('1-1-2','1-1-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":50.0,"y":72.0},{"slot":3,"role":"MF","x":50.0,"y":44.0},{"slot":4,"role":"FW","x":33.3,"y":16.0},{"slot":5,"role":"FW","x":66.7,"y":16.0}]',217,5)
on conflict (code) do nothing;

-- ===== 2. Player photos =====
alter table players add constraint players_photo_path check (photo_path is null or (profile_id is not null and photo_path ~ ('^' || profile_id::text || '/[a-z0-9._-]{1,60}$')));
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute $p$create policy "player-photos coach read" on storage.objects for select to authenticated
      using (bucket_id = 'player-photos' and exists (select 1 from public.players p where p.profile_id::text = (storage.foldername(name))[1] and app.coaches_player(p.id)))$p$;
  end if;
end $$;

-- ===== 3. Rotation plan (coaches only; players never see planned changes) =====
create table match_rotation_plan (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  minute int not null check (minute between 1 and 120),
  player_off_id uuid not null references players(id) on delete cascade,
  player_on_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (player_off_id <> player_on_id),
  unique (match_id, player_on_id)                      -- a substitute comes on once
);
create index on match_rotation_plan (match_id);
alter table match_rotation_plan enable row level security;
create policy rotation_coach on match_rotation_plan for all to authenticated
  using (app.is_admin() or exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)))
  with check (app.is_admin() or exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)));
revoke all on match_rotation_plan from anon;
create trigger audit after insert or update or delete on match_rotation_plan for each row execute function app.audit();

-- ===== 4. Save the whole board =====
drop function public.save_lineup(uuid, text, jsonb, jsonb, uuid);
-- p_starters: [{"slot", "player"}], p_subs: [uuid], p_rotation: [{"minute", "off", "on"}], p_plan: {"style","line","press","width","tempo","text"}
create function public.save_lineup(p_match uuid, p_formation text, p_starters jsonb, p_subs jsonb, p_captain uuid,
  p_rotation jsonb default '[]'::jsonb, p_plan jsonb default null)
returns void language plpgsql security invoker set search_path = public as $$
declare slots jsonb; n int; r jsonb;
begin
  if jsonb_typeof(p_starters) <> 'array' or jsonb_typeof(p_subs) <> 'array' or jsonb_typeof(p_rotation) <> 'array' then raise exception 'Bad lineup' using errcode = '22023'; end if;
  select f.slots into slots from formations f where f.code = p_formation;
  if slots is null then raise exception 'Unknown formation' using errcode = '23503'; end if;
  if jsonb_array_length(p_starters) > jsonb_array_length(slots) or jsonb_array_length(p_subs) > 12 then raise exception 'Too many players' using errcode = '23514'; end if;
  if exists (select 1 from jsonb_array_elements(p_starters) e where (e->>'slot')::int < 1 or (e->>'slot')::int > jsonb_array_length(slots)) then
    raise exception 'Position not in this formation' using errcode = '23514'; end if;
  update matches set formation = p_formation where id = p_match;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Not your match' using errcode = '42501'; end if;
  if p_plan is not null then
    update matches set tactic_style = nullif(p_plan->>'style', ''), defensive_line = nullif(p_plan->>'line', ''), pressing = nullif(p_plan->>'press', ''),
                       width = nullif(p_plan->>'width', ''), tempo = nullif(p_plan->>'tempo', ''), game_plan = nullif(btrim(p_plan->>'text'), '')
     where id = p_match;
  end if;
  if (select count(distinct x) from (select e->>'player' x from jsonb_array_elements(p_starters) e union all select s #>> '{}' from jsonb_array_elements(p_subs) s) q)
     <> jsonb_array_length(p_starters) + jsonb_array_length(p_subs) then raise exception 'A player can only be picked once' using errcode = '23514'; end if;
  if (select count(distinct e->>'slot') from jsonb_array_elements(p_starters) e) <> jsonb_array_length(p_starters) then raise exception 'Two players in one position' using errcode = '23514'; end if;
  if p_captain is not null and not (p_captain::text in (select e->>'player' from jsonb_array_elements(p_starters) e union all select s #>> '{}' from jsonb_array_elements(p_subs) s)) then
    raise exception 'The captain must be in the squad' using errcode = '23514'; end if;
  update match_squad set status = 'not_selected', slot = null, captain = false where match_id = p_match;
  insert into match_squad (match_id, player_id, status, slot, position, shirt_number, captain)
  select p_match, (e->>'player')::uuid, 'starter', (e->>'slot')::int,
         (case (select x->>'role' from jsonb_array_elements(slots) x where (x->>'slot')::int = (e->>'slot')::int)
            when 'GK' then 'goalkeeper' when 'DF' then 'defender' when 'MF' then 'midfielder' else 'forward' end)::player_position,
         (select tp.jersey_number from team_players tp join matches m on m.team_season_id = tp.team_season_id where m.id = p_match and tp.player_id = (e->>'player')::uuid and tp.left_on is null),
         coalesce((e->>'player')::uuid = p_captain, false)
    from jsonb_array_elements(p_starters) e
  on conflict (match_id, player_id) do update set status = excluded.status, slot = excluded.slot, position = excluded.position, shirt_number = excluded.shirt_number, captain = excluded.captain;
  insert into match_squad (match_id, player_id, status, position, shirt_number, captain)
  select p_match, (s #>> '{}')::uuid, 'substitute', pl.position,
         (select tp.jersey_number from team_players tp join matches m on m.team_season_id = tp.team_season_id where m.id = p_match and tp.player_id = pl.id and tp.left_on is null),
         coalesce(pl.id = p_captain, false)
    from jsonb_array_elements(p_subs) s join players pl on pl.id = (s #>> '{}')::uuid
  on conflict (match_id, player_id) do update set status = excluded.status, slot = null, position = excluded.position, shirt_number = excluded.shirt_number, captain = excluded.captain;
  -- rotation plan: on = a substitute, off = a starter or someone who came on earlier in the plan
  delete from match_rotation_plan where match_id = p_match;
  for r in select x from jsonb_array_elements(p_rotation) x order by (x->>'minute')::int loop
    if not ((r->>'on') in (select s #>> '{}' from jsonb_array_elements(p_subs) s)) then raise exception 'Only a substitute can come on' using errcode = '23514'; end if;
    if not ((r->>'off') in (select e->>'player' from jsonb_array_elements(p_starters) e)
            or exists (select 1 from match_rotation_plan p where p.match_id = p_match and p.player_on_id = (r->>'off')::uuid and p.minute < (r->>'minute')::int)) then
      raise exception 'The player going off is not on the pitch then' using errcode = '23514'; end if;
    if exists (select 1 from match_rotation_plan p where p.match_id = p_match and p.player_off_id = (r->>'off')::uuid) then
      raise exception 'A player goes off once' using errcode = '23514'; end if;
    insert into match_rotation_plan (match_id, minute, player_off_id, player_on_id) values (p_match, (r->>'minute')::int, (r->>'off')::uuid, (r->>'on')::uuid);
  end loop;
end $$;
revoke all on function public.save_lineup(uuid, text, jsonb, jsonb, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_lineup(uuid, text, jsonb, jsonb, uuid, jsonb, jsonb) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.20.0','feature','Lineup board',
  'Lineup style drop-down with description beside the pitch; formats 5 v 5 to 11 v 11; drag and drop; player cards with photo, positions, contact, attendance and season minutes; rotation plan with planned minutes; availability summary; PNG, JPG, share and video export. Fixes the lineup style not applying to the formation.','2026-11-15')
on conflict (version) do nothing;


-- ===== 20260101000033_social_sign_in.sql =====
-- 0033 Sign in with Google or Facebook. Release 0.21.0.
-- New accounts still start as pending players (an admin approves them and sets the role); the fee block (0022) applies
-- to every sign-in method. Google and Facebook send the name as full_name / name (Google also given_name, family_name)
-- instead of first_name / last_name, so the profile takes the name from whichever is there.

create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := btrim(regexp_replace(coalesce(nullif(m->>'full_name', ''), nullif(m->>'name', ''), ''), '\s+', ' ', 'g'));
  first text := coalesce(nullif(btrim(m->>'first_name'), ''), nullif(btrim(m->>'given_name'), ''),
                         nullif(split_part(full_name, ' ', 1), ''), '');
  last text := coalesce(nullif(btrim(m->>'last_name'), ''), nullif(btrim(m->>'family_name'), ''),
                        nullif(btrim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), ''), '');
begin
  insert into profiles (id, email, first_name, last_name) values (new.id, new.email, left(first, 80), left(last, 80));
  return new;
end $$;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.21.0','feature','Sign in with Google or Facebook',
  'Members can sign in with their Google or Facebook account as well as with email and password. New accounts still wait for approval; an existing account with the same email is used.','2026-11-15')
on conflict (version) do nothing;


-- ===== 20260101000034_events_public_schedule.sql =====
-- 0034 Events for the whole calendar, meeting times for training, and one public schedule for the website.
--  * Training sessions get a meeting time and meeting point (like the match protocol) and a "show on the website" switch.
--  * New table club_events: team meetings, social events, tournaments, camps… for one team or the whole club.
--  * team_schedule (the members' calendar) now also lists club events, with meeting time and point.
--  * public_schedule: what the website shows — games and friendlies, training and events of public teams that are
--    marked public. No meeting points, notes about players or attendance: only what a visitor needs to come along.

-- ===== training: meeting time and point, website switch =====
alter table training_sessions
  add column meet_at timestamptz,
  add column meeting_point text check (char_length(meeting_point) <= 120),
  add column public boolean not null default true,
  add constraint training_meet_before_start check (meet_at is null or (meet_at <= starts_at and meet_at >= starts_at - interval '6 hours'));

-- ===== club events =====
create table club_events (
  id uuid primary key default gen_random_uuid(),
  team_season_id uuid references team_seasons(id) on delete cascade,      -- null: the whole club
  kind text not null default 'other' check (kind in ('meeting','social','tournament','camp','other')),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  meet_at timestamptz,
  meeting_point text check (char_length(meeting_point) <= 120),
  location_id uuid references locations(id) on delete set null,
  public boolean not null default true,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '14 days'),
  check (meet_at is null or (meet_at <= starts_at and meet_at >= starts_at - interval '6 hours'))
);
create index on club_events (starts_at);
create index on club_events (team_season_id, starts_at);
alter table club_events enable row level security;
create trigger touch before update on club_events for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on club_events for each row execute function app.audit();

-- Admins: everything. Coaches: events of the teams they coach (club-wide events are for admins).
-- Reading: club-wide events for every active member; team events for the team's players and coaches.
create policy club_events_admin on club_events for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy club_events_coach on club_events for all to authenticated
  using (team_season_id is not null and app.coaches_ts(team_season_id))
  with check (team_season_id is not null and app.coaches_ts(team_season_id));
create policy club_events_read on club_events for select to authenticated
  using ((team_season_id is null and app.is_active()) or (team_season_id is not null and (app.in_team_ts(team_season_id) or app.coaches_ts(team_season_id))));

-- ===== members' calendar =====
-- Recreated (the column type of event_type changes to text so it can say 'event'); RLS of the underlying tables applies.
drop view team_schedule;
create view team_schedule with (security_invoker = true) as
select s.id, 'practice'::text as event_type, s.team_season_id, s.title, null::text as division, s.starts_at, s.ends_at, s.location_id, s.status::text as status,
       s.meet_at, s.meeting_point, null::text as kind, null::text as description
from training_sessions s
union all
select m.id, m.event_type::text, m.team_season_id, m.opponent, m.division, m.kickoff_at, m.kickoff_at + interval '2 hours', m.location_id, m.status::text,
       m.meet_at, m.meeting_point, null, null
from matches m
union all
select e.id, 'event', e.team_season_id, e.title, null, e.starts_at, e.ends_at, e.location_id, e.status,
       e.meet_at, e.meeting_point, e.kind, e.description
from club_events e;
grant select on team_schedule to authenticated;

-- ===== website =====
-- Runs with the owner's rights (like the other public_* views) and lists only public teams' public items.
create view public_schedule as
select m.id, m.event_type::text as event_type, null::text as kind, t.name as team_name, m.opponent as title, m.home_away, m.division,
       m.kickoff_at as starts_at, m.kickoff_at + interval '2 hours' as ends_at, m.status::text as status, m.goals_for, m.goals_against,
       l.name as venue, l.address as venue_address, l.city, l.maps_url, null::text as description
from matches m join team_seasons ts on ts.id = m.team_season_id and ts.is_public join teams t on t.id = ts.team_id
left join locations l on l.id = m.location_id
where m.status in ('scheduled','played','cancelled','postponed')
union all
select s.id, 'practice', null, t.name, s.title, null, null, s.starts_at, s.ends_at, s.status::text, null, null,
       l.name, l.address, l.city, l.maps_url, null
from training_sessions s join team_seasons ts on ts.id = s.team_season_id and ts.is_public join teams t on t.id = ts.team_id
left join locations l on l.id = s.location_id
where s.public
union all
select e.id, 'event', e.kind, t.name, e.title, null, null, e.starts_at, e.ends_at, e.status, null, null,
       l.name, l.address, l.city, l.maps_url, e.description
from club_events e left join team_seasons ts on ts.id = e.team_season_id left join teams t on t.id = ts.team_id
left join locations l on l.id = e.location_id
where e.public and (e.team_season_id is null or ts.is_public);
grant select on public_schedule to anon, authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.22.0','feature','Events, meeting times and the calendar on the website',
  'Coaches and admins add training, games and other events (meetings, social events, tournaments, camps) with a meeting time and a place with a Google Maps link. Everything marked public appears on the website calendar automatically.','2026-11-16')
on conflict (version) do nothing;


-- ===== 20260101000035_phone_sign_up.sql =====
-- 0035 Sign-up in the member app, also with a phone number (SMS code). Release 0.23.0.
-- An account made with a phone number has no email address: profiles.email becomes optional, but every profile still
-- has an email or a phone. The profile takes the phone from Supabase Auth (stored there without "+"), with the country code.
-- New accounts are still pending players until an admin approves them; the fee block (0022) applies to every sign-in method.

alter table profiles alter column email drop not null;
alter table profiles add constraint profiles_email_or_phone check (email is not null or phone is not null);

create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := btrim(regexp_replace(coalesce(nullif(m->>'full_name', ''), nullif(m->>'name', ''), ''), '\s+', ' ', 'g'));
  first text := coalesce(nullif(btrim(m->>'first_name'), ''), nullif(btrim(m->>'given_name'), ''),
                         nullif(split_part(full_name, ' ', 1), ''), '');
  last text := coalesce(nullif(btrim(m->>'last_name'), ''), nullif(btrim(m->>'family_name'), ''),
                        nullif(btrim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), ''), '');
  digits text := nullif(regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g'), '');
begin
  insert into profiles (id, email, phone, first_name, last_name)
  values (new.id, nullif(new.email, ''), case when digits ~ '^[1-9][0-9]{6,14}$' then '+' || digits end, left(first, 80), left(last, 80));
  return new;
end $$;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.23.0','feature','Create an account in the app, also with a phone number',
  'New members can create an account on the sign-in page with their email address or their phone number (a code by text message). A short football check keeps robots out. New accounts wait for approval as before.','2026-11-16')
on conflict (version) do nothing;


-- ===== 20260101000036_invoice_after_consents.sql =====
-- 0036 A player's membership is invoiced only once the player has signed their contract and agreed to the Code of Conduct.
-- Release 0.24.0. A held membership keeps its next invoice date, so the first run after the player completes both steps
-- invoices it: nothing is skipped or lost. The club can switch the rule off in the billing details ("require_consents").
--  * Code of Conduct: consent to the current version by the player's own account (none needed while no version is published).
--  * Contract: a contract the player has signed (player_signed or active; a terminated one until its termination date) that
--    has not ended by that date.

create function app.invoice_hold(p_player uuid, p_on date) returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when exists (select 1 from conduct_versions v where v.is_current)
          and not exists (select 1 from players pl join conduct_consents c on c.profile_id = pl.profile_id
                          join conduct_versions v on v.id = c.version_id and v.is_current where pl.id = p_player)
         then 'conduct' end,
    case when not exists (select 1 from player_contracts k where k.player_id = p_player and k.status in ('player_signed', 'active', 'terminated')
                          and k.ends_on >= p_on and (k.status <> 'terminated' or k.terminated_on > p_on))
         then 'contract' end
  ], null)
$$;
revoke all on function app.invoice_hold(uuid, date) from public, anon, authenticated;

create or replace function app.generate_due_invoices(p_today date default (now() at time zone 'Europe/Helsinki')::date) returns int
language plpgsql security definer set search_path = public as $$
declare
  b jsonb; terms int; lead int; req boolean; m record; months int; per int; i int; v_pay uuid; n int := 0;
begin
  select value into b from site_settings where key = 'billing';
  if b is null or coalesce(b->>'iban', '') = '' then
    raise notice 'Billing details (IBAN) are missing: no invoices issued.';
    return 0;
  end if;
  terms := greatest(0, least(120, coalesce((b->>'payment_terms_days')::int, 14)));
  lead := greatest(0, least(60, coalesce((b->>'lead_days')::int, 14)));
  req := coalesce((b->>'require_consents')::boolean, true);
  for m in
    select ms.id, ms.player_id, ms.next_due_on, ms.ends_on, mp.amount_cents, mp.currency, mp.period
    from memberships ms join membership_plans mp on mp.id = ms.plan_id
    where ms.status = 'active' and ms.auto_renew and ms.next_due_on is not null and ms.next_due_on - lead <= p_today
      and mp.amount_cents > 0 and mp.period in ('month', 'quarter', 'year', 'season')
      and (ms.ends_on is null or ms.next_due_on <= ms.ends_on)
      and (not req or cardinality(app.invoice_hold(ms.player_id, ms.next_due_on)) = 0)   -- 0036: contract signed, Code of Conduct agreed
    order by ms.next_due_on
    for update of ms skip locked
  loop
    months := case m.period when 'month' then 1 when 'quarter' then 3 when 'year' then 12 end;  -- null for a season
    insert into payments (player_id, membership_id, amount_cents, currency, method, status, due_on, invoice_sent_at, notes)
    values (m.player_id, m.id, m.amount_cents, m.currency, 'invoice', 'pending', greatest(p_today + terms, m.next_due_on), now(), 'automatic invoice')
    returning id into v_pay;
    if months is null then
      insert into payment_lines (payment_id, position, description, line_date, unit_price_cents) values (v_pay, 1, 'Membership fees', m.next_due_on, m.amount_cents);
    else
      per := m.amount_cents / months;   -- whole cents; the last line takes the remainder so the lines add up exactly
      for i in 0 .. months - 1 loop
        insert into payment_lines (payment_id, position, description, line_date, unit_price_cents)
        values (v_pay, i + 1, 'Membership fees', (m.next_due_on + make_interval(months => i))::date,
                case when i = months - 1 then m.amount_cents - per * (months - 1) else per end);
      end loop;
    end if;
    update memberships set next_due_on = case when months is null then null else (m.next_due_on + make_interval(months => months))::date end
    where id = m.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function app.generate_due_invoices(date) from public, anon, authenticated;

-- Admins: the memberships that are due (or will be within the lead time) but wait for a signature or the Code of Conduct.
create function public.invoice_holds() returns table (membership_id uuid, player_id uuid, player_name text, next_due_on date, missing text[])
language plpgsql stable security definer set search_path = public as $$
declare b jsonb; lead int;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select value into b from site_settings where key = 'billing';
  if not coalesce((b->>'require_consents')::boolean, true) then return; end if;
  lead := greatest(0, least(60, coalesce((b->>'lead_days')::int, 14)));
  return query
    select ms.id, ms.player_id, pl.first_name || ' ' || pl.last_name, ms.next_due_on, app.invoice_hold(ms.player_id, ms.next_due_on)
    from memberships ms join membership_plans mp on mp.id = ms.plan_id join players pl on pl.id = ms.player_id
    where ms.status = 'active' and ms.auto_renew and ms.next_due_on is not null and ms.next_due_on - lead <= (now() at time zone 'Europe/Helsinki')::date
      and mp.amount_cents > 0 and mp.period in ('month', 'quarter', 'year', 'season') and (ms.ends_on is null or ms.next_due_on <= ms.ends_on)
      and cardinality(app.invoice_hold(ms.player_id, ms.next_due_on)) > 0
    order by ms.next_due_on, pl.last_name;
end $$;
revoke all on function public.invoice_holds() from public, anon;
grant execute on function public.invoice_holds() to authenticated;

-- Existing clubs: the rule is on unless switched off in Admin → Invoices → Billing details.
update site_settings set value = value || '{"require_consents": true}'::jsonb where key = 'billing' and not value ? 'require_consents';

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.24.0','feature','Invoices after the contract and Code of Conduct',
  'A player''s membership invoice is issued only once the player has signed their contract and agreed to the Code of Conduct. Admins see who is waiting. The club can switch this off in the billing details.','2026-11-16')
on conflict (version) do nothing;


-- ===== 20260101000037_automatic_contracts.sql =====
-- 0037 Automatic player contracts. Release 0.25.0.
--  * Each team gets a "Season and objectives" text per season (team_seasons.objectives), written once by an admin.
--  * Club-wide contract settings (site_settings 'contracts', admins only): what happens when a player joins a team
--    (create and send the contract / create a draft / nothing), the contract length, and the fee lines of the contract.
--  * The template's [[…]] blanks for those become {{…}} fields filled in automatically, so a contract can be sent
--    without manual editing. A field with no value yet is left as a [[…]] blank, and the contract then waits as a draft.

alter table team_seasons
  add column objectives text check (char_length(objectives) <= 2000);
comment on column team_seasons.objectives is 'Season and objectives of the team (league, series, goals); printed in the player contracts.';

insert into site_settings (key, value, is_public) values ('contracts', jsonb_build_object(
  'auto', 'send',          -- send | draft | off: when a player is added to a team without a contract for the season
  'years', 1,              -- contract length for automatic contracts (1–3)
  'club_fees', '',         -- "The club pays on behalf of the player: …"
  'max_fee_per_year', '',  -- EUR, later seasons
  'volunteer_amount', ''   -- EUR per year instead of a volunteer event
), false) on conflict (key) do nothing;

-- Template: the four blanks become fields (only the exact original blank texts are replaced, so an edited template keeps its own text).
update contract_templates set body =
  replace(replace(replace(replace(body,
    '[[Describe the team''s league and season, e.g. the series the team plays in and the objective for the season.]]', '{{season_objectives}}'),
    '[[Fee paid by the club, e.g. playing licence, EUR amount]]', '{{club_fees}}'),
    '[[maximum per year]]', '{{max_fee_per_year}}'),
    '[[amount]]', '{{volunteer_amount}}');

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.25.0','feature','Automatic player contracts',
  'When a player is approved into a team or added to one, the contract is created from the template with the team, season, objectives and fees filled in, and sent to the player to sign. Admins set the team''s season objectives on the team page and the fee lines once under Contracts.','2026-11-16')
on conflict (version) do nothing;


-- ===== 20260101000038_amateur_contract.sql =====
-- 0038 Amateur player agreement. Release 0.26.0.
-- Afro Foot Club is an amateur club: players are not paid; they contribute to the team's costs with the membership fee and
-- buy their own player licence. In line with the club's mission, the board may exceptionally reduce or waive a player's fee
-- for financial reasons, on a proposal from the coach or team manager.
--  * New default template "Player agreement (amateur)". The previous template is kept (not default) for reference.
--  * Contract settings: the membership fee line and the "included / not included" lists (one item per line) replace the
--    old fee fields of 0037. The licence and insurance prices are linked from the website's Membership page.

update contract_templates set is_default = false where is_default;
insert into contract_templates (name, is_default, body) values ('Player agreement (amateur)', true, $body$## {{club}} – {{team}}
This player agreement is made between {{club}} (the club) and {{player}} (the player) for {{years_text}}, from {{starts}} to {{ends}}.
{{club}} is an amateur football club. Players are not paid. Each player contributes to the team's costs with the membership fee, so that the team can train, play and develop together.
## Season and objectives
{{season_objectives}}
## Membership fee
The player pays the club's membership fee for the season: {{team_fee}}.
The membership fee includes:
{{included_list}}
The membership fee does not include:
{{not_included_list}}
The player buys their own player licence from the Football Association of Finland (Palloliitto) before their first official match, and arranges insurance if they wish. Current licence and insurance prices: {{prices_link}}
Fees for later seasons of this agreement are announced before each season.
## Fee exemption
In line with Afro Foot Club's mission, no player should have to stop playing for financial reasons. In exceptional cases, the club's board may reduce or waive a player's membership fee for a season, based on the player's financial situation. The board decides on a proposal from the player's coach or team manager. A player may ask their coach or team manager to make such a proposal. Exemptions are rare, decided case by case, and kept confidential.
## Obligations of the club
- To organise training sessions and matches with qualified coaching.
- To book the training grounds and register the team in its league.
- To give the player access to the Afro Foot Club app and a personal development plan.
- To provide match kits and training equipment (balls, cones, bibs); football boots and shin guards are the player's own.
- To treat all players appropriately and equally.
## Rights of the club
- To select and field players in the manner it considers best to achieve its objectives.
- To move players between the club's teams at the discretion of the head coach.
- To terminate this agreement if the player fails to fulfil their obligations.
## Obligations of the player
- To participate in training sessions and matches whenever possible.
- To report absences in the agreed manner (in the club app).
- To pay the membership fee on time, or agree a payment plan with the club.
- To hold a valid player licence before playing official matches.
- To arrange insurance, if the player deems it necessary.
- To participate at least once per season in a volunteer event organised by the team.
- To follow the club's Code of Conduct and behave appropriately at club and team events, and elsewhere when wearing club apparel.
- Upon transferring to another club or retiring, to pay any unpaid membership fees and to return all match and training equipment received from the club.
## Confidentiality
The parties undertake to keep the contents of this agreement confidential.
## Term and signature
This agreement enters into force on {{starts}} and expires on {{ends}}.
This agreement is signed electronically in the Afro Foot Club app: first by the player, then by a club representative.$body$)
on conflict (name) do update set is_default = true;

-- Settings: membership fee line and the included / not included lists (newline-separated); kept values are not overwritten.
update site_settings set value = jsonb_build_object(
  'team_fee', '',
  'included', E'League fee per player\nTraining and games\nTraining ground booking\nThe Afro Foot Club app\nPersonal development plan',
  'not_included', E'Player insurance\nPlayer licence'
) || value where key = 'contracts';

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.26.0','feature','Amateur player agreement',
  'The player contract now reflects the amateur club: players are not paid, they contribute with the membership fee and buy their own licence; what the fee includes and excludes is listed; the board may exceptionally waive a fee on a coach''s proposal.','2026-11-16')
on conflict (version) do nothing;


-- ===== 20260101000040_federation_sync.sql =====
-- 0040 League standings and results from the Palloliitto results service (Torneopal). Release 0.28.0.
-- The sync job (apps/web /api/federation-sync, run by Vercel Cron with the service role) fills the federation_* tables of
-- migration 0011; the website reads the two public views. The mappers are tested against real answers
-- (packages/federation/src/map.test.ts). Raw answers are not stored (payload stays empty): they name referees and players.
--  * competitions: one row per group (e.g. etejp26/M4/4), with its season, its kind (league, cup, friendly) and group name.
--    New competitions are public by default; an admin can still hide one (show_publicly = false), and the sync never
--    changes that choice afterwards.
--  * teams: is_club marks Afro Foot Club's own teams (from the settings), so the website can highlight them.
--  * views: the website's standings and results, with season, kind and the club flag; still column-limited.
--  * settings: the club's Palloliitto team (35118195, tulospalvelu.palloliitto.fi/team/35118195) and the sync switched on.

alter table federation_competitions
  add column season int check (season between 2000 and 2100),
  add column kind text not null default 'league' check (kind in ('league', 'cup', 'friendly')),
  add column group_name text check (char_length(group_name) <= 80),
  alter column show_publicly set default true;
alter table federation_teams add column is_club boolean not null default false;
alter table federation_matches
  add constraint federation_matches_status check (status is null or status in ('played', 'fixture', 'cancelled', 'forfeited')) not valid;
create index on federation_matches (home_external_id, kickoff_at);
create index on federation_matches (away_external_id, kickoff_at);

drop view public_standings;
drop view public_league_fixtures;

-- League tables of public competitions. is_club: this row is one of Afro Foot Club's teams.
create view public_standings as
select s.competition_external_id, c.name as competition, c.category, c.group_name, c.season, s.position, s.team_name,
       coalesce(ft.is_club, false) as is_club, s.played, s.won, s.drawn, s.lost, s.goals_for, s.goals_against, s.points, s.synced_at
from federation_standings s
join federation_competitions c on c.external_id = s.competition_external_id and c.show_publicly and c.kind = 'league'
left join federation_teams ft on ft.external_id = s.team_external_id;

-- Games of public competitions (league, cup, friendlies), with which side is the club.
create view public_league_fixtures as
select m.external_id, m.competition_external_id, c.name as competition, c.category, c.kind, c.season, m.kickoff_at,
       m.home_name, m.away_name, m.home_goals, m.away_goals, m.venue, m.status,
       coalesce(h.is_club, false) as home_is_club, coalesce(a.is_club, false) as away_is_club, m.synced_at
from federation_matches m
join federation_competitions c on c.external_id = m.competition_external_id and c.show_publicly
left join federation_teams h on h.external_id = m.home_external_id
left join federation_teams a on a.external_id = m.away_external_id;

grant select on public_standings, public_league_fixtures to anon, authenticated;

-- The club's team on the results service; kept if an admin already configured teams.
update site_settings set value = value || jsonb_build_object('enabled', true, 'team_ids', jsonb_build_array('35118195'))
where key = 'federation' and coalesce(jsonb_array_length(value -> 'team_ids'), 0) = 0;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.28.0','feature','League table and results from Palloliitto',
  'The website shows the league table and the club''s results straight from the Palloliitto results service, updated automatically; last season''s final table stays until the new season starts.','2026-11-17')
on conflict (version) do nothing;


-- ===== 20260101000041_squad_consent_stats.sql =====
-- 0041 Squad on the website: the player's own consent, with goals and games from Palloliitto. Release 0.29.0.
--  * Players switch "Show me on the club website" on or off in the member app (players.show_publicly, which the
--    restrict_columns trigger of 0007 already lets them change). Only they appear in public_players.
--  * The Palloliitto sync stores the club's registered players (id, name, shirt number, position: no birth year,
--    nationality or licence) and their league statistics, admin- and coach-readable only (0011 policies).
--  * An admin links each Palloliitto player to the app player (federation_players.player_id); never automatic.
--    One Palloliitto player per app player.
--  * public_players gains goals and games of the latest public league season, for linked players only.
alter table federation_players add column position text check (char_length(position) <= 40);
create unique index federation_players_one_link on federation_players (player_id) where player_id is not null;
create index on federation_player_stats (player_external_id);

-- Same columns as before (0009), then the statistics: only players who chose to be shown, as before.
create or replace view public_players as
select p.id, (p.first_name || ' ' || p.last_name) as display_name, p.position, p.nationality, p.photo_path, tp.jersey_number, t.name as team_name,
       st.goals, st.appearances, st.season as stats_season
from players p
join team_players tp on tp.player_id = p.id and tp.left_on is null
join team_seasons ts on ts.id = tp.team_season_id and ts.is_public
join seasons s on s.id = ts.season_id and s.is_current
join teams t on t.id = ts.team_id
left join lateral (
  select fs.goals, fs.appearances, c.season
  from federation_players fp
  join federation_player_stats fs on fs.player_external_id = fp.external_id
  join federation_competitions c on c.external_id = fs.competition_external_id and c.kind = 'league' and c.show_publicly
  where fp.player_id = p.id
  order by c.season desc nulls last, fs.appearances desc
  limit 1
) st on true
where p.show_publicly and p.status = 'active';
grant select on public_players to anon, authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.29.0','feature','Squad on the website',
  'Players choose in My profile whether they appear on the club website. Those who do are listed with their shirt number, position and, once an admin links them to Palloliitto, their league goals and games.','2026-11-17')
on conflict (version) do nothing;


-- ===== 20260101000042_squad_from_palloliitto.sql =====
-- 0042 Squad on the website from Palloliitto's public player list. Release 0.30.0.
-- The club decided to show its players as registered with Palloliitto (public there), without asking each player first.
-- Legal basis: the club's legitimate interest in presenting its team (stated in the privacy policy). Safeguards:
--  * Only name, shirt number, position, and league goals and games: never birth year, nationality or licence.
--  * Only the current roster (players removed or inactive at Palloliitto drop off at the next sync).
--  * Opt-out: a player removes themselves in the member app (players.website_hidden, linked players), and an admin can
--    hide anyone (federation_players.hidden), e.g. on request by email. The sync never overwrites either choice.
alter table federation_players
  add column on_roster boolean not null default true,
  add column hidden boolean not null default false;
-- positions as the website filters them (the first sync of 0041 stored the service's own words)
update federation_players set position = case
  when lower(position) ~ 'goal|maalivahti|^mv$' then 'goalkeeper' when lower(position) ~ 'defen|puolustaja' then 'defender'
  when lower(position) ~ 'midfield|keskikent' then 'midfielder' when lower(position) ~ 'forward|hy.kk' then 'forward' else null end
where position is not null;
alter table federation_players add constraint federation_players_position check (position is null or position in ('goalkeeper', 'defender', 'midfielder', 'forward'));

alter table players add column website_hidden boolean not null default false;
comment on column players.website_hidden is 'The player removed themselves from the squad on the club website (opt-out, migration 0042).';
-- players may change this themselves (same list as 0007, plus website_hidden)
drop trigger restrict_cols on players;
create trigger restrict_cols before update on players for each row
  execute function app.restrict_columns('preferred_foot','height_cm','weight_kg','bio','photo_path','show_publicly','website_hidden','updated_at');

-- The website's squad: the club's current Palloliitto roster, minus anyone hidden; latest public league season's statistics.
create view public_squad as
select fp.external_id as id, fp.display_name, fp.shirt_number, fp.position, st.goals, st.appearances, st.season as stats_season
from federation_players fp
join federation_teams ft on ft.external_id = fp.team_external_id and ft.is_club
left join players p on p.id = fp.player_id
left join lateral (
  select fs.goals, fs.appearances, c.season
  from federation_player_stats fs
  join federation_competitions c on c.external_id = fs.competition_external_id and c.kind = 'league' and c.show_publicly
  where fs.player_external_id = fp.external_id
  order by c.season desc nulls last, fs.appearances desc
  limit 1
) st on true
where fp.on_roster and not fp.hidden and not coalesce(p.website_hidden, false);
grant select on public_squad to anon, authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.30.0','feature','Squad from Palloliitto',
  'The website''s squad shows the club''s players as registered with Palloliitto: name, shirt number, position, league goals and games. Players can remove themselves in My profile; admins can hide a player.','2026-11-17')
on conflict (version) do nothing;


-- ===== 20260101000043_top_scorers.sql =====
-- 0043 All-time top scorers on the team page. Release 0.31.0.
-- The sync now also reads the club's goals from every official group it has played on the Palloliitto results service
-- (earlier seasons and cups; never friendlies). Former players are stored off the roster with their name only.
-- The website shows the top three of the club's league and cup goals, with the same safeguards as the squad (0042):
-- a player hidden by the club or who removed themselves in the app is never listed.
-- Fix: games played come from "matches" in the service's answer ("matches_played" is empty); the next sync corrects them.

create view public_top_scorers as
with totals as (
  select fp.display_name, fp.on_roster,
         sum(fs.goals)::int as goals, sum(fs.appearances)::int as appearances,
         min(c.season) as first_season, max(c.season) as last_season
  from federation_players fp
  join federation_teams ft on ft.external_id = fp.team_external_id and ft.is_club
  left join players p on p.id = fp.player_id
  join federation_player_stats fs on fs.player_external_id = fp.external_id
  join federation_competitions c on c.external_id = fs.competition_external_id and c.kind in ('league', 'cup') and c.show_publicly
  where not fp.hidden and not coalesce(p.website_hidden, false)
  group by fp.external_id, fp.display_name, fp.on_roster
)
select (row_number() over (order by goals desc, appearances, display_name))::int as rank,
       display_name, goals, appearances, on_roster as current_player, first_season, last_season,
       (select min(c.season) from federation_competitions c
         join federation_player_stats fs on fs.competition_external_id = c.external_id
         where c.kind in ('league', 'cup') and c.show_publicly) as since_season
from totals
where goals > 0
order by rank
limit 3;
grant select on public_top_scorers to anon, authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.31.0','feature','All-time top scorers',
  'The team page shows the club''s three all-time top scorers in league and cup games, from the Palloliitto results service. Games played per player are now counted correctly.','2026-11-17')
on conflict (version) do nothing;


-- ===== 20260101000044_signin_help.sql =====
-- 0044 Sign-in help for admins. Release 0.32.0.
-- Admin → Sign-in help shows why a member cannot sign in and what fixes it. The app never sees or sets passwords and
-- admins cannot sign in as a member: the member always sets their own password from an email link.
--  * signin_status(profile): account facts from Supabase Auth that admins cannot read directly (email confirmed, last
--    sign-in, sign-in methods, ban), the profile's status, and the fee block of migration 0022. Admins only.
--  * log_signin_help(profile, action): every link an admin sends is written to the audit log.

create function public.signin_status(p_profile uuid) returns table (
  email text, has_account boolean, email_confirmed boolean, last_sign_in_at timestamptz, providers text[], banned_until timestamptz,
  role text, status text, player_id uuid, fee_blocked boolean, owed_cents bigint, oldest_due date, exempt_until date
) language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query
  select coalesce(u.email, pr.email)::text, u.id is not null, u.email_confirmed_at is not null, u.last_sign_in_at,
         coalesce((select array_agg(distinct i.provider order by i.provider) from auth.identities i where i.user_id = pr.id), '{}')::text[],
         case when u.banned_until > now() then u.banned_until end,
         pr.role::text, pr.status::text, pl.id,
         coalesce(app.player_blocked(pr.id), false),
         (select sum(p.amount_cents) from payments p where p.player_id = pl.id and p.status in ('pending', 'failed'))::bigint,
         (select min(p.due_on) from payments p where p.player_id = pl.id and p.status in ('pending', 'failed')),
         pl.fee_exempt_until
  from profiles pr
  left join auth.users u on u.id = pr.id
  left join players pl on pl.profile_id = pr.id
  where pr.id = p_profile;
end $$;
revoke all on function public.signin_status(uuid) from public, anon;
grant execute on function public.signin_status(uuid) to authenticated;

create function public.log_signin_help(p_profile uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_action not in ('password_link', 'confirmation_link', 'fee_exemption') then raise exception 'unknown action' using errcode = '22023'; end if;
  if not exists (select 1 from profiles where id = p_profile) then raise exception 'unknown member' using errcode = '22023'; end if;
  insert into audit_log (actor_id, action, table_name, record_id, new_data)
  values (auth.uid(), 'SIGNIN_HELP', 'profiles', p_profile, jsonb_build_object('action', p_action));
end $$;
revoke all on function public.log_signin_help(uuid, text) from public, anon;
grant execute on function public.log_signin_help(uuid, text) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.32.0','feature','Sign-in help for admins',
  'Admin → Sign-in help shows why a member cannot sign in (email not confirmed, waiting for approval, overdue fees, Google or Facebook only) and sends the right email link. Passwords are always set by the member.','2026-11-17')
on conflict (version) do nothing;


-- ===== 20260101000045_player_coach.sql =====
-- 0045 Player-coach: one account that coaches a team and also plays (release 0.33.0).
-- A new role, player_coach, gets everything a coach gets (coach area, team rosters, attendance, lineups, evaluations)
-- and everything a player gets (player area, calendar replies, fees, contracts, the squad). Rules:
--  * As a coach they never act on their OWN player record: app.coaches_player() is false for it, so they cannot
--    evaluate themselves, set their own goals or read their own private data as "their coach".
--  * Their own player record follows the player rules: only the player columns (app.restrict_columns), and their own
--    event replies close when the event starts (app.guard_event_reply).
--  * They pay membership fees like any player, so the overdue-fee sign-in block applies to them too.
-- The enum value is compared as text below, so this file also runs in one transaction (Supabase SQL Editor): a new enum
-- value cannot be used as a literal before it is committed.

alter type user_role add value if not exists 'player_coach';

-- ---------- role helpers ----------
create or replace function app.is_coach() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role()::text in ('coach', 'player_coach'), false) $$;
create or replace function app.is_playing() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role()::text in ('player', 'player_coach'), false) $$;
grant execute on function app.is_coach(), app.is_playing() to anon, authenticated;

create or replace function app.coaches_ts(ts uuid) returns boolean language sql stable security definer set search_path = public as
$$ select app.is_coach() and exists (
     select 1 from team_staff t join staff_members s on s.id = t.staff_id
     where s.profile_id = auth.uid() and t.team_season_id = ts) $$;
-- never their own player record: a player-coach is not their own coach
create or replace function app.coaches_player(pid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select app.is_coach() and pid is distinct from app.my_player_id() and exists (
     select 1 from team_players tp join team_staff t on t.team_season_id = tp.team_season_id
     join staff_members s on s.id = t.staff_id
     where tp.player_id = pid and s.profile_id = auth.uid()) $$;
create or replace function app.in_team_ts(ts uuid) returns boolean language sql stable security definer set search_path = public as
$$ select app.is_playing() and exists (
     select 1 from team_players tp where tp.team_season_id = ts and tp.player_id = app.my_player_id()) $$;

-- Coaches may change any column of the rows the policies let them update, except a player-coach on their own player
-- record: there only the player columns (so nobody grants themselves e.g. a fee exemption).
create or replace function app.restrict_columns() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or app.is_admin() then return new; end if;
  if app.is_coach() and not (tg_table_name = 'players' and to_jsonb(new) ->> 'profile_id' = auth.uid()::text) then return new; end if;
  if (to_jsonb(new) - tg_argv) is distinct from (to_jsonb(old) - tg_argv) then
    raise exception 'You may not change these fields' using errcode = '42501';
  end if;
  return new;
end $$;

-- Coaches and admins may correct anyone's reply at any time; one's own reply always follows the player rules.
create or replace function app.guard_event_reply() returns trigger language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_status text; v_self boolean;
begin
  if new.availability is not distinct from old.availability and new.note is not distinct from old.note then
    new.responded_at := old.responded_at; -- the answer time follows the answer and cannot be set on its own
    return new;
  end if;
  new.responded_at := case when new.availability = 'pending' then null else now() end;
  v_self := exists (select 1 from players p where p.id = new.player_id and p.profile_id = auth.uid());
  if not v_self or app.is_admin() then return new; end if;
  if tg_table_name = 'session_attendance' then
    select s.starts_at, s.status::text into v_start, v_status from training_sessions s where s.id = new.session_id;
  else
    select m.kickoff_at, m.status::text into v_start, v_status from matches m where m.id = new.match_id;
  end if;
  if v_status is distinct from 'scheduled' or v_start <= now() then
    raise exception 'Replies are closed for this event' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- A player-coach pays fees like a player: the overdue-fee block (0022) applies to both roles.
create or replace function app.player_blocked(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select fp.enabled
       and p.role::text in ('player', 'player_coach') and p.status = 'active'
       and not coalesce(pl.fee_exempt_until >= current_date, false)
       and exists (select 1 from payments pay
                    where pay.player_id = pl.id and pay.status in ('pending','failed')
                      and pay.due_on is not null and pay.due_on + fp.grace_days < current_date)
    from fee_policy fp cross join profiles p left join players pl on pl.profile_id = p.id
    where p.id = p_user
  ), false)
$$;
revoke all on function app.player_blocked(uuid) from public, anon, authenticated;

-- Announcements: player-coaches are in both the "players" and the "coaches" audience.
create or replace function public.publish_announcement(p_id uuid) returns int language plpgsql security definer set search_path = public as $$
declare a announcements; n int;
begin
  select * into a from announcements where id = p_id;
  if not found then raise exception 'Announcement not found' using errcode = 'P0002'; end if;
  if not (app.is_admin() or (app.is_coach() and a.audience = 'team' and app.coaches_ts(a.team_season_id))) then
    raise exception 'Not allowed to publish this announcement' using errcode = '42501'; end if;
  if a.published_at is not null then raise exception 'Already published' using errcode = '23505'; end if;
  update announcements set published_at = now() where id = p_id;
  insert into notifications (user_id, kind, title, body, link)
  select p.id, 'announcement', a.title, left(a.body, 200), '/announcements' from profiles p
  where p.status = 'active' and (
    a.audience = 'everyone'
    or (a.audience = 'players' and p.role::text in ('player', 'player_coach'))
    or (a.audience = 'coaches' and p.role::text in ('coach', 'player_coach'))
    or (a.audience = 'team' and (
         exists (select 1 from players pl join team_players tp on tp.player_id = pl.id where pl.profile_id = p.id and tp.team_season_id = a.team_season_id and tp.left_on is null)
      or exists (select 1 from staff_members sm join team_staff ts on ts.staff_id = sm.id where sm.profile_id = p.id and ts.team_season_id = a.team_season_id))));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.publish_announcement(uuid) from anon;

-- ---------- policies that named the coach or player role ----------
drop policy staff_read_coaches on staff_members;
create policy staff_read_coaches on staff_members for select to authenticated using (app.is_coach());

drop policy eval_coach_modify on evaluations;
create policy eval_coach_modify on evaluations for update to authenticated using (evaluator_id = auth.uid() and app.is_coach()) with check (evaluator_id = auth.uid() and app.coaches_player(player_id));
drop policy eval_coach_delete on evaluations;
create policy eval_coach_delete on evaluations for delete to authenticated using (evaluator_id = auth.uid() and app.is_coach());
drop policy escores_write on evaluation_scores;
create policy escores_write on evaluation_scores for all to authenticated
  using (exists (select 1 from evaluations e where e.id = evaluation_id and e.evaluator_id = auth.uid() and app.is_coach()))
  with check (exists (select 1 from evaluations e where e.id = evaluation_id and e.evaluator_id = auth.uid() and app.is_coach()));

drop policy announcements_read on announcements;
create policy announcements_read on announcements for select to authenticated using (
  app.is_active() and published_at is not null and published_at <= now() and (expires_at is null or expires_at > now()) and (
    audience = 'everyone' or (audience = 'players' and app.is_playing()) or (audience = 'coaches' and app.is_coach())
    or (audience = 'team' and (app.coaches_ts(team_season_id) or app.in_team_ts(team_season_id)))));
drop policy announcements_coach_draft on announcements;
create policy announcements_coach_draft on announcements for all to authenticated
  using (app.is_coach() and created_by = auth.uid() and published_at is null)
  with check (app.is_coach() and created_by = auth.uid() and audience = 'team' and app.coaches_ts(team_season_id) and published_at is null);

drop policy coach_read on federation_players;
create policy coach_read on federation_players for select to authenticated using (app.is_coach());
drop policy coach_read on federation_player_stats;
create policy coach_read on federation_player_stats for select to authenticated using (app.is_coach());

-- Any other policy that still names the role (e.g. the locations policies, whichever version of 0015 / 0039 is
-- installed) is rewritten in place, keeping the rest of its rule as it is.
do $$
declare r record; q text; c text;
begin
  for r in select schemaname, tablename, policyname, qual, with_check from pg_policies
           where coalesce(qual, '') ~ '''(coach|player)''::user_role' or coalesce(with_check, '') ~ '''(coach|player)''::user_role' loop
    q := regexp_replace(regexp_replace(r.qual, 'app\.role\(\) = ''coach''::user_role', 'app.is_coach()', 'g'), 'app\.role\(\) = ''player''::user_role', 'app.is_playing()', 'g');
    c := regexp_replace(regexp_replace(r.with_check, 'app\.role\(\) = ''coach''::user_role', 'app.is_coach()', 'g'), 'app\.role\(\) = ''player''::user_role', 'app.is_playing()', 'g');
    execute format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename)
      || case when q is not null then format(' using (%s)', q) else '' end
      || case when c is not null then format(' with check (%s)', c) else '' end;
  end loop;
end $$;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.33.0','feature','Player-coach role',
  'A coach who also plays: one account with the coach area and the player area. They never act as coach on their own player record, and pay fees like any player.','2026-11-17')
on conflict (version) do nothing;


-- ===== 20260101000046_requests_inbox.sql =====
-- 0046 Requests inbox (Admin → Requests). Release 0.34.0.
-- Admins now handle website messages in the app, so changes to them are audited like the other requests (tryouts,
-- enrolments, invoice requests). "redact": the log keeps which columns changed, never the message or the sender's details.
drop trigger if exists audit on contact_messages;
create trigger audit after insert or update or delete on contact_messages for each row execute function app.audit('redact');

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.34.0','feature','Requests inbox',
  'Admin → Requests lists tryout requests, team enrolments, invoice requests and messages from the website, with a count in the menu, a status and an internal note for each.','2026-11-18')
on conflict (version) do nothing;


-- ===== 20260101000047_match_details.sql =====
-- 0047 Game details from the Palloliitto results service (release 0.35.0).
-- The sync now also reads each played club game in detail (getMatch): half-time score, attendance, and the goals and
-- cards with minute, team and player. The website opens a page per game from the home page's results.
-- Kept: only those facts. Not kept: referees and officials, line-ups, birth years, the raw answer.
-- A club player who removed themselves from the website or was hidden by an admin (migration 0042) appears without a
-- name on the public page; other teams' scorers are shown as the results service publishes them.

alter table federation_matches
  add column ht_home int check (ht_home between 0 and 99),
  add column ht_away int check (ht_away between 0 and 99),
  add column attendance int check (attendance between 0 and 200000),
  add column details_synced_at timestamptz;

create table federation_match_events (
  id uuid primary key default gen_random_uuid(),
  match_external_id text not null references federation_matches(external_id) on delete cascade,
  seq int not null check (seq between 1 and 500),
  kind text not null check (kind in ('goal', 'yellow', 'red')),
  minute int check (minute between 0 and 200),
  team_external_id text not null check (char_length(team_external_id) <= 20),
  player_external_id text check (char_length(player_external_id) <= 20),
  player_name text check (char_length(player_name) <= 120),
  score_home int check (score_home between 0 and 99),
  score_away int check (score_away between 0 and 99),
  synced_at timestamptz not null default now(),
  unique (match_external_id, seq)
);
alter table federation_match_events enable row level security;
create policy admin_all on federation_match_events for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy coach_read on federation_match_events for select to authenticated using (app.is_coach());
revoke all on federation_match_events from anon;

-- The website's games: the 0040 view plus half-time score, attendance, crests and whether details exist.
create or replace view public_league_fixtures as
select m.external_id, m.competition_external_id, c.name as competition, c.category, c.kind, c.season, m.kickoff_at,
       m.home_name, m.away_name, m.home_goals, m.away_goals, m.venue, m.status,
       coalesce(h.is_club, false) as home_is_club, coalesce(a.is_club, false) as away_is_club, m.synced_at,
       m.ht_home, m.ht_away, m.attendance, h.logo_url as home_logo, a.logo_url as away_logo, m.details_synced_at is not null as has_details
from federation_matches m
join federation_competitions c on c.external_id = m.competition_external_id and c.show_publicly
left join federation_teams h on h.external_id = m.home_external_id
left join federation_teams a on a.external_id = m.away_external_id;
grant select on public_league_fixtures to anon, authenticated;

-- Goals and cards of public games. side: home or away; a club player who opted out or was hidden has no name.
create view public_league_match_events as
select e.match_external_id, e.seq, e.kind, e.minute,
       case when e.team_external_id = m.home_external_id then 'home' else 'away' end as side,
       coalesce(t.is_club, false) as is_club,
       case when t.is_club and (coalesce(fp.hidden, false) or coalesce(p.website_hidden, false)) then null else e.player_name end as player_name,
       e.score_home, e.score_away
from federation_match_events e
join federation_matches m on m.external_id = e.match_external_id
join federation_competitions c on c.external_id = m.competition_external_id and c.show_publicly
left join federation_teams t on t.external_id = e.team_external_id
left join federation_players fp on fp.external_id = e.player_external_id
left join players p on p.id = fp.player_id;
grant select on public_league_match_events to anon, authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.35.0','feature','Game details',
  'Each result on the website opens a page with the half-time score, the goals and cards with minutes and players, the venue and attendance, from the Palloliitto results service.','2026-11-18')
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

