-- Afro Foot 2.0 database setup, part 3 of 3. Paste into Supabase > SQL Editor and click Run. Run the parts in order, once each.
-- Contains: 20260101000015_locations_events_enrolment.sql, 20260101000016_versions_revisions.sql, 20260101000017_membership_fees.sql, 20260101000018_release_0_11_0.sql, 20260101000019_fees_invoices_sponsor_packages.sql, 20260101000020_release_0_12_1.sql, 20260101000021_insurance_prices.sql, 20260101000022_fee_status_signin_block.sql, 20260101000023_lineup_templates.sql, 20260101000024_phone_country_code.sql, 20260101000025_enrolment_nationality_code.sql, 20260101000026_release_0_15_0.sql, 20260101000027_automatic_invoices.sql, 20260101000028_code_of_conduct.sql, 20260101000029_event_replies.sql, 20260101000030_player_contracts.sql, 20260101000031_match_day.sql, 20260101000032_lineup_board.sql, 20260101000033_social_sign_in.sql, 20260101000034_events_public_schedule.sql, 20260101000035_phone_sign_up.sql, 20260101000036_invoice_after_consents.sql, 20260101000037_automatic_contracts.sql, 20260101000038_amateur_contract.sql, 20260101000039_saved_places.sql, 20260101000040_federation_sync.sql, 20260101000041_squad_consent_stats.sql, 20260101000042_squad_from_palloliitto.sql, 20260101000043_top_scorers.sql, 20260101000044_signin_help.sql, 20260101000045_player_coach.sql, 20260101000046_requests_inbox.sql, 20260101000047_match_details.sql, 20260101000048_email_notifications.sql, 20260101000049_football_quiz.sql, 20260101000050_quiz_more.sql, 20260101000051_signin_log.sql, 20260101000052_contract_signatory.sql, 20260101000053_past_due_lines.sql, 20260101000054_finance.sql, 20260101000055_balance_invoices.sql, 20260101000056_partial_payments.sql, 20260101000057_shirt_numbers.sql, 20260101000058_contact_robot_check.sql, 20260101000059_shirt_set.sql, 20260101000060_invoice_schedule.sql, 20260101000061_opponents.sql, 20260101000062_event_tasks.sql, 20260101000063_season_invoices.sql, 20260101000064_content_assistant.sql, 20260101000065_merge_accounts.sql, 20260101000066_coach_requests.sql, 20260101000067_duplicate_accounts.sql, 20260101000068_minor_contracts.sql, 20260101000069_reply_counts.sql, 20260101000070_coach_permissions.sql, seed.sql


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


-- ===== 20260101000039_saved_places.sql =====
-- 0039 Saved places page. Release 0.27.0.
-- Coaches and admins manage the club's saved places (pitches, halls, gyms) on their own page: add a place, and edit its
-- name, type, address, map link and the directions players see. Before, a place could only be added inside an event form,
-- and a coach could only fix the places they had added themselves.
--  * Coaches may edit every saved place (the audit trail records who changed what). Admins keep full access (admin_all).
--  * Only admins hide or show a place (active). Nobody changes who added it (created_by), except the database itself when
--    that account is deleted (on delete set null).
--  * A place used by a training, a weekly schedule, a game or an event cannot be deleted: hide it instead, so no event
--    loses its place without anyone noticing.
--  * Length checks for the text fields, mirroring the form (lib/places.ts). Added as NOT VALID: they apply to every new
--    or changed row, and older rows that do not meet them are left as they are.

-- Safe to run more than once. Coaches and player-coaches (role::text: works before the player-coach role, 0045, exists).
drop policy if exists coach_update on locations;
create policy coach_update on locations for update to authenticated
  using (app.role()::text in ('coach', 'player_coach') and app.is_active()) with check (app.role()::text in ('coach', 'player_coach') and app.is_active());

create or replace function app.guard_locations() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by and new.created_by is not null then
      raise exception 'Who added a place cannot be changed.' using errcode = '42501';
    end if;
    if new.active is distinct from old.active and auth.uid() is not null and not app.is_admin() then
      raise exception 'Only club admins hide or show a place.' using errcode = '42501';
    end if;
    return new;
  end if;
  if exists (select 1 from training_sessions where location_id = old.id)
     or exists (select 1 from training_schedules where location_id = old.id)
     or exists (select 1 from matches where location_id = old.id)
     or exists (select 1 from club_events where location_id = old.id) then
    raise exception 'This place is used by a training, game or event. Hide it instead of deleting it.' using errcode = '23503';
  end if;
  return old;
end $$;
revoke all on function app.guard_locations() from public;

drop trigger if exists guard_locations on locations;
create trigger guard_locations before update or delete on locations for each row execute function app.guard_locations();

alter table locations drop constraint if exists locations_name_len, drop constraint if exists locations_address_len,
  drop constraint if exists locations_city_len, drop constraint if exists locations_notes_len;
alter table locations
  add constraint locations_name_len check (char_length(btrim(name)) between 2 and 120) not valid,
  add constraint locations_address_len check (address is null or char_length(address) <= 200) not valid,
  add constraint locations_city_len check (city is null or char_length(city) <= 80) not valid,
  add constraint locations_notes_len check (notes is null or char_length(notes) <= 500) not valid;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.27.0','feature','Saved places',
  'Coaches and admins have a Places page: add pitches, halls and gyms, and edit their address, map link and directions for players. Admins can hide a place, or delete one that no event uses.','2026-11-17')
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


-- ===== 20260101000048_email_notifications.sql =====
-- 0048 Emails from the club: reply deadlines and reminders, the approval email, request alerts (release 0.36.0).
-- Everything is sent from the database, so no app or website needs an all-access key:
--  * email_outbox: every email to send. Triggers and a daily job add to it; a job every 2 minutes sends it through
--    Resend (pg_net) with the key kept in Supabase Vault (secret "resend_api_key"), then records Resend's answer.
--    Without the key nothing is sent: emails wait (at most 2 days) until the key is added.
--  * Reply deadline (reply_by) on trainings and games, set automatically: trainings the day before at 20:00, games two
--    days before at 20:00 (Helsinki time); coaches can change it. A player's own reply closes at the deadline.
--  * Reminders to players who have not replied: 3 days before the deadline and on the deadline day (morning), once
--    each; never to players without an email address, who switched reminders off, or who are blocked by overdue fees.
--  * The approval email when an account becomes active, in the member's language.
--  * An alert to the club (info@afrofoot.club) for each new website request (tryout, enrolment, invoice, message).
-- Settings (sender, reply-to, alert address, links): site_settings key "email" (not public), editable by admins.

-- ---------- extensions (present on Supabase; skipped where they are not, e.g. a plain Postgres for tests) ----------
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net; end if;
exception when others then raise notice 'pg_net not enabled (%): emails stay queued.', sqlerrm;
end $$;

-- ---------- reply deadline ----------
alter table training_sessions add column reply_by timestamptz;
alter table matches add column reply_by timestamptz;
alter table training_sessions add constraint training_reply_by_before_start check (reply_by is null or reply_by <= starts_at) not valid;
alter table matches add constraint match_reply_by_before_kickoff check (reply_by is null or reply_by <= kickoff_at) not valid;

-- The default deadline: N days before the event's day, at 20:00 Helsinki time (never after the start).
create or replace function app.default_reply_by(p_start timestamptz, p_days int) returns timestamptz language sql immutable as $$
  select least(p_start, ((((p_start at time zone 'Europe/Helsinki')::date - p_days)::timestamp + time '20:00') at time zone 'Europe/Helsinki'))
$$;
-- Each table in its own branch: a PL/pgSQL expression may only name columns the row has.
create or replace function app.set_reply_by() returns trigger language plpgsql as $$
declare v_start timestamptz; v_old timestamptz; v_days int;
begin
  if tg_table_name = 'matches' then
    v_start := new.kickoff_at; v_days := 2;
    if tg_op = 'UPDATE' then v_old := old.kickoff_at; end if;
  else
    v_start := new.starts_at; v_days := 1;
    if tg_op = 'UPDATE' then v_old := old.starts_at; end if;
  end if;
  -- set when missing; follow the event when it moves and the deadline was the automatic one or is now after the start
  if new.reply_by is null
     or (tg_op = 'UPDATE' and v_start is distinct from v_old and (old.reply_by is not distinct from app.default_reply_by(v_old, v_days) or new.reply_by > v_start)) then
    new.reply_by := app.default_reply_by(v_start, v_days);
  end if;
  return new;
end $$;
create trigger set_reply_by before insert or update on training_sessions for each row execute function app.set_reply_by();
create trigger set_reply_by before insert or update on matches for each row execute function app.set_reply_by();
update training_sessions set reply_by = app.default_reply_by(starts_at, 1) where reply_by is null;
update matches set reply_by = app.default_reply_by(kickoff_at, 2) where reply_by is null;

-- The player calendar view (0034) with the deadline at the end.
create or replace view team_schedule with (security_invoker = true) as
select s.id, 'practice'::text as event_type, s.team_season_id, s.title, null::text as division, s.starts_at, s.ends_at, s.location_id, s.status::text as status,
       s.meet_at, s.meeting_point, null::text as kind, null::text as description, s.reply_by
from training_sessions s
union all
select m.id, m.event_type::text, m.team_season_id, m.opponent, m.division, m.kickoff_at, m.kickoff_at + interval '2 hours', m.location_id, m.status::text,
       m.meet_at, m.meeting_point, null, null, m.reply_by
from matches m
union all
select e.id, 'event', e.team_season_id, e.title, null, e.starts_at, e.ends_at, e.location_id, e.status,
       e.meet_at, e.meeting_point, e.kind, e.description, null::timestamptz
from club_events e;

-- One's own reply closes at the deadline (0045 closed it at the start); coaches and admins may still correct it.
create or replace function app.guard_event_reply() returns trigger language plpgsql security definer set search_path = public as $$
declare v_close timestamptz; v_status text; v_self boolean;
begin
  if new.availability is not distinct from old.availability and new.note is not distinct from old.note then
    new.responded_at := old.responded_at;
    return new;
  end if;
  new.responded_at := case when new.availability = 'pending' then null else now() end;
  v_self := exists (select 1 from players p where p.id = new.player_id and p.profile_id = auth.uid());
  if not v_self or app.is_admin() then return new; end if;
  if tg_table_name = 'session_attendance' then
    select least(coalesce(s.reply_by, s.starts_at), s.starts_at), s.status::text into v_close, v_status from training_sessions s where s.id = new.session_id;
  else
    select least(coalesce(m.reply_by, m.kickoff_at), m.kickoff_at), m.status::text into v_close, v_status from matches m where m.id = new.match_id;
  end if;
  if v_status is distinct from 'scheduled' or v_close <= now() then
    raise exception 'Replies are closed for this event' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ---------- preferences and settings ----------
alter table profiles add column reminder_emails boolean not null default true;
comment on column profiles.reminder_emails is 'The member wants reply reminders by email (My profile). Migration 0048.';
insert into site_settings (key, value, is_public) values ('email', jsonb_build_object(
  'from', 'Afro Foot Club <noreply@afrofoot.club>', 'reply_to', 'info@afrofoot.club', 'alert_to', 'info@afrofoot.club',
  'app_url', 'https://app.afrofoot.club', 'api_url', 'https://api.resend.com/emails'), false)
on conflict (key) do nothing;

-- ---------- templates (subject, text, button) per kind and language ----------
create table email_templates (
  kind text not null check (kind in ('reminder_3d', 'reminder_last', 'approved', 'request_alert', 'label_game')),
  locale text not null check (locale in ('en', 'fi', 'fr', 'ar')),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) <= 4000),
  cta text check (char_length(cta) <= 60),
  primary key (kind, locale)
);
alter table email_templates enable row level security;
create policy admin_all on email_templates for all to authenticated using (app.is_admin()) with check (app.is_admin());
insert into email_templates (kind, locale, subject, body, cta) values
 ('reminder_3d', 'en', 'Are you in? {event}, {when}', E'Hi {name},\n\n{event} is on {when}. Please tell your coach if you are coming: reply by {reply_by}.', 'Reply in the app'),
 ('reminder_3d', 'fi', 'Tuletko? {event}, {when}', E'Hei {name},\n\n{event} on {when}. Kerro valmentajalle, tuletko: vastaa viimeistään {reply_by}.', 'Vastaa sovelluksessa'),
 ('reminder_3d', 'fr', 'Tu viens ? {event}, {when}', E'Bonjour {name},\n\n{event} a lieu le {when}. Dis à ton entraîneur si tu viens : réponds avant le {reply_by}.', 'Répondre dans l’app'),
 ('reminder_3d', 'ar', 'هل ستحضر؟ {event}، {when}', E'مرحبًا {name}،\n\n{event} في {when}. أخبر مدربك إن كنت ستحضر: ردّ قبل {reply_by}.', 'الرد في التطبيق'),
 ('reminder_last', 'en', 'Last day to reply: {event}, {when}', E'Hi {name},\n\nToday is the last day to tell your coach if you are coming to {event} on {when}. Replies close at {reply_by}.', 'Reply now'),
 ('reminder_last', 'fi', 'Viimeinen päivä vastata: {event}, {when}', E'Hei {name},\n\nTänään on viimeinen päivä kertoa, tuletko: {event}, {when}. Vastaukset sulkeutuvat {reply_by}.', 'Vastaa nyt'),
 ('reminder_last', 'fr', 'Dernier jour pour répondre : {event}, {when}', E'Bonjour {name},\n\nAujourd’hui est le dernier jour pour dire si tu viens : {event}, le {when}. Les réponses ferment le {reply_by}.', 'Répondre maintenant'),
 ('reminder_last', 'ar', 'آخر يوم للرد: {event}، {when}', E'مرحبًا {name}،\n\nاليوم آخر يوم لتخبر مدربك إن كنت ستحضر {event} في {when}. تُغلق الردود في {reply_by}.', 'ردّ الآن'),
 ('approved', 'en', 'Welcome to Afro Foot Club: your account is approved', E'Hi {name},\n\nYour account in the Afro Foot Club app is approved. You can now sign in to see your calendar, reply to trainings and games, and find your membership and contract.', 'Sign in'),
 ('approved', 'fi', 'Tervetuloa Afro Foot Clubiin: tilisi on hyväksytty', E'Hei {name},\n\nTilisi Afro Foot Clubin sovelluksessa on hyväksytty. Voit nyt kirjautua: näet kalenterisi, voit vastata harjoituksiin ja otteluihin sekä löydät jäsenyytesi ja sopimuksesi.', 'Kirjaudu'),
 ('approved', 'fr', 'Bienvenue à Afro Foot Club : ton compte est validé', E'Bonjour {name},\n\nTon compte dans l’app Afro Foot Club est validé. Tu peux te connecter pour voir ton calendrier, répondre aux entraînements et aux matchs, et trouver ton adhésion et ton contrat.', 'Se connecter'),
 ('approved', 'ar', 'مرحبًا بك في Afro Foot Club: تمت الموافقة على حسابك', E'مرحبًا {name}،\n\nتمت الموافقة على حسابك في تطبيق Afro Foot Club. يمكنك الآن تسجيل الدخول لرؤية تقويمك والرد على التدريبات والمباريات والاطلاع على عضويتك وعقدك.', 'تسجيل الدخول'),
 ('request_alert', 'en', 'New {kind}: {name}', E'A new {kind} arrived from the website: {name}.\n\nOpen it in Admin → Requests.', 'Open the request'),
 ('label_game', 'en', 'Game vs {opponent}', '', null),
 ('label_game', 'fi', 'Ottelu vs {opponent}', '', null),
 ('label_game', 'fr', 'Match contre {opponent}', '', null),
 ('label_game', 'ar', 'مباراة ضد {opponent}', '', null);

-- ---------- outbox ----------
create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('reminder_3d', 'reminder_last', 'approved', 'request_alert')),
  ref_id uuid not null,                         -- the event, profile or request it is about
  profile_id uuid references profiles(id) on delete cascade,
  to_email citext not null check (char_length(to_email) <= 200),
  locale text not null default 'en',
  subject text not null, body_text text not null, body_html text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed', 'expired')),
  request_id bigint, error text check (char_length(error) <= 400),
  created_at timestamptz not null default now(), sent_at timestamptz,
  unique (kind, ref_id, to_email)               -- each email at most once
);
create index on email_outbox (status, created_at);
alter table email_outbox enable row level security;
create policy admin_read on email_outbox for select to authenticated using (app.is_admin());
revoke all on email_outbox from anon;

-- {key} placeholders filled from a json object
create or replace function app.fill(p_text text, p_vars jsonb) returns text language plpgsql immutable as $$
declare k text; v text; r text := coalesce(p_text, '');
begin
  for k, v in select key, value from jsonb_each_text(p_vars) loop r := replace(r, '{' || k || '}', coalesce(v, '')); end loop;
  return r;
end $$;
create or replace function app.html_escape(p text) returns text language sql immutable as
$$ select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;') $$;

-- Queues one email from a template (falls back to English); returns false when it was queued before.
create or replace function app.queue_email(p_kind text, p_to text, p_locale text, p_vars jsonb, p_ref uuid, p_profile uuid, p_link text)
returns boolean language plpgsql security definer set search_path = public as $$
declare tpl email_templates; v_locale text := case when p_locale in ('en', 'fi', 'fr', 'ar') then p_locale else 'en' end;
        v_subject text; v_text text; v_html text; n int;
begin
  if p_to is null or p_to !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return false; end if;
  select * into tpl from email_templates where kind = p_kind and locale = v_locale;
  if not found then v_locale := 'en'; select * into tpl from email_templates where kind = p_kind and locale = 'en'; end if;
  if not found then return false; end if;
  v_subject := app.fill(tpl.subject, p_vars);
  v_text := app.fill(tpl.body, p_vars) || case when p_link is not null then E'\n\n' || coalesce(tpl.cta, '') || ': ' || p_link else '' end
            || E'\n\n– Afro Foot Club';
  v_html := '<div dir="' || case when v_locale = 'ar' then 'rtl' else 'ltr' end || '" style="font-family:Figtree,Arial,sans-serif;font-size:15px;line-height:1.55;color:#101510;max-width:560px">'
            || '<div style="height:6px;background:linear-gradient(90deg,#3DAF2C,#EDF70F);border-radius:3px;margin-bottom:18px"></div>'
            || replace(app.html_escape(app.fill(tpl.body, p_vars)), E'\n', '<br>')
            || case when p_link is not null then '<p style="margin:22px 0"><a href="' || app.html_escape(p_link) || '" style="background:#3DAF2C;color:#101510;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:700">' || app.html_escape(coalesce(tpl.cta, p_link)) || '</a></p>' else '' end
            || '<p style="color:#5D675F;font-size:13px">Afro Foot Club ry</p></div>';
  insert into email_outbox (kind, ref_id, profile_id, to_email, locale, subject, body_text, body_html)
  values (p_kind, p_ref, p_profile, p_to, v_locale, v_subject, v_text, v_html)
  on conflict (kind, ref_id, to_email) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function app.queue_email(text, text, text, jsonb, uuid, uuid, text) from public, anon, authenticated;

create or replace function app.email_setting(p_key text) returns text language sql stable security definer set search_path = public as
$$ select value ->> p_key from site_settings where key = 'email' $$;

-- ---------- reminders (daily) ----------
-- For trainings and games with a deadline today (last call) or in 3 days, to roster players who have not replied.
create or replace function app.queue_reminders(p_now timestamptz default now()) returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_today date := (p_now at time zone 'Europe/Helsinki')::date; v_app text := coalesce(app.email_setting('app_url'), 'https://app.afrofoot.club');
begin
  for r in
    with ev as (
      select s.id, 'practice' as type, s.team_season_id, s.title as label, s.starts_at, s.reply_by from training_sessions s
       where s.status = 'scheduled' and s.reply_by > p_now
      union all
      select m.id, 'game', m.team_season_id, m.opponent, m.kickoff_at, m.reply_by from matches m
       where m.status = 'scheduled' and m.reply_by > p_now
    ), due as (
      select ev.*, case when (ev.reply_by at time zone 'Europe/Helsinki')::date = v_today then 'reminder_last'
                        when (ev.reply_by at time zone 'Europe/Helsinki')::date = v_today + 3 then 'reminder_3d' end as kind
      from ev
    ), pending as (
      select d.*, a.player_id from due d join session_attendance a on a.session_id = d.id and a.availability = 'pending' where d.kind is not null and d.type = 'practice'
      union all
      select d.*, a.player_id from due d join match_availability a on a.match_id = d.id and a.availability = 'pending' where d.kind is not null and d.type = 'game'
    )
    select p.*, pr.id as profile_id, pr.email, pr.first_name, pr.locale
    from pending p
    join players pl on pl.id = p.player_id
    join profiles pr on pr.id = pl.profile_id
    join team_players tp on tp.player_id = p.player_id and tp.team_season_id = p.team_season_id and tp.left_on is null
    where pr.status = 'active' and pr.email is not null and pr.reminder_emails and not app.player_blocked(pr.id)
  loop
    if app.queue_email(r.kind, r.email, r.locale, jsonb_build_object(
         'name', r.first_name,
         'event', case when r.type = 'game' then app.fill((select subject from email_templates where kind = 'label_game' and locale = case when r.locale in ('en','fi','fr','ar') then r.locale else 'en' end), jsonb_build_object('opponent', r.label)) else r.label end,
         'when', to_char(r.starts_at at time zone 'Europe/Helsinki', 'DD.MM.YYYY HH24:MI'),
         'reply_by', to_char(r.reply_by at time zone 'Europe/Helsinki', 'DD.MM.YYYY HH24:MI')),
       r.id, r.profile_id, v_app || '/me?m=' || to_char(r.starts_at at time zone 'Europe/Helsinki', 'YYYY-MM') || '#ev-' || r.id) then
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function app.queue_reminders(timestamptz) from public, anon, authenticated;

-- ---------- approval email ----------
create or replace function app.email_on_approval() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'active' and new.email is not null then
    perform app.queue_email('approved', new.email, new.locale, jsonb_build_object('name', coalesce(nullif(new.first_name, ''), '')), new.id, new.id,
      coalesce(app.email_setting('app_url'), 'https://app.afrofoot.club') || '/login');
  end if;
  return new;
end $$;
create trigger email_on_approval after update of status on profiles for each row execute function app.email_on_approval();

-- ---------- request alerts to the club ----------
create or replace function app.email_on_request() returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text; v_name text; v_to text := coalesce(app.email_setting('alert_to'), 'info@afrofoot.club');
begin
  v_kind := case tg_table_name when 'tryout_requests' then 'tryout request' when 'player_enrolments' then 'team enrolment'
                               when 'invoice_requests' then 'invoice request' else 'message' end;
  v_name := case tg_table_name when 'invoice_requests' then to_jsonb(new) ->> 'full_name' when 'contact_messages' then to_jsonb(new) ->> 'name'
                 else concat_ws(' ', to_jsonb(new) ->> 'first_name', to_jsonb(new) ->> 'last_name') end;
  if tg_table_name = 'contact_messages' and to_jsonb(new) ->> 'topic' = 'partnership' then v_kind := 'sponsor enquiry'; end if;
  perform app.queue_email('request_alert', v_to, 'en', jsonb_build_object('kind', v_kind, 'name', v_name), new.id, null,
    coalesce(app.email_setting('app_url'), 'https://app.afrofoot.club') || '/admin/requests');
  return new;
end $$;
create trigger email_on_request after insert on tryout_requests for each row execute function app.email_on_request();
create trigger email_on_request after insert on player_enrolments for each row execute function app.email_on_request();
create trigger email_on_request after insert on invoice_requests for each row execute function app.email_on_request();
create trigger email_on_request after insert on contact_messages for each row execute function app.email_on_request();

-- ---------- sending (Resend through pg_net, key from Supabase Vault) ----------
create or replace function app.resend_key() returns text language plpgsql stable security definer set search_path = public as $$
declare k text;
begin
  if to_regclass('vault.decrypted_secrets') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into k using 'resend_api_key';
  return nullif(trim(k), '');
exception when others then return null;
end $$;
revoke all on function app.resend_key() from public, anon, authenticated;

create or replace function app.send_outbox() returns int language plpgsql security definer set search_path = public as $$
declare r email_outbox; k text := app.resend_key(); rid bigint; n int := 0;
begin
  update email_outbox set status = 'expired' where status = 'queued' and created_at < now() - interval '2 days';
  if k is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return 0; end if;
  for r in select * from email_outbox where status = 'queued' order by created_at limit 50 for update skip locked loop
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 15000)' into rid
      using coalesce(app.email_setting('api_url'), 'https://api.resend.com/emails'),
            jsonb_build_object('from', coalesce(app.email_setting('from'), 'Afro Foot Club <noreply@afrofoot.club>'), 'to', jsonb_build_array(r.to_email),
              'reply_to', coalesce(app.email_setting('reply_to'), 'info@afrofoot.club'), 'subject', r.subject, 'text', r.body_text, 'html', r.body_html),
            jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json');
    update email_outbox set status = 'sent', request_id = rid, sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function app.send_outbox() from public, anon, authenticated;

-- Resend's answers: 2xx = delivered to Resend, anything else = failed (with the reason, never the key).
create or replace function app.check_outbox() returns int language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if to_regclass('net._http_response') is null then return 0; end if;
  execute $q$
    update email_outbox o set status = case when r.status_code between 200 and 299 then 'delivered' else 'failed' end,
      error = case when r.status_code between 200 and 299 then null else left(coalesce(r.error_msg, r.content, 'HTTP ' || r.status_code), 400) end
    from net._http_response r where r.id = o.request_id and o.status = 'sent' and (r.status_code is not null or r.error_msg is not null) $q$;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app.check_outbox() from public, anon, authenticated;

-- For Admin → overview: is sending set up, and how did the last 7 days go (never the key itself).
create or replace function public.email_status() returns table (key_set boolean, sender_ready boolean, queued bigint, delivered bigint, failed bigint, last_error text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query select app.resend_key() is not null, to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null,
    (select count(*) from email_outbox where status in ('queued', 'sent')),
    (select count(*) from email_outbox where status = 'delivered' and created_at > now() - interval '7 days'),
    (select count(*) from email_outbox where status = 'failed' and created_at > now() - interval '7 days'),
    (select o.error from email_outbox o where o.status = 'failed' order by o.created_at desc limit 1);
end $$;
revoke all on function public.email_status() from public, anon;
grant execute on function public.email_status() to authenticated;

-- ---------- schedules (Supabase pg_cron) ----------
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('afrofoot-email-send', '*/2 * * * *', 'select app.send_outbox(); select app.check_outbox();');
    perform cron.schedule('afrofoot-email-reminders', '5 6 * * *', 'select app.queue_reminders();');   -- 08:05 / 09:05 Helsinki
  end if;
exception when others then raise notice 'Could not schedule the email jobs (%). Enable pg_cron under Database > Extensions and run this file again.', sqlerrm;
end $$;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.36.0','feature','Reply deadlines, reminders and club emails',
  'Trainings and games have a reply deadline; players who have not replied get an email reminder 3 days before and on the last day. New members get an email when their account is approved, and the club gets an email for each new website request.','2026-11-18')
on conflict (version) do nothing;


-- ===== 20260101000049_football_quiz.sql =====
-- 0049 Football quiz for players (release 0.37.0).
-- The player area has a 5-question quiz: 3 questions on the Laws of the Game from quiz_questions, and club questions made
-- from live data by quiz_club_facts() (top scorer of the last two seasons from Palloliitto, the highest league played,
-- the founding year). Questions are data, editable by admins, in en/fi/fr/ar (English is the fallback). Answers stay
-- in the player's browser: nothing about scores is stored.
-- The rule questions follow the IFAB Laws of the Game 2025/26; review them when the Laws change (each July).

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  topic text not null default 'rules' check (topic in ('rules', 'club', 'football')),
  question jsonb not null check (jsonb_typeof(question) = 'object' and question ? 'en'),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  answer int not null,
  explain jsonb check (explain is null or (jsonb_typeof(explain) = 'object' and explain ? 'en')),
  source text check (char_length(source) <= 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (answer >= 0 and answer < jsonb_array_length(options))
);
alter table quiz_questions enable row level security;
create policy admin_all on quiz_questions for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy members_read on quiz_questions for select to authenticated using (active and app.is_active());
revoke all on quiz_questions from anon;
create trigger audit after insert or update or delete on quiz_questions for each row execute function app.audit();

-- o(en, fi, fr, ar): one option or text in four languages
create or replace function pg_temp.o(en text, fi text, fr text, ar text) returns jsonb language sql immutable as
$$ select jsonb_build_object('en', en, 'fi', fi, 'fr', fr, 'ar', ar) $$;

insert into quiz_questions (question, options, answer, explain, source) values
(pg_temp.o('When is a goal scored?', 'Milloin maali on syntynyt?', 'Quand un but est-il marqué ?', 'متى يُحتسب الهدف؟'),
 jsonb_build_array(
   pg_temp.o('When the whole ball has crossed the goal line', 'Kun koko pallo on ylittänyt maaliviivan', 'Quand le ballon a entièrement franchi la ligne de but', 'عندما تعبر الكرة بكاملها خط المرمى'),
   pg_temp.o('When most of the ball is over the line', 'Kun suurin osa pallosta on viivan yli', 'Quand la plus grande partie du ballon a franchi la ligne', 'عندما يتجاوز معظم الكرة الخط'),
   pg_temp.o('When the ball touches the goal line', 'Kun pallo koskettaa maaliviivaa', 'Quand le ballon touche la ligne de but', 'عندما تلمس الكرة خط المرمى'),
   pg_temp.o('When the goalkeeper is behind the line with the ball', 'Kun maalivahti on pallon kanssa viivan takana', 'Quand le gardien est derrière la ligne avec le ballon', 'عندما يكون الحارس خلف الخط ومعه الكرة')), 0,
 pg_temp.o('The whole ball must cross the goal line, between the posts and under the crossbar.', 'Koko pallon on ylitettävä maaliviiva tolppien välistä ja yläriman alta.', 'Le ballon doit franchir entièrement la ligne de but, entre les poteaux et sous la barre.', 'يجب أن تعبر الكرة بكاملها خط المرمى بين القائمين وتحت العارضة.'), 'IFAB Laws of the Game, Law 10'),

(pg_temp.o('Can a player be offside directly from a throw-in?', 'Voiko pelaaja olla paitsiossa suoraan rajaheitosta?', 'Un joueur peut-il être hors-jeu directement sur une rentrée de touche ?', 'هل يمكن أن يكون اللاعب متسللًا مباشرة من رمية تماس؟'),
 jsonb_build_array(
   pg_temp.o('No', 'Ei', 'Non', 'لا'),
   pg_temp.o('Yes, like from any pass', 'Kyllä, kuten mistä tahansa syötöstä', 'Oui, comme sur n’importe quelle passe', 'نعم، مثل أي تمريرة'),
   pg_temp.o('Only in the opponents'' half', 'Vain vastustajan kenttäpuoliskolla', 'Seulement dans la moitié adverse', 'فقط في نصف ملعب الخصم'),
   pg_temp.o('Only if the throw goes forward', 'Vain jos heitto menee eteenpäin', 'Seulement si la touche va vers l’avant', 'فقط إذا كانت الرمية إلى الأمام')), 0,
 pg_temp.o('There is no offside directly from a throw-in, a goal kick or a corner kick.', 'Paitsiota ei ole suoraan rajaheitosta, maalipotkusta eikä kulmapotkusta.', 'Il n’y a pas de hors-jeu directement sur une touche, un coup de pied de but ou un corner.', 'لا تسلل مباشرة من رمية التماس أو ضربة المرمى أو الضربة الركنية.'), 'IFAB Laws of the Game, Law 11'),

(pg_temp.o('The goalkeeper holds the ball in their hands for more than 8 seconds. What happens?', 'Maalivahti pitää palloa käsissään yli 8 sekuntia. Mitä tapahtuu?', 'Le gardien garde le ballon en main plus de 8 secondes. Que se passe-t-il ?', 'يمسك الحارس الكرة بيديه أكثر من 8 ثوانٍ. ماذا يحدث؟'),
 jsonb_build_array(
   pg_temp.o('A corner kick to the other team', 'Kulmapotku vastustajalle', 'Corner pour l’équipe adverse', 'ضربة ركنية للفريق الآخر'),
   pg_temp.o('An indirect free kick to the other team', 'Epäsuora vapaapotku vastustajalle', 'Coup franc indirect pour l’équipe adverse', 'ضربة حرة غير مباشرة للفريق الآخر'),
   pg_temp.o('A penalty kick', 'Rangaistuspotku', 'Penalty', 'ركلة جزاء'),
   pg_temp.o('Nothing, there is no time limit', 'Ei mitään, aikarajaa ei ole', 'Rien, il n’y a pas de limite', 'لا شيء، لا يوجد حد زمني')), 0,
 pg_temp.o('Since the 2025/26 Laws, holding the ball for more than 8 seconds gives the other team a corner kick; the referee counts the last 5 seconds with a raised hand.', 'Vuoden 2025/26 sääntöjen mukaan yli 8 sekunnin pitämisestä vastustaja saa kulmapotkun; tuomari laskee viimeiset 5 sekuntia käsi ylhäällä.', 'Depuis les Lois 2025/26, garder le ballon plus de 8 secondes donne un corner à l’adversaire ; l’arbitre compte les 5 dernières secondes main levée.', 'منذ قوانين 2025/26، الإمساك بالكرة أكثر من 8 ثوانٍ يمنح الخصم ضربة ركنية؛ ويعدّ الحكم الثواني الخمس الأخيرة بيده المرفوعة.'), 'IFAB Laws of the Game 2025/26, Law 12'),

(pg_temp.o('What is the fewest players a team can have for a match to start or go on?', 'Mikä on pienin pelaajamäärä, jolla ottelu voi alkaa tai jatkua?', 'Quel est le nombre minimum de joueurs pour qu’un match commence ou continue ?', 'ما أقل عدد من اللاعبين يمكن أن يبدأ به الفريق المباراة أو يستمر؟'),
 jsonb_build_array(pg_temp.o('7', '7', '7', '7'), pg_temp.o('6', '6', '6', '6'), pg_temp.o('8', '8', '8', '8'), pg_temp.o('9', '9', '9', '9')), 0,
 pg_temp.o('A match may not start or continue if either team has fewer than seven players.', 'Ottelu ei voi alkaa tai jatkua, jos joukkueella on alle seitsemän pelaajaa.', 'Un match ne peut pas commencer ou continuer si une équipe a moins de sept joueurs.', 'لا يمكن أن تبدأ المباراة أو تستمر إذا كان لدى أي فريق أقل من سبعة لاعبين.'), 'IFAB Laws of the Game, Law 3'),

(pg_temp.o('A player gets a second yellow card in the same match. What happens?', 'Pelaaja saa toisen keltaisen kortin samassa ottelussa. Mitä tapahtuu?', 'Un joueur reçoit un deuxième carton jaune dans le même match. Que se passe-t-il ?', 'يحصل لاعب على بطاقة صفراء ثانية في المباراة نفسها. ماذا يحدث؟'),
 jsonb_build_array(
   pg_temp.o('They are sent off (red card)', 'Hänet ajetaan ulos (punainen kortti)', 'Il est exclu (carton rouge)', 'يُطرد (بطاقة حمراء)'),
   pg_temp.o('They must sit out 10 minutes', 'Hänen on oltava 10 minuuttia vaihdossa', 'Il doit sortir 10 minutes', 'يجب أن يجلس 10 دقائق'),
   pg_temp.o('Nothing more, only a warning', 'Ei muuta, vain varoitus', 'Rien de plus, seulement un avertissement', 'لا شيء أكثر، مجرد إنذار'),
   pg_temp.o('The team must substitute them', 'Joukkueen on vaihdettava hänet', 'L’équipe doit le remplacer', 'يجب على الفريق استبداله')), 0,
 pg_temp.o('Two cautions in the same match mean a sending-off, and the team plays with one player less.', 'Kaksi varoitusta samassa ottelussa tarkoittaa ulosajoa, ja joukkue pelaa yhden pelaajan vajaalla.', 'Deux avertissements dans le même match valent une exclusion, et l’équipe joue à un de moins.', 'إنذاران في المباراة نفسها يعنيان الطرد، ويلعب الفريق بلاعب أقل.'), 'IFAB Laws of the Game, Law 12'),

(pg_temp.o('At a penalty kick, where must the goalkeeper be when the ball is kicked?', 'Missä maalivahdin on oltava, kun rangaistuspotku potkaistaan?', 'Lors d’un penalty, où doit être le gardien quand le ballon est frappé ?', 'عند تنفيذ ركلة الجزاء، أين يجب أن يكون الحارس لحظة ركل الكرة؟'),
 jsonb_build_array(
   pg_temp.o('With at least part of one foot on, or in line with, the goal line', 'Ainakin osa toisesta jalasta maaliviivalla tai sen tasalla', 'Au moins une partie d’un pied sur la ligne de but ou à son niveau', 'جزء من قدم واحدة على الأقل على خط المرمى أو بمحاذاته'),
   pg_temp.o('Anywhere in the goal area', 'Missä tahansa maalialueella', 'N’importe où dans la surface de but', 'في أي مكان داخل منطقة المرمى'),
   pg_temp.o('One step in front of the line', 'Askeleen viivan edessä', 'Un pas devant la ligne', 'خطوة واحدة أمام الخط'),
   pg_temp.o('Behind the goal line', 'Maaliviivan takana', 'Derrière la ligne de but', 'خلف خط المرمى')), 0,
 pg_temp.o('The goalkeeper may move along the line but must have at least part of one foot touching, or in line with, the goal line.', 'Maalivahti saa liikkua viivalla, mutta ainakin osan toisesta jalasta on kosketettava maaliviivaa tai oltava sen tasalla.', 'Le gardien peut se déplacer sur la ligne mais doit avoir au moins une partie d’un pied sur la ligne ou à son niveau.', 'يمكن للحارس التحرك على الخط لكن يجب أن يلمس جزء من قدم واحدة على الأقل خط المرمى أو يكون بمحاذاته.'), 'IFAB Laws of the Game, Law 14'),

(pg_temp.o('At a throw-in, what must the thrower do with their feet?', 'Mitä heittäjän on tehtävä jaloillaan rajaheitossa?', 'Sur une rentrée de touche, que doit faire le joueur avec ses pieds ?', 'عند رمية التماس، ماذا يجب أن يفعل الرامي بقدميه؟'),
 jsonb_build_array(
   pg_temp.o('Have part of each foot on the touchline or on the ground outside the field', 'Osan kummastakin jalasta on oltava sivurajalla tai maassa kentän ulkopuolella', 'Avoir une partie de chaque pied sur la ligne de touche ou au sol hors du terrain', 'أن يكون جزء من كل قدم على خط التماس أو على الأرض خارج الملعب'),
   pg_temp.o('Keep one foot in the air', 'Pitää toista jalkaa ilmassa', 'Garder un pied en l’air', 'أن يرفع قدمًا في الهواء'),
   pg_temp.o('Stand inside the field', 'Seistä kentän sisällä', 'Se tenir dans le terrain', 'أن يقف داخل الملعب'),
   pg_temp.o('Anything, feet do not matter', 'Mitä tahansa, jaloilla ei ole väliä', 'Peu importe, les pieds ne comptent pas', 'أي شيء، القدمان لا تهمّان')), 0,
 pg_temp.o('Both feet stay on the ground, with part of each foot on the touchline or outside it, and the ball is thrown with both hands from behind and over the head.', 'Molemmat jalat pysyvät maassa sivurajalla tai sen ulkopuolella, ja pallo heitetään molemmin käsin pään takaa ja yli.', 'Les deux pieds restent au sol, sur la ligne ou à l’extérieur, et le ballon est lancé à deux mains, de derrière et par-dessus la tête.', 'تبقى القدمان على الأرض على خط التماس أو خارجه، وتُرمى الكرة باليدين من خلف الرأس وفوقه.'), 'IFAB Laws of the Game, Law 15'),

(pg_temp.o('At a goal kick, when is the ball in play?', 'Milloin pallo on pelissä maalipotkussa?', 'Sur un coup de pied de but, quand le ballon est-il en jeu ?', 'في ضربة المرمى، متى تكون الكرة في اللعب؟'),
 jsonb_build_array(
   pg_temp.o('When it is kicked and clearly moves', 'Kun siihen potkaistaan ja se selvästi liikkuu', 'Dès qu’il est frappé et bouge nettement', 'عندما تُركل وتتحرك بوضوح'),
   pg_temp.o('Only when it leaves the penalty area', 'Vasta kun se on poistunut rangaistusalueelta', 'Seulement quand il sort de la surface de réparation', 'فقط عندما تخرج من منطقة الجزاء'),
   pg_temp.o('When it crosses the halfway line', 'Kun se ylittää keskiviivan', 'Quand il franchit la ligne médiane', 'عندما تعبر خط المنتصف'),
   pg_temp.o('When a second player touches it', 'Kun toinen pelaaja koskettaa sitä', 'Quand un deuxième joueur le touche', 'عندما يلمسها لاعب ثانٍ')), 0,
 pg_temp.o('The ball no longer has to leave the penalty area: it is in play as soon as it is kicked and clearly moves.', 'Pallon ei enää tarvitse poistua rangaistusalueelta: se on pelissä heti, kun siihen potkaistaan ja se selvästi liikkuu.', 'Le ballon n’a plus besoin de sortir de la surface : il est en jeu dès qu’il est frappé et bouge nettement.', 'لم يعد على الكرة أن تخرج من منطقة الجزاء: تكون في اللعب بمجرد ركلها وتحركها بوضوح.'), 'IFAB Laws of the Game, Law 16'),

(pg_temp.o('The defending team makes a wall of three or more players at a free kick. How close may attackers stand to it?', 'Puolustava joukkue tekee vapaapotkuun vähintään kolmen pelaajan muurin. Kuinka lähellä hyökkääjät saavat olla?', 'L’équipe qui défend forme un mur de trois joueurs ou plus sur un coup franc. À quelle distance les attaquants peuvent-ils se placer ?', 'يشكّل الفريق المدافع حائطًا من ثلاثة لاعبين أو أكثر في ضربة حرة. كم يمكن أن يقترب المهاجمون منه؟'),
 jsonb_build_array(
   pg_temp.o('No closer than 1 metre', 'Vähintään 1 metrin päässä', 'Pas à moins de 1 mètre', 'ليس أقرب من متر واحد'),
   pg_temp.o('Anywhere, even inside the wall', 'Missä tahansa, myös muurissa', 'N’importe où, même dans le mur', 'في أي مكان، حتى داخل الحائط'),
   pg_temp.o('At least 9.15 metres', 'Vähintään 9,15 metrin päässä', 'Au moins 9,15 mètres', '9.15 مترًا على الأقل'),
   pg_temp.o('At least 5 metres', 'Vähintään 5 metrin päässä', 'Au moins 5 mètres', '5 أمتار على الأقل')), 0,
 pg_temp.o('Attackers must stay at least 1 metre from a wall of three or more defenders until the ball is in play.', 'Hyökkääjien on pysyttävä vähintään metrin päässä vähintään kolmen puolustajan muurista, kunnes pallo on pelissä.', 'Les attaquants doivent rester à au moins 1 mètre d’un mur de trois défenseurs ou plus jusqu’à ce que le ballon soit en jeu.', 'يجب أن يبقى المهاجمون على بعد متر واحد على الأقل من حائط من ثلاثة مدافعين أو أكثر حتى تصبح الكرة في اللعب.'), 'IFAB Laws of the Game, Law 13'),

(pg_temp.o('The ball hits the referee and goes straight into the goal. What happens?', 'Pallo osuu tuomariin ja menee suoraan maaliin. Mitä tapahtuu?', 'Le ballon touche l’arbitre et entre directement dans le but. Que se passe-t-il ?', 'تصطدم الكرة بالحكم وتدخل المرمى مباشرة. ماذا يحدث؟'),
 jsonb_build_array(
   pg_temp.o('No goal: the game restarts with a dropped ball', 'Ei maalia: peli jatkuu pudotuspallolla', 'Pas de but : reprise par une balle à terre', 'لا هدف: يُستأنف اللعب بكرة ساقطة'),
   pg_temp.o('The goal counts', 'Maali hyväksytään', 'Le but est accordé', 'يُحتسب الهدف'),
   pg_temp.o('A goal kick', 'Maalipotku', 'Coup de pied de but', 'ضربة مرمى'),
   pg_temp.o('The kick is taken again', 'Potku uusitaan', 'On rejoue l’action', 'تُعاد الركلة')), 0,
 pg_temp.o('If the ball touches a match official and goes into the goal, the game restarts with a dropped ball.', 'Jos pallo koskettaa tuomaria ja menee maaliin, peli jatkuu pudotuspallolla.', 'Si le ballon touche un arbitre et entre dans le but, le jeu reprend par une balle à terre.', 'إذا لمست الكرة أحد الحكام ودخلت المرمى، يُستأنف اللعب بكرة ساقطة.'), 'IFAB Laws of the Game, Law 9'),

(pg_temp.o('An attacker scores right after the ball touched their arm by accident. Does the goal count?', 'Hyökkääjä tekee maalin heti, kun pallo osui vahingossa hänen käteensä. Hyväksytäänkö maali?', 'Un attaquant marque juste après que le ballon a touché son bras par accident. Le but compte-t-il ?', 'يسجّل مهاجم مباشرة بعد أن لمست الكرة ذراعه دون قصد. هل يُحتسب الهدف؟'),
 jsonb_build_array(
   pg_temp.o('No, the goal does not count', 'Ei, maalia ei hyväksytä', 'Non, le but n’est pas accordé', 'لا، لا يُحتسب الهدف'),
   pg_temp.o('Yes, because it was an accident', 'Kyllä, koska se oli vahinko', 'Oui, car c’était accidentel', 'نعم، لأنه كان دون قصد'),
   pg_temp.o('Yes, if the referee did not see it', 'Kyllä, jos tuomari ei nähnyt', 'Oui, si l’arbitre ne l’a pas vu', 'نعم، إذا لم يرَه الحكم'),
   pg_temp.o('Only if it was inside the goal area', 'Vain jos se tapahtui maalialueella', 'Seulement si c’était dans la surface de but', 'فقط إذا حدث داخل منطقة المرمى')), 0,
 pg_temp.o('A goal does not count if the scorer handled the ball, even by accident, immediately before scoring.', 'Maalia ei hyväksytä, jos maalintekijä koski palloa kädellä juuri ennen maalia, vaikka vahingossa.', 'Le but n’est pas accordé si le buteur a touché le ballon de la main, même accidentellement, juste avant de marquer.', 'لا يُحتسب الهدف إذا لمس المسجّل الكرة بيده، ولو دون قصد، مباشرة قبل التسجيل.'), 'IFAB Laws of the Game, Law 12'),

(pg_temp.o('Can a goal be scored directly from a kick-off?', 'Voiko maalin tehdä suoraan aloituspotkusta?', 'Peut-on marquer directement sur le coup d’envoi ?', 'هل يمكن تسجيل هدف مباشرة من ضربة البداية؟'),
 jsonb_build_array(
   pg_temp.o('Yes, against the opponents', 'Kyllä, vastustajan maaliin', 'Oui, contre l’adversaire', 'نعم، في مرمى الخصم'),
   pg_temp.o('No, never', 'Ei koskaan', 'Non, jamais', 'لا، أبدًا'),
   pg_temp.o('Only after the ball touches another player', 'Vasta kun pallo koskettaa toista pelaajaa', 'Seulement après une touche d’un autre joueur', 'فقط بعد أن تلمس الكرة لاعبًا آخر'),
   pg_temp.o('Only in the second half', 'Vain toisella puoliajalla', 'Seulement en deuxième mi-temps', 'فقط في الشوط الثاني')), 0,
 pg_temp.o('A goal may be scored directly against the opponents from the kick-off.', 'Aloituspotkusta voi tehdä maalin suoraan vastustajan maaliin.', 'Un but peut être marqué directement contre l’adversaire sur le coup d’envoi.', 'يمكن تسجيل هدف مباشرة في مرمى الخصم من ضربة البداية.'), 'IFAB Laws of the Game, Law 8');

-- ---------- club questions from live data ----------
-- Finnish men's leagues from the top: used to tell which league played was the highest.
-- Only for active members; names respect the website opt-out and the club's hide (0042).
create or replace function public.quiz_club_facts() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_latest int; v_scorers jsonb; v_leagues jsonb; v_founded int;
        ladder text[] := array['Veikkausliiga', 'Ykkösliiga', 'Ykkönen', 'Kakkonen', 'Kolmonen', 'Nelonen', 'Vitonen', 'Kutonen', 'Seiska'];
begin
  if not app.is_active() then raise exception 'members only' using errcode = '42501'; end if;
  select max(c.season) into v_latest from federation_competitions c join federation_player_stats s on s.competition_external_id = c.external_id
   where c.kind in ('league', 'cup') and c.show_publicly;
  select coalesce(jsonb_agg(jsonb_build_object('name', x.display_name, 'goals', x.goals) order by x.goals desc, x.display_name), '[]') into v_scorers from (
    select fp.display_name, sum(s.goals)::int as goals
    from federation_player_stats s
    join federation_competitions c on c.external_id = s.competition_external_id and c.kind in ('league', 'cup') and c.show_publicly and c.season >= v_latest - 1
    join federation_players fp on fp.external_id = s.player_external_id
    join federation_teams t on t.external_id = fp.team_external_id and t.is_club
    left join players p on p.id = fp.player_id
    where not fp.hidden and not coalesce(p.website_hidden, false)
    group by fp.external_id, fp.display_name having sum(s.goals) > 0
    order by goals desc, fp.display_name limit 6) x;
  select coalesce(jsonb_agg(distinct l.name), '[]') into v_leagues from (
    select n as name from federation_competitions c, unnest(ladder) n
    where c.kind = 'league' and c.category ilike '%' || n || '%') l;
  select (value ->> 'founded')::int into v_founded from site_settings where key = 'club';
  return jsonb_build_object('scorers', v_scorers, 'seasons', case when v_latest is null then null else jsonb_build_array(v_latest - 1, v_latest) end,
    'leagues', v_leagues, 'ladder', to_jsonb(ladder), 'founded', v_founded);
end $$;
revoke all on function public.quiz_club_facts() from public, anon;
grant execute on function public.quiz_club_facts() to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.37.0','feature','Football quiz',
  'Players find a 5-question football quiz in their area: the Laws of the Game, and questions about the club from live data (top scorer of the last two seasons, highest league, founding year).','2026-11-18')
on conflict (version) do nothing;


-- ===== 20260101000050_quiz_more.sql =====
-- 0050 More quiz questions and club facts (release 0.38.0).
-- 21 more Laws of the Game questions (IFAB Laws 2025/26), and quiz_club_facts() gains more live club data for questions:
-- the biggest win of the last two seasons (and other recent opponents), the current league position, the first season in
-- the Palloliitto league results, and the number of Finnish Cup seasons. Admins manage all questions in Admin → Quiz.
-- Lengths of the texts are now checked too (each language).

create or replace function app.quiz_texts_ok(p jsonb, p_max int) returns boolean language sql immutable as
$$ select p is null or (jsonb_typeof(p) = 'object' and not exists (select 1 from jsonb_each_text(p) e where e.key not in ('en', 'fi', 'fr', 'ar') or char_length(e.value) > p_max)) $$;
create or replace function app.quiz_options_ok(p jsonb) returns boolean language sql immutable as
$$ select not exists (select 1 from jsonb_array_elements(p) o where jsonb_typeof(o) <> 'object' or not (o ? 'en') or not app.quiz_texts_ok(o, 150)) $$;
alter table quiz_questions
  add constraint quiz_question_texts check (app.quiz_texts_ok(question, 300) and char_length(question ->> 'en') > 0),
  add constraint quiz_option_texts check (app.quiz_options_ok(options)),
  add constraint quiz_explain_texts check (app.quiz_texts_ok(explain, 600));

create or replace function pg_temp.o(en text, fi text, fr text, ar text) returns jsonb language sql immutable as
$$ select jsonb_build_object('en', en, 'fi', fi, 'fr', fr, 'ar', ar) $$;
create or replace function pg_temp.q(q jsonb, a jsonb, b jsonb, c jsonb, d jsonb, x jsonb, src text) returns void language sql as
$$ insert into quiz_questions (question, options, answer, explain, source) values (q, jsonb_build_array(a, b, c, d), 0, x, src) $$;

select pg_temp.q(pg_temp.o('A throw-in goes straight into the thrower''s own goal. What is the restart?', 'Rajaheitto menee suoraan heittäjän omaan maaliin. Miten peli jatkuu?', 'Une touche entre directement dans le but de l’équipe qui l’effectue. Quelle reprise ?', 'دخلت رمية تماس مباشرة مرمى فريق الرامي. كيف يُستأنف اللعب؟'),
  pg_temp.o('A corner kick to the opponents', 'Kulmapotku vastustajalle', 'Corner pour l’adversaire', 'ضربة ركنية للخصم'),
  pg_temp.o('An own goal', 'Oma maali', 'Un but contre son camp', 'هدف في المرمى الخاص'),
  pg_temp.o('A goal kick', 'Maalipotku', 'Coup de pied de but', 'ضربة مرمى'),
  pg_temp.o('The throw-in is retaken', 'Rajaheitto uusitaan', 'La touche est rejouée', 'تُعاد الرمية'),
  pg_temp.o('A goal cannot be scored directly from a throw-in: if it enters the thrower''s own goal, the opponents get a corner kick.', 'Rajaheitosta ei voi tehdä maalia suoraan: jos pallo menee heittäjän omaan maaliin, vastustaja saa kulmapotkun.', 'On ne peut pas marquer directement sur une touche : si le ballon entre dans le but de l’équipe qui l’effectue, l’adversaire obtient un corner.', 'لا يمكن التسجيل مباشرة من رمية تماس: إذا دخلت الكرة مرمى فريق الرامي يحصل الخصم على ضربة ركنية.'), 'IFAB Laws of the Game, Law 15');

select pg_temp.q(pg_temp.o('A throw-in goes straight into the opponents'' goal. What is the restart?', 'Rajaheitto menee suoraan vastustajan maaliin. Miten peli jatkuu?', 'Une touche entre directement dans le but adverse. Quelle reprise ?', 'دخلت رمية تماس مباشرة مرمى الخصم. كيف يُستأنف اللعب؟'),
  pg_temp.o('A goal kick', 'Maalipotku', 'Coup de pied de but', 'ضربة مرمى'),
  pg_temp.o('A goal', 'Maali', 'Un but', 'هدف'),
  pg_temp.o('A corner kick', 'Kulmapotku', 'Corner', 'ضربة ركنية'),
  pg_temp.o('A dropped ball', 'Pudotuspallo', 'Balle à terre', 'كرة ساقطة'),
  pg_temp.o('A throw-in cannot score directly: if it goes straight into the opponents'' goal, they restart with a goal kick.', 'Rajaheitosta ei voi tehdä maalia suoraan: jos pallo menee suoraan vastustajan maaliin, peli jatkuu maalipotkulla.', 'Une touche ne peut pas marquer directement : si le ballon entre directement dans le but adverse, la reprise est un coup de pied de but.', 'لا يمكن التسجيل مباشرة من رمية تماس: إذا دخلت الكرة مرمى الخصم مباشرة يُستأنف اللعب بضربة مرمى.'), 'IFAB Laws of the Game, Law 15');

select pg_temp.q(pg_temp.o('How far is the penalty mark from the goal line?', 'Kuinka kaukana rangaistuspotkupiste on maaliviivasta?', 'À quelle distance de la ligne de but se trouve le point de penalty ?', 'كم تبعد علامة الجزاء عن خط المرمى؟'),
  pg_temp.o('11 metres', '11 metriä', '11 mètres', '11 مترًا'), pg_temp.o('9.15 metres', '9,15 metriä', '9,15 mètres', '9.15 مترًا'),
  pg_temp.o('12 metres', '12 metriä', '12 mètres', '12 مترًا'), pg_temp.o('16.5 metres', '16,5 metriä', '16,5 mètres', '16.5 مترًا'),
  pg_temp.o('The penalty mark is 11 m (12 yards) from the middle of the goal line.', 'Rangaistuspotkupiste on 11 metrin päässä maaliviivan keskeltä.', 'Le point de penalty est à 11 m du milieu de la ligne de but.', 'علامة الجزاء على بعد 11 مترًا من منتصف خط المرمى.'), 'IFAB Laws of the Game, Law 1');

select pg_temp.q(pg_temp.o('How wide is a full-size goal, between the inside of the posts?', 'Kuinka leveä täysikokoinen maali on tolppien sisäreunojen välillä?', 'Quelle est la largeur d’un but de taille normale, entre l’intérieur des poteaux ?', 'ما عرض المرمى القانوني بين الجانبين الداخليين للقائمين؟'),
  pg_temp.o('7.32 metres', '7,32 metriä', '7,32 mètres', '7.32 أمتار'), pg_temp.o('7 metres', '7 metriä', '7 mètres', '7 أمتار'),
  pg_temp.o('8 metres', '8 metriä', '8 mètres', '8 أمتار'), pg_temp.o('6.5 metres', '6,5 metriä', '6,5 mètres', '6.5 أمتار'),
  pg_temp.o('The goal is 7.32 m wide and the crossbar 2.44 m high (8 yards by 8 feet).', 'Maali on 7,32 m leveä ja ylärima 2,44 m korkealla.', 'Le but mesure 7,32 m de large et la barre est à 2,44 m de haut.', 'عرض المرمى 7.32 م وارتفاع العارضة 2.44 م.'), 'IFAB Laws of the Game, Law 1');

select pg_temp.q(pg_temp.o('At a free kick (with no wall rule involved), how far must opponents be from the ball?', 'Kuinka kaukana vastustajien on oltava pallosta vapaapotkussa?', 'Sur un coup franc, à quelle distance du ballon les adversaires doivent-ils être ?', 'في الضربة الحرة، على أي بعد يجب أن يكون الخصوم من الكرة؟'),
  pg_temp.o('At least 9.15 metres', 'Vähintään 9,15 metriä', 'Au moins 9,15 mètres', '9.15 مترًا على الأقل'), pg_temp.o('At least 5 metres', 'Vähintään 5 metriä', 'Au moins 5 mètres', '5 أمتار على الأقل'),
  pg_temp.o('At least 11 metres', 'Vähintään 11 metriä', 'Au moins 11 mètres', '11 مترًا على الأقل'), pg_temp.o('There is no distance', 'Etäisyyttä ei ole', 'Aucune distance', 'لا توجد مسافة'),
  pg_temp.o('Opponents must be at least 9.15 m (10 yards) from the ball until it is in play, unless they are on their own goal line between the posts.', 'Vastustajien on oltava vähintään 9,15 m päässä, kunnes pallo on pelissä, ellei heitä ole omalla maaliviivalla tolppien välissä.', 'Les adversaires doivent être à au moins 9,15 m jusqu’à ce que le ballon soit en jeu, sauf s’ils sont sur leur ligne de but entre les poteaux.', 'يجب أن يبتعد الخصوم 9.15 مترًا على الأقل حتى تصبح الكرة في اللعب، إلا إذا كانوا على خط مرماهم بين القائمين.'), 'IFAB Laws of the Game, Law 13');

select pg_temp.q(pg_temp.o('An indirect free kick goes straight into the opponents'' goal without touching anyone. What happens?', 'Epäsuora vapaapotku menee suoraan vastustajan maaliin koskematta ketään. Mitä tapahtuu?', 'Un coup franc indirect entre directement dans le but adverse sans toucher personne. Que se passe-t-il ?', 'دخلت ضربة حرة غير مباشرة مرمى الخصم دون أن تلمس أحدًا. ماذا يحدث؟'),
  pg_temp.o('No goal: a goal kick', 'Ei maalia: maalipotku', 'Pas de but : coup de pied de but', 'لا هدف: ضربة مرمى'), pg_temp.o('The goal counts', 'Maali hyväksytään', 'Le but est accordé', 'يُحتسب الهدف'),
  pg_temp.o('A corner kick', 'Kulmapotku', 'Corner', 'ضربة ركنية'), pg_temp.o('The kick is retaken', 'Potku uusitaan', 'Le coup franc est rejoué', 'تُعاد الضربة'),
  pg_temp.o('From an indirect free kick a goal counts only if the ball touched another player first; straight into the opponents'' goal gives a goal kick.', 'Epäsuorasta vapaapotkusta maali hyväksytään vain, jos pallo koski ensin toista pelaajaa; suoraan vastustajan maaliin tarkoittaa maalipotkua.', 'Sur un coup franc indirect, le but compte seulement si le ballon a touché un autre joueur ; directement dans le but adverse, c’est un coup de pied de but.', 'من الضربة الحرة غير المباشرة يُحتسب الهدف فقط إذا لمست الكرة لاعبًا آخر أولًا؛ وإن دخلت مرمى الخصم مباشرة تُحتسب ضربة مرمى.'), 'IFAB Laws of the Game, Law 13');

select pg_temp.q(pg_temp.o('A foul is committed but the fouled team keeps a good attack going. What can the referee do?', 'Tehdään rike, mutta rikotun joukkueen hyökkäys jatkuu hyvänä. Mitä tuomari voi tehdä?', 'Une faute est commise mais l’équipe fautée garde une bonne attaque. Que peut faire l’arbitre ?', 'تُرتكب مخالفة لكن الفريق المتضرر يواصل هجمة جيدة. ماذا يمكن أن يفعل الحكم؟'),
  pg_temp.o('Play advantage and let the game go on', 'Antaa edun ja antaa pelin jatkua', 'Laisser l’avantage et laisser jouer', 'يطبّق قاعدة الأفضلية ويترك اللعب مستمرًا'), pg_temp.o('The referee must always stop play', 'Hänen on aina pysäytettävä peli', 'L’arbitre doit toujours arrêter le jeu', 'يجب أن يوقف اللعب دائمًا'),
  pg_temp.o('Give a penalty kick', 'Tuomita rangaistuspotkun', 'Accorder un penalty', 'يحتسب ركلة جزاء'), pg_temp.o('Restart with a dropped ball', 'Jatkaa pudotuspallolla', 'Reprendre par une balle à terre', 'يستأنف بكرة ساقطة'),
  pg_temp.o('The referee may let play continue when stopping it would not help the team that was fouled (advantage), and can still caution the player afterwards.', 'Tuomari voi antaa pelin jatkua, kun keskeytys ei hyödyttäisi rikottua joukkuetta (etu), ja voi silti varoittaa pelaajaa myöhemmin.', 'L’arbitre peut laisser jouer quand un arrêt ne profiterait pas à l’équipe fautée (avantage) et peut ensuite avertir le joueur.', 'يمكن للحكم ترك اللعب مستمرًا عندما لا يفيد إيقافه الفريق المتضرر (الأفضلية)، ويمكنه إنذار اللاعب لاحقًا.'), 'IFAB Laws of the Game, Law 5');

select pg_temp.q(pg_temp.o('A defender (not the goalkeeper) stops an obvious goal with a deliberate handball. What is the sanction?', 'Puolustaja (ei maalivahti) estää varman maalin tahallisella käsivirheellä. Mikä on rangaistus?', 'Un défenseur (pas le gardien) empêche un but évident par une main volontaire. Quelle sanction ?', 'مدافع (ليس الحارس) يمنع هدفًا محققًا بلمسة يد متعمدة. ما العقوبة؟'),
  pg_temp.o('Sending-off (red card)', 'Ulosajo (punainen kortti)', 'Exclusion (carton rouge)', 'الطرد (بطاقة حمراء)'), pg_temp.o('Caution (yellow card)', 'Varoitus (keltainen kortti)', 'Avertissement (carton jaune)', 'إنذار (بطاقة صفراء)'),
  pg_temp.o('No card, only the free kick', 'Ei korttia, vain vapaapotku', 'Pas de carton, seulement le coup franc', 'لا بطاقة، فقط الضربة الحرة'), pg_temp.o('A 10-minute time-out', '10 minuutin jäähy', 'Une exclusion de 10 minutes', 'إيقاف 10 دقائق'),
  pg_temp.o('Denying the opponents a goal or an obvious goal-scoring opportunity by a deliberate handball is a sending-off offence.', 'Maalin tai selvän maalintekotilanteen estäminen tahallisella käsivirheellä johtaa ulosajoon.', 'Empêcher un but ou une occasion de but manifeste par une main volontaire est passible d’exclusion.', 'منع هدف أو فرصة تسجيل محققة بلمسة يد متعمدة يستوجب الطرد.'), 'IFAB Laws of the Game, Law 12');

select pg_temp.q(pg_temp.o('The penalty taker plays the ball a second time before anyone else touches it. What happens?', 'Rangaistuspotkun laukoja koskettaa palloa toisen kerran ennen muita. Mitä tapahtuu?', 'Le tireur du penalty touche le ballon une deuxième fois avant tout autre joueur. Que se passe-t-il ?', 'يلمس منفذ ركلة الجزاء الكرة مرة ثانية قبل أن يلمسها أحد آخر. ماذا يحدث؟'),
  pg_temp.o('An indirect free kick to the defending team', 'Epäsuora vapaapotku puolustavalle joukkueelle', 'Coup franc indirect pour l’équipe qui défend', 'ضربة حرة غير مباشرة للفريق المدافع'), pg_temp.o('The goal counts if it goes in', 'Maali hyväksytään, jos pallo menee sisään', 'Le but compte s’il entre', 'يُحتسب الهدف إن دخلت الكرة'),
  pg_temp.o('The penalty is retaken', 'Rangaistuspotku uusitaan', 'Le penalty est retiré', 'تُعاد ركلة الجزاء'), pg_temp.o('A corner kick', 'Kulmapotku', 'Corner', 'ضربة ركنية'),
  pg_temp.o('The kicker may not touch the ball again until another player has: the defending team gets an indirect free kick.', 'Potkaisija ei saa koskea palloon uudelleen ennen kuin joku muu on koskenut: puolustava joukkue saa epäsuoran vapaapotkun.', 'Le tireur ne peut pas retoucher le ballon avant un autre joueur : coup franc indirect pour l’équipe qui défend.', 'لا يجوز للمنفذ لمس الكرة مجددًا قبل أن يلمسها لاعب آخر: ضربة حرة غير مباشرة للفريق المدافع.'), 'IFAB Laws of the Game, Law 14');

select pg_temp.q(pg_temp.o('A player leaves the field without the referee''s permission. What does the referee give?', 'Pelaaja poistuu kentältä ilman tuomarin lupaa. Mitä tuomari antaa?', 'Un joueur quitte le terrain sans la permission de l’arbitre. Que donne l’arbitre ?', 'يغادر لاعب الملعب دون إذن الحكم. ماذا يمنح الحكم؟'),
  pg_temp.o('A yellow card', 'Keltaisen kortin', 'Un carton jaune', 'بطاقة صفراء'), pg_temp.o('A red card', 'Punaisen kortin', 'Un carton rouge', 'بطاقة حمراء'),
  pg_temp.o('Nothing', 'Ei mitään', 'Rien', 'لا شيء'), pg_temp.o('A penalty to the other team', 'Rangaistuspotkun vastustajalle', 'Un penalty à l’adversaire', 'ركلة جزاء للفريق الآخر'),
  pg_temp.o('Deliberately leaving the field without the referee''s permission is a cautionable offence.', 'Kentältä poistuminen tarkoituksella ilman tuomarin lupaa on varoitukseen johtava rike.', 'Quitter délibérément le terrain sans la permission de l’arbitre est passible d’un avertissement.', 'مغادرة الملعب عمدًا دون إذن الحكم مخالفة تستوجب الإنذار.'), 'IFAB Laws of the Game, Law 12');

select pg_temp.q(pg_temp.o('A teammate deliberately kicks the ball back to the goalkeeper, who picks it up. What happens?', 'Joukkuetoveri potkaisee pallon tarkoituksella maalivahdille, joka ottaa sen käsiinsä. Mitä tapahtuu?', 'Un coéquipier passe volontairement le ballon au pied à son gardien, qui le prend à la main. Que se passe-t-il ?', 'يمرّر زميل الكرة عمدًا بقدمه إلى الحارس فيمسكها بيديه. ماذا يحدث؟'),
  pg_temp.o('An indirect free kick to the opponents', 'Epäsuora vapaapotku vastustajalle', 'Coup franc indirect pour l’adversaire', 'ضربة حرة غير مباشرة للخصم'), pg_temp.o('A penalty kick', 'Rangaistuspotku', 'Penalty', 'ركلة جزاء'),
  pg_temp.o('Nothing, it is allowed', 'Ei mitään, se on sallittua', 'Rien, c’est permis', 'لا شيء، هذا مسموح'), pg_temp.o('A direct free kick to the opponents', 'Suora vapaapotku vastustajalle', 'Coup franc direct pour l’adversaire', 'ضربة حرة مباشرة للخصم'),
  pg_temp.o('The goalkeeper may not handle a ball deliberately kicked to them by a teammate: indirect free kick to the opponents.', 'Maalivahti ei saa ottaa käsiinsä palloa, jonka joukkuetoveri on tarkoituksella potkaissut hänelle: epäsuora vapaapotku vastustajalle.', 'Le gardien ne peut pas prendre à la main un ballon que lui a volontairement passé un coéquipier au pied : coup franc indirect pour l’adversaire.', 'لا يجوز للحارس لمس كرة مرّرها له زميله عمدًا بالقدم: ضربة حرة غير مباشرة للخصم.'), 'IFAB Laws of the Game, Law 12');

select pg_temp.q(pg_temp.o('An attacker is level with the second-last defender when the ball is passed. Offside?', 'Hyökkääjä on samalla tasolla toiseksi viimeisen puolustajan kanssa, kun pallo syötetään. Paitsio?', 'Un attaquant est à la même hauteur que l’avant-dernier défenseur au moment de la passe. Hors-jeu ?', 'المهاجم على مستوى المدافع قبل الأخير لحظة التمرير. هل هو متسلل؟'),
  pg_temp.o('No, level is onside', 'Ei, samalla tasolla ei ole paitsiota', 'Non, à la même hauteur n’est pas hors-jeu', 'لا، المستوى نفسه ليس تسللًا'), pg_temp.o('Yes, always', 'Kyllä, aina', 'Oui, toujours', 'نعم، دائمًا'),
  pg_temp.o('Only in the penalty area', 'Vain rangaistusalueella', 'Seulement dans la surface', 'فقط في منطقة الجزاء'), pg_temp.o('The referee decides freely', 'Tuomari päättää vapaasti', 'L’arbitre décide librement', 'الحكم يقرر بحرية'),
  pg_temp.o('A player level with the second-last opponent (or the last two) is not in an offside position.', 'Pelaaja, joka on samalla tasolla toiseksi viimeisen vastustajan kanssa, ei ole paitsioasemassa.', 'Un joueur à la même hauteur que l’avant-dernier adversaire n’est pas en position de hors-jeu.', 'اللاعب الذي يكون على مستوى الخصم قبل الأخير ليس في موقف تسلل.'), 'IFAB Laws of the Game, Law 11');

select pg_temp.q(pg_temp.o('A player is in their own half when the ball is played to them. Can they be offside?', 'Pelaaja on omalla kenttäpuoliskollaan, kun hänelle syötetään. Voiko hän olla paitsiossa?', 'Un joueur est dans sa propre moitié quand on lui passe le ballon. Peut-il être hors-jeu ?', 'اللاعب في نصف ملعبه لحظة تمرير الكرة إليه. هل يمكن أن يكون متسللًا؟'),
  pg_temp.o('No', 'Ei', 'Non', 'لا'), pg_temp.o('Yes', 'Kyllä', 'Oui', 'نعم'),
  pg_temp.o('Only if behind all defenders', 'Vain jos hän on kaikkien puolustajien takana', 'Seulement derrière tous les défenseurs', 'فقط إذا كان خلف كل المدافعين'), pg_temp.o('Only from a free kick', 'Vain vapaapotkusta', 'Seulement sur coup franc', 'فقط من ضربة حرة'),
  pg_temp.o('A player cannot be in an offside position in their own half of the field.', 'Pelaaja ei voi olla paitsioasemassa omalla kenttäpuoliskollaan.', 'Un joueur ne peut pas être en position de hors-jeu dans sa propre moitié de terrain.', 'لا يمكن أن يكون اللاعب في موقف تسلل في نصف ملعبه.'), 'IFAB Laws of the Game, Law 11');

select pg_temp.q(pg_temp.o('Can a goal be scored directly from a corner kick?', 'Voiko kulmapotkusta tehdä maalin suoraan?', 'Peut-on marquer directement sur corner ?', 'هل يمكن تسجيل هدف مباشرة من ضربة ركنية؟'),
  pg_temp.o('Yes, against the opponents', 'Kyllä, vastustajan maaliin', 'Oui, contre l’adversaire', 'نعم، في مرمى الخصم'), pg_temp.o('No, never', 'Ei koskaan', 'Non, jamais', 'لا، أبدًا'),
  pg_temp.o('Only with a header', 'Vain puskulla', 'Seulement de la tête', 'فقط بضربة رأس'), pg_temp.o('Only if the goalkeeper touches it', 'Vain jos maalivahti koskettaa', 'Seulement si le gardien le touche', 'فقط إذا لمسها الحارس'),
  pg_temp.o('A goal may be scored directly from a corner kick, but only against the opponents.', 'Kulmapotkusta voi tehdä maalin suoraan, mutta vain vastustajan maaliin.', 'On peut marquer directement sur corner, mais seulement contre l’adversaire.', 'يمكن التسجيل مباشرة من ضربة ركنية، لكن في مرمى الخصم فقط.'), 'IFAB Laws of the Game, Law 17');

select pg_temp.q(pg_temp.o('A goal kick goes straight into the kicker''s own goal. What is the restart?', 'Maalipotku menee suoraan potkaisijan omaan maaliin. Miten peli jatkuu?', 'Un coup de pied de but entre directement dans le but de l’équipe qui le joue. Quelle reprise ?', 'دخلت ضربة المرمى مباشرة مرمى الفريق المنفذ. كيف يُستأنف اللعب؟'),
  pg_temp.o('A corner kick to the opponents', 'Kulmapotku vastustajalle', 'Corner pour l’adversaire', 'ضربة ركنية للخصم'), pg_temp.o('An own goal', 'Oma maali', 'But contre son camp', 'هدف في المرمى الخاص'),
  pg_temp.o('The goal kick is retaken', 'Maalipotku uusitaan', 'Le coup de pied de but est rejoué', 'تُعاد ضربة المرمى'), pg_temp.o('A penalty kick', 'Rangaistuspotku', 'Penalty', 'ركلة جزاء'),
  pg_temp.o('No own goal can be scored directly from a goal kick: if it enters the kicker''s goal, the opponents get a corner kick.', 'Maalipotkusta ei voi syntyä omaa maalia suoraan: jos pallo menee potkaisijan maaliin, vastustaja saa kulmapotkun.', 'Pas de but contre son camp directement sur un coup de pied de but : l’adversaire obtient un corner.', 'لا يُحتسب هدف في المرمى الخاص مباشرة من ضربة المرمى: يحصل الخصم على ضربة ركنية.'), 'IFAB Laws of the Game, Law 16');

select pg_temp.q(pg_temp.o('Play is stopped for an injury while the ball is in the defending team''s penalty area. Who gets the dropped ball?', 'Peli keskeytetään loukkaantumisen takia pallon ollessa puolustavan joukkueen rangaistusalueella. Kuka saa pudotuspallon?', 'Le jeu est arrêté pour une blessure alors que le ballon est dans la surface de l’équipe qui défend. Qui reçoit la balle à terre ?', 'أوقف اللعب لإصابة والكرة داخل منطقة جزاء الفريق المدافع. لمن تكون الكرة الساقطة؟'),
  pg_temp.o('The defending goalkeeper', 'Puolustavan joukkueen maalivahti', 'Le gardien de l’équipe qui défend', 'حارس الفريق المدافع'), pg_temp.o('The attacking team', 'Hyökkäävä joukkue', 'L’équipe qui attaque', 'الفريق المهاجم'),
  pg_temp.o('Both teams contest it', 'Molemmat joukkueet kamppailevat', 'Les deux équipes se la disputent', 'يتنافس عليها الفريقان'), pg_temp.o('The team that is behind in the score', 'Tappiolla oleva joukkue', 'L’équipe menée au score', 'الفريق المتأخر في النتيجة'),
  pg_temp.o('In the penalty area the ball is dropped for the defending goalkeeper; elsewhere for the team that last touched it.', 'Rangaistusalueella pallo pudotetaan puolustavan joukkueen maalivahdille, muualla joukkueelle, joka viimeksi kosketti palloa.', 'Dans la surface, la balle est donnée au gardien qui défend ; ailleurs, à l’équipe qui l’a touchée en dernier.', 'داخل منطقة الجزاء تُسقط الكرة لحارس الفريق المدافع، وفي غيرها للفريق الذي لمسها آخر مرة.'), 'IFAB Laws of the Game, Law 8');

select pg_temp.q(pg_temp.o('A player spits at an opponent. What is the sanction?', 'Pelaaja sylkee vastustajaa kohti. Mikä on rangaistus?', 'Un joueur crache sur un adversaire. Quelle sanction ?', 'لاعب يبصق على خصم. ما العقوبة؟'),
  pg_temp.o('Sending-off (red card)', 'Ulosajo (punainen kortti)', 'Exclusion (carton rouge)', 'الطرد (بطاقة حمراء)'), pg_temp.o('Caution (yellow card)', 'Varoitus (keltainen kortti)', 'Avertissement (carton jaune)', 'إنذار (بطاقة صفراء)'),
  pg_temp.o('Only a free kick', 'Vain vapaapotku', 'Seulement un coup franc', 'ضربة حرة فقط'), pg_temp.o('A warning without a card', 'Huomautus ilman korttia', 'Un rappel à l’ordre sans carton', 'تنبيه دون بطاقة'),
  pg_temp.o('Spitting at someone is a sending-off offence.', 'Sylkeminen toista kohti johtaa ulosajoon.', 'Cracher sur quelqu’un est passible d’exclusion.', 'البصق على أي شخص مخالفة تستوجب الطرد.'), 'IFAB Laws of the Game, Law 12');

select pg_temp.q(pg_temp.o('Who decides how much time is added at the end of each half?', 'Kuka päättää, kuinka paljon lisäaikaa kummankin puoliajan lopussa pelataan?', 'Qui décide du temps additionnel à la fin de chaque mi-temps ?', 'من يقرر الوقت المضاف في نهاية كل شوط؟'),
  pg_temp.o('The referee', 'Päätuomari', 'L’arbitre', 'الحكم'), pg_temp.o('The two captains', 'Joukkueiden kapteenit', 'Les deux capitaines', 'القائدان'),
  pg_temp.o('The home team', 'Kotijoukkue', 'L’équipe qui reçoit', 'الفريق المضيف'), pg_temp.o('It is always 3 minutes', 'Se on aina 3 minuuttia', 'C’est toujours 3 minutes', 'دائمًا 3 دقائق'),
  pg_temp.o('The referee adds time for substitutions, injuries, time-wasting and other stoppages.', 'Tuomari lisää aikaa vaihdoista, loukkaantumisista, ajan haaskaamisesta ja muista keskeytyksistä.', 'L’arbitre ajoute le temps perdu : remplacements, blessures, gain de temps et autres arrêts.', 'يضيف الحكم الوقت الضائع بسبب التبديلات والإصابات وإضاعة الوقت وغيرها.'), 'IFAB Laws of the Game, Law 7');

select pg_temp.q(pg_temp.o('A player takes off their shirt to celebrate a goal. What happens?', 'Pelaaja riisuu paitansa maalia juhliessaan. Mitä tapahtuu?', 'Un joueur enlève son maillot pour célébrer un but. Que se passe-t-il ?', 'يخلع لاعب قميصه احتفالًا بهدف. ماذا يحدث؟'),
  pg_temp.o('A yellow card', 'Keltainen kortti', 'Un carton jaune', 'بطاقة صفراء'), pg_temp.o('The goal is cancelled', 'Maali hylätään', 'Le but est annulé', 'يُلغى الهدف'),
  pg_temp.o('A red card', 'Punainen kortti', 'Un carton rouge', 'بطاقة حمراء'), pg_temp.o('Nothing', 'Ei mitään', 'Rien', 'لا شيء'),
  pg_temp.o('Removing the shirt (or covering the head with it) when celebrating is a cautionable offence; the goal still counts.', 'Paidan riisuminen tai pään peittäminen sillä juhlinnassa johtaa varoitukseen; maali kuitenkin hyväksytään.', 'Enlever son maillot (ou s’en couvrir la tête) pour célébrer vaut un avertissement ; le but reste valable.', 'خلع القميص (أو تغطية الرأس به) عند الاحتفال يستوجب الإنذار؛ ويبقى الهدف صحيحًا.'), 'IFAB Laws of the Game, Law 12');

select pg_temp.q(pg_temp.o('How long is a normal adult match?', 'Kuinka pitkä on tavallinen aikuisten ottelu?', 'Quelle est la durée d’un match normal chez les adultes ?', 'كم مدة المباراة العادية للكبار؟'),
  pg_temp.o('Two halves of 45 minutes', 'Kaksi 45 minuutin puoliaikaa', 'Deux mi-temps de 45 minutes', 'شوطان مدة كل منهما 45 دقيقة'), pg_temp.o('Two halves of 40 minutes', 'Kaksi 40 minuutin puoliaikaa', 'Deux mi-temps de 40 minutes', 'شوطان مدة كل منهما 40 دقيقة'),
  pg_temp.o('Four quarters of 20 minutes', 'Neljä 20 minuutin neljännestä', 'Quatre quarts-temps de 20 minutes', 'أربعة أرباع مدة كل منها 20 دقيقة'), pg_temp.o('Two halves of 50 minutes', 'Kaksi 50 minuutin puoliaikaa', 'Deux mi-temps de 50 minutes', 'شوطان مدة كل منهما 50 دقيقة'),
  pg_temp.o('A match lasts two equal halves of 45 minutes, unless the competition rules agree otherwise.', 'Ottelu kestää kaksi 45 minuutin puoliaikaa, ellei kilpailumääräyksissä sovita toisin.', 'Un match dure deux mi-temps de 45 minutes, sauf accord différent du règlement de la compétition.', 'تتكون المباراة من شوطين متساويين مدة كل منهما 45 دقيقة، ما لم تنص لوائح المسابقة على غير ذلك.'), 'IFAB Laws of the Game, Law 7');

select pg_temp.q(pg_temp.o('What is the circumference of a size-5 match ball?', 'Mikä on koon 5 ottelupallon ympärysmitta?', 'Quelle est la circonférence d’un ballon de taille 5 ?', 'ما محيط كرة المباراة مقاس 5؟'),
  pg_temp.o('68–70 cm', '68–70 cm', '68–70 cm', '68–70 سم'), pg_temp.o('60–62 cm', '60–62 cm', '60–62 cm', '60–62 سم'),
  pg_temp.o('74–76 cm', '74–76 cm', '74–76 cm', '74–76 سم'), pg_temp.o('80–82 cm', '80–82 cm', '80–82 cm', '80–82 سم'),
  pg_temp.o('The ball is spherical, with a circumference of 68–70 cm (27–28 in).', 'Pallo on pyöreä ja sen ympärysmitta on 68–70 cm.', 'Le ballon est sphérique, d’une circonférence de 68 à 70 cm.', 'الكرة كروية ومحيطها بين 68 و70 سم.'), 'IFAB Laws of the Game, Law 2');

-- ---------- more club facts ----------
create or replace function public.quiz_club_facts() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_latest int; v_scorers jsonb; v_leagues jsonb; v_founded int; v_win jsonb; v_opponents jsonb; v_position jsonb; v_first int; v_cups int;
        ladder text[] := array['Veikkausliiga', 'Ykkösliiga', 'Ykkönen', 'Kakkonen', 'Kolmonen', 'Nelonen', 'Vitonen', 'Kutonen', 'Seiska'];
begin
  if not app.is_active() then raise exception 'members only' using errcode = '42501'; end if;
  select max(c.season) into v_latest from federation_competitions c join federation_player_stats s on s.competition_external_id = c.external_id
   where c.kind in ('league', 'cup') and c.show_publicly;
  select coalesce(jsonb_agg(jsonb_build_object('name', x.display_name, 'goals', x.goals) order by x.goals desc, x.display_name), '[]') into v_scorers from (
    select fp.display_name, sum(s.goals)::int as goals
    from federation_player_stats s
    join federation_competitions c on c.external_id = s.competition_external_id and c.kind in ('league', 'cup') and c.show_publicly and c.season >= v_latest - 1
    join federation_players fp on fp.external_id = s.player_external_id
    join federation_teams t on t.external_id = fp.team_external_id and t.is_club
    left join players p on p.id = fp.player_id
    where not fp.hidden and not coalesce(p.website_hidden, false)
    group by fp.external_id, fp.display_name having sum(s.goals) > 0
    order by goals desc, fp.display_name limit 6) x;
  select coalesce(jsonb_agg(distinct l.name), '[]') into v_leagues from (
    select n as name from federation_competitions c, unnest(ladder) n where c.kind = 'league' and c.category ilike '%' || n || '%') l;
  select (value ->> 'founded')::int into v_founded from site_settings where key = 'club';
  -- the club's games of the last two seasons (league and cup), from the club's side
  with g as (
    select c.season, case when h.is_club then m.away_name else m.home_name end as opponent,
           case when h.is_club then m.home_goals else m.away_goals end as gf, case when h.is_club then m.away_goals else m.home_goals end as ga, m.kickoff_at
    from federation_matches m
    join federation_competitions c on c.external_id = m.competition_external_id and c.kind in ('league', 'cup') and c.show_publicly
    left join federation_teams h on h.external_id = m.home_external_id
    left join federation_teams a on a.external_id = m.away_external_id
    where m.status = 'played' and m.home_goals is not null and (coalesce(h.is_club, false) <> coalesce(a.is_club, false))
      and c.season >= (select max(season) from federation_competitions where kind = 'league') - 1
  )
  select (select to_jsonb(w) from (select opponent, gf, ga, season from g where gf > ga order by gf - ga desc, gf desc, kickoff_at desc limit 1) w
           where (select count(*) from g where gf - ga = w.gf - w.ga and gf = w.gf) = 1),
         (select coalesce(jsonb_agg(distinct opponent), '[]') from g)
    into v_win, v_opponents;
  select to_jsonb(s) into v_position from (
    select st.position, (select count(*) from public_standings x where x.competition_external_id = st.competition_external_id) as teams, st.category, st.season, st.played
    from public_standings st where st.is_club and st.played > 0 order by st.season desc, st.played desc limit 1) s;
  select min(c.season) into v_first from federation_competitions c where c.kind = 'league' and c.season is not null;
  select count(distinct c.season) into v_cups from federation_competitions c where c.kind = 'cup' and c.season is not null;
  return jsonb_build_object('scorers', v_scorers, 'seasons', case when v_latest is null then null else jsonb_build_array(v_latest - 1, v_latest) end,
    'leagues', v_leagues, 'ladder', to_jsonb(ladder), 'founded', v_founded, 'biggest_win', v_win, 'opponents', v_opponents,
    'position', v_position, 'first_league_season', v_first, 'cup_seasons', v_cups);
end $$;
revoke all on function public.quiz_club_facts() from public, anon;
grant execute on function public.quiz_club_facts() to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.38.0','feature','More quiz questions, quiz editor',
  'Admins manage the quiz in Admin → Quiz (add, edit and translate questions, switch them on or off). 21 more Laws of the Game questions and new club questions: biggest win, league position, first Palloliitto season, Finnish Cup seasons.','2026-11-18')
on conflict (version) do nothing;


-- ===== 20260101000051_signin_log.sql =====
-- 0051 Sign-in log (release 0.39.0).
-- Admin → Sign-in help gets a summary of sign-ins: successes, failures and why (wrong password, email not confirmed,
-- waiting for approval, suspended, overdue fees, too many attempts), password-reset requests and whether Supabase could
-- send the email. The app's sign-in pages report each attempt through public.log_signin(); nobody can read the log
-- except admins. Kept 90 days. Passwords are never logged.
--  * A success can only be logged for one's own account (the signed-in user).
--  * Failures and reset requests come from the public sign-in pages, so they are accepted without a session; each email
--    address is capped at 20 entries per 10 minutes and the whole log at 300 per minute, so a flood cannot fill it.
--  * The email typed is kept, so an admin also sees attempts with a mistyped address (no account).

create table signin_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  profile_id uuid references profiles(id) on delete cascade,
  email text check (char_length(email) <= 254),
  method text not null check (method in ('password', 'google', 'facebook', 'link', 'reset')),
  outcome text not null check (outcome in ('ok', 'wrong_password', 'not_confirmed', 'pending', 'suspended', 'fee_blocked',
                                           'rate_limited', 'error', 'reset_sent', 'reset_failed', 'reset_rate_limited')),
  detail text check (char_length(detail) <= 120),
  check (profile_id is not null or email is not null)
);
create index on signin_events (created_at desc);
create index on signin_events (profile_id, created_at desc);
create index on signin_events (email, created_at desc);
alter table signin_events enable row level security;
create policy admin_read on signin_events for select to authenticated using (app.is_admin());
revoke all on signin_events from anon;

create or replace function public.log_signin(p_email text, p_method text, p_outcome text, p_detail text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := nullif(lower(trim(p_email)), ''); v_profile uuid;
begin
  if p_method not in ('password', 'google', 'facebook', 'link', 'reset') then raise exception 'unknown method' using errcode = '22023'; end if;
  if p_outcome = 'ok' then
    -- only for oneself
    if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
    select id, email into v_profile, v_email from profiles where id = auth.uid();
    if v_profile is null then return; end if;
  else
    if p_outcome not in ('wrong_password', 'not_confirmed', 'pending', 'suspended', 'fee_blocked', 'rate_limited', 'error',
                         'reset_sent', 'reset_failed', 'reset_rate_limited') then raise exception 'unknown outcome' using errcode = '22023'; end if;
    if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+$' then raise exception 'email needed' using errcode = '22023'; end if;
    if (select count(*) from signin_events where email = v_email and created_at > now() - interval '10 minutes') >= 20
       or (select count(*) from signin_events where created_at > now() - interval '1 minute') >= 300 then return; end if;
    select id into v_profile from profiles where lower(email) = v_email limit 1;
  end if;
  insert into signin_events (profile_id, email, method, outcome, detail)
  values (v_profile, v_email, p_method, p_outcome, left(nullif(trim(p_detail), ''), 120));
end $$;
revoke all on function public.log_signin(text, text, text, text) from public;
grant execute on function public.log_signin(text, text, text, text) to anon, authenticated;

-- What Supabase Auth itself recorded for a member (sign-ins, reset and confirmation emails requested, password changes),
-- when the project keeps its Auth audit log in the database. Admins only; an empty list when the log is not available.
create or replace function public.signin_auth_log(p_profile uuid, p_limit int default 20)
returns table (created_at timestamptz, action text, provider text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if to_regclass('auth.audit_log_entries') is null then return; end if;
  begin
  return query execute
    'select e.created_at, e.payload ->> ''action'', e.payload -> ''traits'' ->> ''provider''
       from auth.audit_log_entries e
      where e.payload ->> ''actor_id'' = $1::text
        and e.payload ->> ''action'' in (''login'', ''user_recovery_requested'', ''user_confirmation_requested'', ''user_signedup'',
                                         ''user_updated_password'', ''user_modified'', ''logout'', ''user_reauthenticate_requested'')
      order by e.created_at desc limit $2'
    using p_profile, least(greatest(p_limit, 1), 100);
  exception when insufficient_privilege or undefined_table then return;  -- the Auth log is not readable here
  end;
end $$;
revoke all on function public.signin_auth_log(uuid, int) from public, anon;
grant execute on function public.signin_auth_log(uuid, int) to authenticated;

-- 90 days, then removed
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('afrofoot-signin-log-cleanup', '23 3 * * *', $c$delete from public.signin_events where created_at < now() - interval '90 days'$c$);
  end if;
exception when others then raise notice 'Could not schedule the sign-in log clean-up (%). Enable pg_cron under Database > Extensions and run this file again.', sqlerrm;
end $$;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.39.0','feature','Sign-in log',
  'Admin → Sign-in help shows a summary of sign-ins over 1–90 days: successes, failures and their reasons, password-reset emails and whether they could be sent, members having trouble, and each member''s recent attempts. Kept 90 days.','2026-11-18')
on conflict (version) do nothing;


-- ===== 20260101000052_contract_signatory.sql =====
-- 0052 Who signs contracts for the club (release 0.41.0).
-- Admin → Contracts → settings get the club's signatory: a name and a title (e.g. "General Manager"), kept in
-- site_settings 'contracts' as signatory_name / signatory_title. When an admin countersigns, the contract records that
-- name and title as the club's signature (the admin who clicked stays in club_signed_by and the audit log). Without a
-- signatory the admin's own name is used, as before. Signatures stay frozen once made.

alter table player_contracts add column club_signed_title text check (char_length(club_signed_title) between 1 and 80);

-- Runs after app.guard_contract (triggers on the same event fire in name order: guard, guard_signatory).
create function app.contract_signatory() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_title text;
begin
  if tg_op = 'INSERT' then new.club_signed_title := null; return new; end if;
  if new.status = 'active' and old.status is distinct from 'active' then
    select nullif(trim(value ->> 'signatory_name'), ''), nullif(trim(value ->> 'signatory_title'), '')
      into v_name, v_title from site_settings where key = 'contracts';
    if char_length(v_name) between 2 and 160 then new.club_signed_name := v_name; end if;
    new.club_signed_title := left(v_title, 80);
  elsif new.club_signed_title is distinct from old.club_signed_title then
    raise exception 'Signatures cannot be edited' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger guard_signatory before insert or update on player_contracts for each row execute function app.contract_signatory();

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.41.0','feature','Club signatory and contract footer',
  'Admin → Contracts → settings: the name and title of the person who signs contracts for the club, used when an admin countersigns. Contract PDFs have a footer with the club''s details on every page.','2026-11-18')
on conflict (version) do nothing;


-- ===== 20260101000053_past_due_lines.sql =====
-- 0053 Past-due amounts on invoices (release 0.42.0).
-- Admin → Invoices: on an unpaid invoice an admin adds a line for an amount still owed from an earlier season (typed in
-- by hand, e.g. "Unpaid balance, season 2025 – EUR 60"). The invoice total grows by that amount; the line can be removed
-- again while the invoice is unpaid. Both go through security-definer functions so the line and the total always change
-- together, and both are in the audit log (payments and payment_lines are audited).

alter table payment_lines add column kind text not null default 'fee' check (kind in ('fee', 'past_due'));

create function public.add_past_due(p_payment uuid, p_description text, p_amount_cents int) returns uuid
language plpgsql security definer set search_path = public as $$
declare p payments; v_desc text := trim(p_description); v_pos int; v_line uuid;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 500000 then raise exception 'amount between EUR 0.01 and 5000' using errcode = '22023'; end if;
  if char_length(v_desc) not between 3 and 200 then raise exception 'description 3–200 characters' using errcode = '22023'; end if;
  select * into p from payments where id = p_payment for update;
  if p.id is null or p.invoice_number is null then raise exception 'not an invoice' using errcode = '22023'; end if;
  if p.status not in ('pending', 'failed') then raise exception 'only unpaid invoices can change' using errcode = 'check_violation'; end if;
  -- an invoice from before invoice lines existed gets its original amount as a first line, so the PDF keeps showing it
  if not exists (select 1 from payment_lines where payment_id = p.id) then
    insert into payment_lines (payment_id, position, description, line_date, unit_price_cents) values (p.id, 1, 'Membership fees', p.due_on, p.amount_cents);
  end if;
  select coalesce(max(position), 0) + 1 into v_pos from payment_lines where payment_id = p.id;
  if v_pos > 100 then raise exception 'too many lines' using errcode = 'check_violation'; end if;
  insert into payment_lines (payment_id, position, description, line_date, unit_price_cents, kind)
  values (p.id, v_pos, v_desc, null, p_amount_cents, 'past_due') returning id into v_line;
  update payments set amount_cents = amount_cents + p_amount_cents, updated_at = now() where id = p.id;
  return v_line;
end $$;
revoke all on function public.add_past_due(uuid, text, int) from public, anon;
grant execute on function public.add_past_due(uuid, text, int) to authenticated;

create function public.remove_past_due(p_line uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l payment_lines; p payments;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into l from payment_lines where id = p_line;
  if l.id is null or l.kind <> 'past_due' then raise exception 'not a past-due line' using errcode = '22023'; end if;
  select * into p from payments where id = l.payment_id for update;
  if p.status not in ('pending', 'failed') then raise exception 'only unpaid invoices can change' using errcode = 'check_violation'; end if;
  delete from payment_lines where id = l.id;
  update payments set amount_cents = amount_cents - l.unit_price_cents, updated_at = now() where id = p.id;
end $$;
revoke all on function public.remove_past_due(uuid) from public, anon;
grant execute on function public.remove_past_due(uuid) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.42.0','feature','Past-due amounts on invoices',
  'Admin → Invoices: add an amount still owed from an earlier season to an unpaid invoice, as its own line with your own description. The total, the PDF and the bank barcode follow; the line can be removed while the invoice is unpaid.','2026-11-18')
on conflict (version) do nothing;


-- ===== 20260101000054_finance.sql =====
-- 0054 Finance: player balances, income projection, season budget and expenses (release 0.43.0).
-- Admin → Finance groups everything about money: an overview for a season (income projected from player invoices,
-- budgeted and actual costs per category, the expected result), each player's balance, the invoices, and the expenses.
-- An invoice belongs to a season through its membership; an invoice without a membership by its due date.
-- Cost categories: team fees, field booking, kits, league fees, licences, other (the unused 0005 categories are mapped).

-- ===== Cost categories =====
alter table expenses drop constraint if exists expenses_category_check;
update expenses set category = case category when 'equipment' then 'kits' when 'pitch' then 'field_booking' when 'league_fees' then 'league_fees' else 'other' end;
alter table expenses
  add constraint expenses_category_check check (category in ('team_fees', 'field_booking', 'kits', 'league_fees', 'licences', 'other')),
  add constraint expenses_amount_max check (amount_cents <= 10000000),
  add constraint expenses_description_len check (description is null or char_length(description) between 1 and 200);
create index if not exists expenses_season_idx on expenses (season_id, incurred_on);

-- ===== Budget: one planned amount per season and category =====
create table season_budgets (
  season_id uuid not null references seasons(id) on delete cascade,
  category text not null check (category in ('team_fees', 'field_booking', 'kits', 'league_fees', 'licences', 'other')),
  amount_cents int not null check (amount_cents between 0 and 10000000),
  note text check (note is null or char_length(note) between 1 and 200),
  updated_at timestamptz not null default now(),
  primary key (season_id, category)
);
alter table season_budgets enable row level security;
create policy admin_all on season_budgets for all to authenticated using (app.is_admin()) with check (app.is_admin());
revoke all on season_budgets from anon;
create trigger audit after insert or update or delete on season_budgets for each row execute function app.audit();

-- ===== Which season an invoice belongs to =====
create function app.payment_in_season(p payments, s seasons) returns boolean language sql stable as $$
  select case when p.membership_id is not null then exists (select 1 from memberships m where m.id = p.membership_id and m.season_id = s.id)
              else coalesce(p.due_on, p.created_at::date) between s.starts_on and s.ends_on end
$$;

-- ===== Each player's balance (admins) =====
-- invoiced / paid / open / overdue for the season, plus everything still unpaid from any season (balance).
create function public.finance_balances(p_season uuid) returns table (
  player_id uuid, first_name text, last_name text, invoiced_cents bigint, paid_cents bigint, open_cents bigint, overdue_cents bigint,
  balance_cents bigint, oldest_due date, last_paid_at timestamptz, invoices int)
language plpgsql stable security definer set search_path = public as $$
declare s seasons; v_today date := (now() at time zone 'Europe/Helsinki')::date;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into s from seasons where id = p_season;
  if s.id is null then raise exception 'unknown season' using errcode = '22023'; end if;
  return query
  with mine as (
    select p.*, app.payment_in_season(p, s) as in_season from payments p where p.status in ('pending', 'failed', 'paid')
  )
  select pl.id, pl.first_name, pl.last_name,
         coalesce(sum(m.amount_cents) filter (where m.in_season), 0)::bigint,
         coalesce(sum(m.amount_cents) filter (where m.in_season and m.status = 'paid'), 0)::bigint,
         coalesce(sum(m.amount_cents) filter (where m.in_season and m.status <> 'paid' and (m.due_on is null or m.due_on >= v_today)), 0)::bigint,
         coalesce(sum(m.amount_cents) filter (where m.in_season and m.status <> 'paid' and m.due_on < v_today), 0)::bigint,
         coalesce(sum(m.amount_cents) filter (where m.status <> 'paid'), 0)::bigint,
         min(m.due_on) filter (where m.status <> 'paid'),
         max(m.paid_at),
         (count(m.id) filter (where m.in_season))::int
  from players pl
  left join mine m on m.player_id = pl.id
  where exists (select 1 from memberships ms where ms.player_id = pl.id and ms.season_id = s.id) or exists (select 1 from mine x where x.player_id = pl.id and (x.in_season or x.status <> 'paid'))
  group by pl.id, pl.first_name, pl.last_name;
end $$;
revoke all on function public.finance_balances(uuid) from public, anon;
grant execute on function public.finance_balances(uuid) to authenticated;

-- ===== Income projection for a season (admins) =====
-- collected (paid), outstanding (issued, unpaid; of which overdue) and scheduled: the invoices the nightly job will
-- still issue for active, automatically renewed memberships of the season up to its end (same rules as 0027), by month.
create function public.finance_projection(p_season uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s seasons; v_today date := (now() at time zone 'Europe/Helsinki')::date; m record; d date; step int; n int;
        v_sched jsonb := '{}'::jsonb; v_sched_total bigint := 0; v_sched_count int := 0; k text;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into s from seasons where id = p_season;
  if s.id is null then raise exception 'unknown season' using errcode = '22023'; end if;
  for m in
    select ms.next_due_on, ms.ends_on, mp.amount_cents, mp.period from memberships ms join membership_plans mp on mp.id = ms.plan_id
    where ms.season_id = s.id and ms.status = 'active' and ms.auto_renew and ms.next_due_on is not null
      and mp.amount_cents > 0 and mp.period in ('month', 'quarter', 'year', 'season')
  loop
    step := case m.period when 'month' then 1 when 'quarter' then 3 when 'year' then 12 end;
    d := m.next_due_on; n := 0;
    while d is not null and d <= s.ends_on and (m.ends_on is null or d <= m.ends_on) and n < 60 loop
      k := to_char(d, 'YYYY-MM');
      v_sched := jsonb_set(v_sched, array[k], to_jsonb(coalesce((v_sched ->> k)::bigint, 0) + m.amount_cents));
      v_sched_total := v_sched_total + m.amount_cents; v_sched_count := v_sched_count + 1; n := n + 1;
      d := case when step is null then null else (d + make_interval(months => step))::date end;
    end loop;
  end loop;
  return (
    with inv as (
      select p.amount_cents, p.status, p.due_on, to_char(coalesce(p.due_on, p.created_at::date), 'YYYY-MM') as month
      from payments p where p.status in ('pending', 'failed', 'paid') and app.payment_in_season(p, s)
    ), months as (
      select month from inv union select key from jsonb_each_text(v_sched)
    )
    select jsonb_build_object(
      'season', jsonb_build_object('id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'ends_on', s.ends_on),
      'collected', coalesce((select sum(amount_cents) from inv where status = 'paid'), 0),
      'outstanding', coalesce((select sum(amount_cents) from inv where status <> 'paid'), 0),
      'overdue', coalesce((select sum(amount_cents) from inv where status <> 'paid' and due_on < v_today), 0),
      'invoices', (select count(*) from inv),
      'scheduled', v_sched_total, 'scheduled_count', v_sched_count,
      'by_month', coalesce((select jsonb_agg(jsonb_build_object(
          'month', mo.month,
          'collected', coalesce((select sum(amount_cents) from inv where inv.month = mo.month and status = 'paid'), 0),
          'outstanding', coalesce((select sum(amount_cents) from inv where inv.month = mo.month and status <> 'paid'), 0),
          'scheduled', coalesce((v_sched ->> mo.month)::bigint, 0)) order by mo.month) from months mo), '[]'::jsonb)
    ));
end $$;
revoke all on function public.finance_projection(uuid) from public, anon;
grant execute on function public.finance_projection(uuid) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.43.0','feature','Finance',
  'Admin → Finance: an overview per season (income projected from player invoices, budget and actual costs for team fees, field booking, kits, league fees, licences and other, the expected result), each player''s balance, the invoices and the expenses, grouped in one menu.','2026-11-18')
on conflict (version) do nothing;


-- ===== 20260101000055_balance_invoices.sql =====
-- 0055 Balance invoices (release 0.44.0).
-- Admin → Finance → Invoices → "New balance invoices": an admin bills one player for amounts typed in by hand, one row
-- per item with its season (e.g. "Balance 2024", "Player licence 2026"). Each row becomes its own invoice (own number,
-- reference and PDF), so the player sees them as separate invoices and pays them separately; the Membership tab shows
-- what makes up their total balance. An invoice can now carry its season (payments.season_id), which the Finance pages
-- use before the membership and the due date.

alter table payments add column season_id uuid references seasons(id) on delete set null;
create index on payments (season_id);
alter table payment_lines drop constraint if exists payment_lines_kind_check;
alter table payment_lines add constraint payment_lines_kind_check check (kind in ('fee', 'past_due', 'balance'));

-- An invoice belongs to its own season when it has one, else to its membership's, else to the season of its due date.
create or replace function app.payment_in_season(p payments, s seasons) returns boolean language sql stable as $$
  select case when p.season_id is not null then p.season_id = s.id
              when p.membership_id is not null then exists (select 1 from memberships m where m.id = p.membership_id and m.season_id = s.id)
              else coalesce(p.due_on, p.created_at::date) between s.starts_on and s.ends_on end
$$;

-- p_items: [{"season_id": uuid|null, "description": text, "amount_cents": int}, …], 1–10 items. Returns the new invoice ids.
create function public.create_balance_invoices(p_player uuid, p_due date, p_items jsonb) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare it jsonb; v_desc text; v_amount int; v_season uuid; v_pay uuid; v_ids uuid[] := '{}'; v_today date := (now() at time zone 'Europe/Helsinki')::date;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if not exists (select 1 from players where id = p_player) then raise exception 'unknown player' using errcode = '22023'; end if;
  if p_due is null or p_due < v_today - 365 or p_due > v_today + 365 then raise exception 'due date within a year' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10 then raise exception '1 to 10 items' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_desc := trim(it ->> 'description');
    v_amount := (it ->> 'amount_cents')::int;
    v_season := nullif(it ->> 'season_id', '')::uuid;
    if char_length(coalesce(v_desc, '')) not between 3 and 200 then raise exception 'description 3–200 characters' using errcode = '22023'; end if;
    if v_amount is null or v_amount < 1 or v_amount > 500000 then raise exception 'amount between EUR 0.01 and 5000' using errcode = '22023'; end if;
    if v_season is not null and not exists (select 1 from seasons where id = v_season) then raise exception 'unknown season' using errcode = '22023'; end if;
    insert into payments (player_id, amount_cents, method, status, due_on, invoice_sent_at, notes, season_id, recorded_by)
    values (p_player, v_amount, 'invoice', 'pending', p_due, now(), 'balance invoice', v_season, auth.uid()) returning id into v_pay;
    insert into payment_lines (payment_id, position, description, line_date, unit_price_cents, kind) values (v_pay, 1, v_desc, null, v_amount, 'balance');
    v_ids := v_ids || v_pay;
  end loop;
  return v_ids;
end $$;
revoke all on function public.create_balance_invoices(uuid, date, jsonb) from public, anon;
grant execute on function public.create_balance_invoices(uuid, date, jsonb) to authenticated;

-- The player's own payments, now with the invoice's title (the first line that is not a membership fee) and season.
create or replace view my_payments as
  select p.id, p.amount_cents, p.currency, p.status, p.method, p.due_on, p.paid_at, p.reference, p.invoice_number, p.checkout_url,
         case when p.status = 'paid' then 'paid'
              when p.status in ('pending','failed') and p.due_on is not null and p.due_on < current_date then 'overdue'
              else p.status::text end as display_status,
         (select l.description from payment_lines l where l.payment_id = p.id and l.kind = 'balance' order by l.position limit 1) as title,
         (select s.name from seasons s where s.id = p.season_id) as season_name
  from payments p where p.player_id = app.my_player_id();
grant select on my_payments to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.44.0','feature','Balance invoices',
  'Admin → Finance → Invoices → New balance invoices: bill a player for amounts typed in by hand, each with its season (e.g. Balance 2024, Player licence 2026). Each becomes its own invoice; players see them separately with a breakdown of their total balance.','2026-11-18')
on conflict (version) do nothing;


-- ===== 20260101000056_partial_payments.sql =====
-- 0056 Partial payments on invoices (release 0.46.0).
-- An admin records what a player actually paid on an invoice (amount and date, e.g. EUR 10 of a EUR 20 invoice). Each
-- payment received is a row in payment_receipts; payments.paid_cents keeps the running total. An invoice is paid when the
-- receipts reach its amount (status 'paid', paid_at = the last payment's date). What is still owed is everywhere
-- amount − paid: the player's summary and Membership tab, the PDF and bank barcode, Player balances, Finance, Sign-in help.
-- A receipt recorded by mistake can be deleted, which reopens a paid invoice. "Mark paid" records the rest in one go.
-- An invoice already paid before this release counts as fully paid (no receipt rows for it).

alter table payments add column paid_cents int not null default 0;
update payments set paid_cents = amount_cents where status = 'paid';
alter table payments add constraint payments_paid_within_amount check (paid_cents between 0 and amount_cents);

create table payment_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  amount_cents int not null check (amount_cents between 1 and 10000000),
  paid_on date not null,
  note text check (note is null or char_length(note) between 1 and 200),
  recorded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on payment_receipts (payment_id, paid_on);
alter table payment_receipts enable row level security;
-- written only through the functions below; admins read all, a player reads the receipts of their own invoices
create policy admin_read on payment_receipts for select to authenticated using (app.is_admin());
create policy receipts_self on payment_receipts for select to authenticated
  using (exists (select 1 from payments p where p.id = payment_id and p.player_id = app.my_player_id()));
revoke all on payment_receipts from anon;
create trigger audit after insert or update or delete on payment_receipts for each row execute function app.audit();

-- A payment created or marked paid by any other route (e.g. MobilePay, the nightly job) counts as fully paid.
create function app.payment_paid_in_full() returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') and new.paid_cents < new.amount_cents then new.paid_cents := new.amount_cents; end if;
  return new;
end $$;
create trigger paid_in_full before insert or update on payments for each row execute function app.payment_paid_in_full();

-- Records a payment received. p_amount null = everything still owed ("Mark paid"). Returns what is paid and left.
create function public.record_invoice_payment(p_payment uuid, p_amount int default null, p_paid_on date default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p payments; v_today date := (now() at time zone 'Europe/Helsinki')::date; v_on date := coalesce(p_paid_on, (now() at time zone 'Europe/Helsinki')::date);
        v_left int; v_amount int;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into p from payments where id = p_payment for update;
  if p.id is null then raise exception 'unknown payment' using errcode = '22023'; end if;
  if p.status not in ('pending', 'failed') then raise exception 'already paid' using errcode = 'check_violation'; end if;
  v_left := p.amount_cents - p.paid_cents;
  v_amount := coalesce(p_amount, v_left);
  if v_amount < 1 or v_amount > v_left then raise exception 'amount between EUR 0.01 and what is still owed' using errcode = '22023'; end if;
  if v_on > v_today or v_on < v_today - 3650 then raise exception 'payment date not in the future' using errcode = '22023'; end if;
  insert into payment_receipts (payment_id, amount_cents, paid_on, note, recorded_by) values (p.id, v_amount, v_on, nullif(trim(p_note), ''), auth.uid());
  if v_amount = v_left then
    update payments set paid_cents = amount_cents, status = 'paid', recorded_by = auth.uid(),
           paid_at = case when v_on = v_today then now() else (v_on + time '12:00') at time zone 'Europe/Helsinki' end, updated_at = now()
     where id = p.id;
  else
    update payments set paid_cents = paid_cents + v_amount, updated_at = now() where id = p.id;
  end if;
  return jsonb_build_object('paid_cents', p.paid_cents + v_amount, 'left_cents', v_left - v_amount, 'paid', v_amount = v_left);
end $$;
revoke all on function public.record_invoice_payment(uuid, int, date, text) from public, anon;
grant execute on function public.record_invoice_payment(uuid, int, date, text) to authenticated;

-- Deletes a payment received (a mistake); a paid invoice opens again.
create function public.delete_invoice_receipt(p_receipt uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r payment_receipts;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into r from payment_receipts where id = p_receipt;
  if r.id is null then raise exception 'unknown receipt' using errcode = '22023'; end if;
  perform 1 from payments where id = r.payment_id for update;
  delete from payment_receipts where id = r.id;
  update payments set paid_cents = greatest(0, paid_cents - r.amount_cents),
         status = case when status = 'paid' then 'pending'::payment_status else status end,
         paid_at = case when status = 'paid' then null else paid_at end, updated_at = now()
   where id = r.payment_id;
end $$;
revoke all on function public.delete_invoice_receipt(uuid) from public, anon;
grant execute on function public.delete_invoice_receipt(uuid) to authenticated;

-- The player's own payments, now with what is paid and still due.
create or replace view my_payments as
  select p.id, p.amount_cents, p.currency, p.status, p.method, p.due_on, p.paid_at, p.reference, p.invoice_number, p.checkout_url,
         case when p.status = 'paid' then 'paid'
              when p.status in ('pending','failed') and p.due_on is not null and p.due_on < current_date then 'overdue'
              else p.status::text end as display_status,
         (select l.description from payment_lines l where l.payment_id = p.id and l.kind = 'balance' order by l.position limit 1) as title,
         (select s.name from seasons s where s.id = p.season_id) as season_name,
         p.paid_cents, case when p.status = 'paid' then 0 else p.amount_cents - p.paid_cents end as due_cents
  from payments p where p.player_id = app.my_player_id();
grant select on my_payments to authenticated;

-- my_payment_summary: amounts still owed are now amount − paid
create or replace function public.my_payment_summary() returns table (
  team_name text, paid_cents bigint, owed_cents bigint, overdue_cents bigint,
  next_due_on date, sign_in_blocked_from date, exempt_until date, grace_days int, policy_enabled boolean)
language sql stable security definer set search_path = public as $$
  with me as (select app.my_player_id() as id),
  fp as (select * from fee_policy),
  t as (select tm.name from team_players tp join team_seasons ts on ts.id = tp.team_season_id join teams tm on tm.id = ts.team_id, me
         where tp.player_id = me.id and tp.left_on is null order by ts.created_at desc limit 1)
  select (select name from t),
         coalesce(sum(p.paid_cents), 0),
         coalesce(sum(p.amount_cents - p.paid_cents) filter (where p.status in ('pending','failed')), 0),
         coalesce(sum(p.amount_cents - p.paid_cents) filter (where p.status in ('pending','failed') and p.due_on < current_date), 0),
         min(p.due_on) filter (where p.status in ('pending','failed')),
         min(p.due_on) filter (where p.status in ('pending','failed') and p.due_on is not null) + (select grace_days from fp),
         (select fee_exempt_until from players where id = (select id from me)),
         (select grace_days from fp), (select enabled from fp)
  from payments p where p.player_id = (select id from me)
$$;

-- fee_overview: amounts still owed are now amount − paid
create or replace function public.fee_overview() returns table (player_id uuid, player_name text, team_name text, owed_cents bigint, oldest_due date, days_overdue int, blocked boolean, exempt_until date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query
  select pl.id, pl.first_name || ' ' || pl.last_name,
         (select tm.name from team_players tp join team_seasons ts on ts.id = tp.team_season_id join teams tm on tm.id = ts.team_id where tp.player_id = pl.id and tp.left_on is null order by ts.created_at desc limit 1),
         sum(p.amount_cents - p.paid_cents), min(p.due_on), greatest(0, current_date - min(p.due_on))::int,
         coalesce(pl.profile_id is not null and app.player_blocked(pl.profile_id), false), pl.fee_exempt_until
  from players pl join payments p on p.player_id = pl.id and p.status in ('pending','failed')
  group by pl.id order by min(p.due_on) nulls last;
end $$;

-- signin_status: amounts still owed are now amount − paid
create or replace function public.signin_status(p_profile uuid) returns table (
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
         (select sum(p.amount_cents - p.paid_cents) from payments p where p.player_id = pl.id and p.status in ('pending', 'failed'))::bigint,
         (select min(p.due_on) from payments p where p.player_id = pl.id and p.status in ('pending', 'failed')),
         pl.fee_exempt_until
  from profiles pr
  left join auth.users u on u.id = pr.id
  left join players pl on pl.profile_id = pr.id
  where pr.id = p_profile;
end $$;

-- finance_summary: amounts still owed are now amount − paid
create or replace function public.finance_summary(p_season uuid) returns table (income_cents bigint, pending_cents bigint, expenses_cents bigint, net_cents bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
  select i.paid, i.pending, e.spent, i.paid - e.spent from
   (select coalesce(sum(p.paid_cents), 0)::bigint paid, coalesce(sum(p.amount_cents - p.paid_cents) filter (where p.status = 'pending'), 0)::bigint pending
      from payments p left join memberships m on m.id = p.membership_id where m.season_id = p_season or (p.membership_id is null and p.created_at::date between (select starts_on from seasons where id = p_season) and (select ends_on from seasons where id = p_season))) i,
   (select coalesce(sum(amount_cents), 0)::bigint spent from expenses where season_id = p_season) e;
end $$;

-- finance_balances: amounts still owed are now amount − paid
create or replace function public.finance_balances(p_season uuid) returns table (
  player_id uuid, first_name text, last_name text, invoiced_cents bigint, paid_cents bigint, open_cents bigint, overdue_cents bigint,
  balance_cents bigint, oldest_due date, last_paid_at timestamptz, invoices int)
language plpgsql stable security definer set search_path = public as $$
declare s seasons; v_today date := (now() at time zone 'Europe/Helsinki')::date;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into s from seasons where id = p_season;
  if s.id is null then raise exception 'unknown season' using errcode = '22023'; end if;
  return query
  with mine as (
    select p.*, app.payment_in_season(p, s) as in_season from payments p where p.status in ('pending', 'failed', 'paid')
  )
  select pl.id, pl.first_name, pl.last_name,
         coalesce(sum(m.amount_cents) filter (where m.in_season), 0)::bigint,
         coalesce(sum(m.paid_cents) filter (where m.in_season), 0)::bigint,
         coalesce(sum(m.amount_cents - m.paid_cents) filter (where m.in_season and m.status <> 'paid' and (m.due_on is null or m.due_on >= v_today)), 0)::bigint,
         coalesce(sum(m.amount_cents - m.paid_cents) filter (where m.in_season and m.status <> 'paid' and m.due_on < v_today), 0)::bigint,
         coalesce(sum(m.amount_cents - m.paid_cents) filter (where m.status <> 'paid'), 0)::bigint,
         min(m.due_on) filter (where m.status <> 'paid'),
         greatest(max(m.paid_at), (select max(r.paid_on)::timestamptz from payment_receipts r join payments x on x.id = r.payment_id where x.player_id = pl.id)),
         (count(m.id) filter (where m.in_season))::int
  from players pl
  left join mine m on m.player_id = pl.id
  where exists (select 1 from memberships ms where ms.player_id = pl.id and ms.season_id = s.id) or exists (select 1 from mine x where x.player_id = pl.id and (x.in_season or x.status <> 'paid'))
  group by pl.id, pl.first_name, pl.last_name;
end $$;

-- finance_projection: amounts still owed are now amount − paid
create or replace function public.finance_projection(p_season uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s seasons; v_today date := (now() at time zone 'Europe/Helsinki')::date; m record; d date; step int; n int;
        v_sched jsonb := '{}'::jsonb; v_sched_total bigint := 0; v_sched_count int := 0; k text;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into s from seasons where id = p_season;
  if s.id is null then raise exception 'unknown season' using errcode = '22023'; end if;
  for m in
    select ms.next_due_on, ms.ends_on, mp.amount_cents, mp.period from memberships ms join membership_plans mp on mp.id = ms.plan_id
    where ms.season_id = s.id and ms.status = 'active' and ms.auto_renew and ms.next_due_on is not null
      and mp.amount_cents > 0 and mp.period in ('month', 'quarter', 'year', 'season')
  loop
    step := case m.period when 'month' then 1 when 'quarter' then 3 when 'year' then 12 end;
    d := m.next_due_on; n := 0;
    while d is not null and d <= s.ends_on and (m.ends_on is null or d <= m.ends_on) and n < 60 loop
      k := to_char(d, 'YYYY-MM');
      v_sched := jsonb_set(v_sched, array[k], to_jsonb(coalesce((v_sched ->> k)::bigint, 0) + m.amount_cents));
      v_sched_total := v_sched_total + m.amount_cents; v_sched_count := v_sched_count + 1; n := n + 1;
      d := case when step is null then null else (d + make_interval(months => step))::date end;
    end loop;
  end loop;
  return (
    with inv as (
      select p.paid_cents as paid, p.amount_cents - p.paid_cents as open, p.status, p.due_on, to_char(coalesce(p.due_on, p.created_at::date), 'YYYY-MM') as month
      from payments p where p.status in ('pending', 'failed', 'paid') and app.payment_in_season(p, s)
    ), months as (
      select month from inv union select key from jsonb_each_text(v_sched)
    )
    select jsonb_build_object(
      'season', jsonb_build_object('id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'ends_on', s.ends_on),
      'collected', coalesce((select sum(paid) from inv), 0),
      'outstanding', coalesce((select sum(open) from inv where status <> 'paid'), 0),
      'overdue', coalesce((select sum(open) from inv where status <> 'paid' and due_on < v_today), 0),
      'invoices', (select count(*) from inv),
      'scheduled', v_sched_total, 'scheduled_count', v_sched_count,
      'by_month', coalesce((select jsonb_agg(jsonb_build_object(
          'month', mo.month,
          'collected', coalesce((select sum(paid) from inv where inv.month = mo.month), 0),
          'outstanding', coalesce((select sum(open) from inv where inv.month = mo.month and status <> 'paid'), 0),
          'scheduled', coalesce((v_sched ->> mo.month)::bigint, 0)) order by mo.month) from months mo), '[]'::jsonb)
    ));
end $$;
insert into app_releases (version, kind, title, notes, released_at) values
 ('0.46.0','feature','Partial payments',
  'Admin → Finance → Invoices: record what a player paid on an invoice (e.g. EUR 10 of EUR 20) with its date; the rest stays owed. Players, Player balances, Finance and the invoice PDF show what is paid and what is left. A payment recorded by mistake can be deleted.','2026-11-18')
on conflict (version) do nothing;


-- ===== 20260101000057_shirt_numbers.sql =====
-- 0057 Shirt number requests (release 0.47.0).
-- A player asks for a free squad number in their team for the season; the team's coach or an admin approves or declines.
-- Approving writes the number to team_players.jersey_number (unique per team and season, migration 0002), so it is no
-- longer free; other open requests for the same number in that team are declined automatically. A player who already
-- had a number gets the new one and the old one is free again. Nobody approves their own request (a player-coach).
-- shirt_numbers(team_season) lists 1–99 for a team: who has it, how many open requests, free.

create table jersey_requests (
  id uuid primary key default gen_random_uuid(),
  team_season_id uuid not null references team_seasons(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  number int not null check (number between 1 and 99),
  note text check (note is null or char_length(note) between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) between 1 and 200),
  created_at timestamptz not null default now()
);
create unique index jersey_requests_one_open on jersey_requests (team_season_id, player_id) where status = 'pending';
create index on jersey_requests (team_season_id, status);
alter table jersey_requests enable row level security;
-- reads: the player (own requests), the team's coaches, admins; writes only through the functions below
create policy own_read on jersey_requests for select to authenticated using (player_id = app.my_player_id());
create policy staff_read on jersey_requests for select to authenticated using (app.is_admin() or app.coaches_ts(team_season_id));
revoke all on jersey_requests from anon;
create trigger audit after insert or update or delete on jersey_requests for each row execute function app.audit();

-- Who may decide for a team: an admin, or a coach of that team; never for their own request.
create function app.can_decide_jersey(p_ts uuid, p_player uuid) returns boolean language sql stable security definer set search_path = public as
$$ select (app.is_admin() or app.coaches_ts(p_ts)) and p_player is distinct from app.my_player_id() $$;

-- Numbers 1–99 of one team for the season: who wears it, open requests, and whether it is free.
-- For the team's players, its coaches and admins (teammates already see each other's numbers in team_roster).
create function public.shirt_numbers(p_ts uuid) returns table (number int, player_id uuid, player_name text, requests int, mine_requested boolean, free boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not (app.is_admin() or app.coaches_ts(p_ts) or exists (select 1 from team_players where team_season_id = p_ts and player_id = app.my_player_id() and left_on is null)) then
    raise exception 'not your team' using errcode = '42501';
  end if;
  return query
  select n, tp.player_id, case when tp.player_id is null then null else p.first_name || ' ' || p.last_name end,
         (select count(*)::int from jersey_requests r where r.team_season_id = p_ts and r.number = n and r.status = 'pending'),
         exists (select 1 from jersey_requests r where r.team_season_id = p_ts and r.number = n and r.status = 'pending' and r.player_id = app.my_player_id()),
         tp.player_id is null
  from generate_series(1, 99) n
  left join team_players tp on tp.team_season_id = p_ts and tp.jersey_number = n and tp.left_on is null
  left join players p on p.id = tp.player_id
  order by n;
end $$;
revoke all on function public.shirt_numbers(uuid) from public, anon;
grant execute on function public.shirt_numbers(uuid) to authenticated;

-- A player asks for a free number in one of their teams; an open request of theirs for that team is replaced.
create function public.request_shirt_number(p_ts uuid, p_number int, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_player uuid := app.my_player_id(); v_id uuid;
begin
  if v_player is null or not app.is_active() then raise exception 'members only' using errcode = '42501'; end if;
  if not exists (select 1 from team_players where team_season_id = p_ts and player_id = v_player and left_on is null) then raise exception 'not your team' using errcode = '42501'; end if;
  if p_number is null or p_number not between 1 and 99 then raise exception 'number 1–99' using errcode = '22023'; end if;
  if exists (select 1 from team_players where team_season_id = p_ts and jersey_number = p_number and left_on is null) then raise exception 'number taken' using errcode = '23505'; end if;
  update jersey_requests set status = 'withdrawn', decided_at = now() where team_season_id = p_ts and player_id = v_player and status = 'pending';
  insert into jersey_requests (team_season_id, player_id, number, note) values (p_ts, v_player, p_number, nullif(trim(p_note), '')) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.request_shirt_number(uuid, int, text) from public, anon;
grant execute on function public.request_shirt_number(uuid, int, text) to authenticated;

create function public.withdraw_shirt_request(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update jersey_requests set status = 'withdrawn', decided_at = now() where id = p_request and player_id = app.my_player_id() and status = 'pending';
  if not found then raise exception 'no open request' using errcode = '22023'; end if;
end $$;
revoke all on function public.withdraw_shirt_request(uuid) from public, anon;
grant execute on function public.withdraw_shirt_request(uuid) to authenticated;

-- Approve: the number becomes the player's squad number; others asking for it are declined. Decline: with an optional reason.
create function public.decide_shirt_request(p_request uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r jersey_requests;
begin
  select * into r from jersey_requests where id = p_request for update;
  if r.id is null or r.status <> 'pending' then raise exception 'no open request' using errcode = '22023'; end if;
  if not app.can_decide_jersey(r.team_season_id, r.player_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_approve then
    if exists (select 1 from team_players where team_season_id = r.team_season_id and jersey_number = r.number and left_on is null and player_id <> r.player_id) then
      raise exception 'number taken' using errcode = '23505';
    end if;
    update team_players set jersey_number = r.number, updated_at = now() where team_season_id = r.team_season_id and player_id = r.player_id and left_on is null;
    if not found then raise exception 'player not in the team' using errcode = '22023'; end if;
    update jersey_requests set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '') where id = r.id;
    -- declined without a note: the player's page says the number went to someone else (in their language)
    update jersey_requests set status = 'declined', decided_by = auth.uid(), decided_at = now(), decision_note = null
     where team_season_id = r.team_season_id and number = r.number and status = 'pending' and id <> r.id;
  else
    update jersey_requests set status = 'declined', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '') where id = r.id;
  end if;
end $$;
revoke all on function public.decide_shirt_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_shirt_request(uuid, boolean, text) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.47.0','feature','Shirt number requests',
  'Players ask for a free squad number in their team (My profile); the coach or an admin approves or declines. Approved numbers are no longer free. Admin → Teams & events → Shirt numbers lists the free numbers of every team for a season.','2026-11-18')
on conflict (version) do nothing;


-- ===== 20260101000058_contact_robot_check.sql =====
-- 0058 Robot check on the website's contact and sponsor forms (release 0.48.0).
-- Each message stores the one-time nonce of the football robot check it passed; the unique index makes one solved
-- check good for one message (a replayed answer is dropped). Older messages have none.
alter table contact_messages add column robot_nonce text check (robot_nonce is null or char_length(robot_nonce) between 8 and 40);
create unique index contact_messages_robot_nonce on contact_messages (robot_nonce) where robot_nonce is not null;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.48.0','feature','Robot check on the contact form, sign-out after inactivity',
  'The website''s contact and sponsor forms carry the football robot check; a solved check sends one message. The member app signs people out after a period without activity (default 60 minutes), with a warning two minutes before.','2026-11-19')
on conflict (version) do nothing;


-- ===== 20260101000059_shirt_set.sql =====
-- 0059 The club's shirt numbers and releasing a number (release 0.50.0). Safe to run again (repair version).
-- The club only has shirts with some numbers (e.g. 1–39). Admin → Shirt numbers keeps that list in site_settings
-- 'shirts' {numbers: [...]}; without it every number 1–99 counts. Players can only ask for, and staff only give,
-- numbers from the list (also on the admin team page: a trigger on team_players). A number already worn outside the
-- list stays until it is released, and shows as "not in the club's numbers".
-- release_shirt_number(): an admin, or the team's coach (never for themselves), takes a number back from a player.

create or replace function app.shirt_set() returns int[] language sql stable security definer set search_path = public as $$
  select coalesce(
    (select array_agg(distinct n order by n) from site_settings s, jsonb_array_elements_text(s.value -> 'numbers') e(v), lateral (select e.v::int as n) x
      where s.key = 'shirts' and x.n between 1 and 99),
    array(select generate_series(1, 99)))
$$;

-- squad numbers outside the club's list are refused when they are given or changed (an existing one may stay)
create or replace function app.shirt_in_set() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.jersey_number is not null and (tg_op = 'INSERT' or new.jersey_number is distinct from old.jersey_number)
     and not (new.jersey_number = any (app.shirt_set())) then
    raise exception 'shirt number % is not one of the club''s numbers', new.jersey_number using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists shirt_in_set on team_players;
create trigger shirt_in_set before insert or update of jersey_number on team_players for each row execute function app.shirt_in_set();

-- The grid: the club's numbers, plus any number worn outside them (in_set false), so it can be released.
drop function if exists public.shirt_numbers(uuid);
create function public.shirt_numbers(p_ts uuid) returns table (number int, player_id uuid, player_name text, requests int, mine_requested boolean, free boolean, in_set boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_set int[] := app.shirt_set();
begin
  if not (app.is_admin() or app.coaches_ts(p_ts) or exists (select 1 from team_players where team_season_id = p_ts and player_id = app.my_player_id() and left_on is null)) then
    raise exception 'not your team' using errcode = '42501';
  end if;
  return query
  select n, tp.player_id, case when tp.player_id is null then null else p.first_name || ' ' || p.last_name end,
         (select count(*)::int from jersey_requests r where r.team_season_id = p_ts and r.number = n and r.status = 'pending'),
         exists (select 1 from jersey_requests r where r.team_season_id = p_ts and r.number = n and r.status = 'pending' and r.player_id = app.my_player_id()),
         tp.player_id is null and n = any (v_set),
         n = any (v_set)
  from (select unnest(v_set) as n
        union select jersey_number from team_players where team_season_id = p_ts and left_on is null and jersey_number is not null) nums
  left join team_players tp on tp.team_season_id = p_ts and tp.jersey_number = nums.n and tp.left_on is null
  left join players p on p.id = tp.player_id
  order by n;
end $$;
revoke all on function public.shirt_numbers(uuid) from public, anon;
grant execute on function public.shirt_numbers(uuid) to authenticated;

-- Asking for a number outside the club's list is refused (the rest as in 0057).
create or replace function public.request_shirt_number(p_ts uuid, p_number int, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_player uuid := app.my_player_id(); v_id uuid;
begin
  if v_player is null or not app.is_active() then raise exception 'members only' using errcode = '42501'; end if;
  if not exists (select 1 from team_players where team_season_id = p_ts and player_id = v_player and left_on is null) then raise exception 'not your team' using errcode = '42501'; end if;
  if p_number is null or not (p_number = any (app.shirt_set())) then raise exception 'not one of the club''s numbers' using errcode = '22023'; end if;
  if exists (select 1 from team_players where team_season_id = p_ts and jersey_number = p_number and left_on is null) then raise exception 'number taken' using errcode = '23505'; end if;
  update jersey_requests set status = 'withdrawn', decided_at = now() where team_season_id = p_ts and player_id = v_player and status = 'pending';
  insert into jersey_requests (team_season_id, player_id, number, note) values (p_ts, v_player, p_number, nullif(trim(p_note), '')) returning id into v_id;
  return v_id;
end $$;

-- Takes a number back from a player (it becomes free if it is one of the club's numbers).
create or replace function public.release_shirt_number(p_ts uuid, p_player uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.can_decide_jersey(p_ts, p_player) then raise exception 'not allowed' using errcode = '42501'; end if;
  update team_players set jersey_number = null, updated_at = now() where team_season_id = p_ts and player_id = p_player and left_on is null and jersey_number is not null;
  if not found then raise exception 'no number to release' using errcode = '22023'; end if;
end $$;
revoke all on function public.release_shirt_number(uuid, uuid) from public, anon;
grant execute on function public.release_shirt_number(uuid, uuid) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.50.0','feature','The club''s shirt numbers, releasing a number',
  'Admin → Shirt numbers: set the numbers the club has shirts for (e.g. 1–39); players only see and ask for those. Admins and coaches can release a number from a player.','2026-11-19')
on conflict (version) do nothing;


-- ===== 20260101000060_invoice_schedule.sql =====
-- 0060 Monthly invoice schedule (release 0.51.0).
-- Automatic invoices are dated on the club's invoice day of the period's month (default the 1st) and due on its due
-- day (default the 10th), both in Club billing details (billing.invoice_day / billing.due_day, 1–28). They are created
-- on the invoice day, no longer `lead_days` before. An invoice that can only be created later (e.g. the contract was
-- signed on the 15th) is due at least 7 days after it is created. Unchanged: nothing is invoiced before the player's
-- contract is signed and the Code of Conduct agreed (0036). Admins set from which month each membership is invoiced
-- (memberships.next_due_on, always the 1st of a month), one by one, for every membership without invoices yet, or from
-- the month each player's contract starts.

create or replace function app.invoice_days() returns int[] language sql stable security definer set search_path = public as $$
  select coalesce(
    (select array[least(28, greatest(1, coalesce((value ->> 'invoice_day')::int, 1))),
                  least(28, greatest(1, coalesce((value ->> 'due_day')::int, 10)))]
       from site_settings where key = 'billing'),
    array[1, 10])
$$;

-- The invoice date and due date of the period that starts in the month of p_period.
create or replace function app.invoice_dates(p_period date) returns table (issue_on date, due_on date) language sql stable security definer set search_path = public as $$
  select (date_trunc('month', p_period)::date + (d[1] - 1)),
         case when d[2] >= d[1] then date_trunc('month', p_period)::date + (d[2] - 1)
              else (date_trunc('month', p_period) + interval '1 month')::date + (d[2] - 1) end   -- due day before the invoice day: next month
  from (select app.invoice_days() d) x
$$;

create or replace function app.generate_due_invoices(p_today date default (now() at time zone 'Europe/Helsinki')::date) returns int
language plpgsql security definer set search_path = public as $$
declare
  b jsonb; req boolean; m record; months int; per int; i int; v_pay uuid; n int := 0; v_due date;
begin
  select value into b from site_settings where key = 'billing';
  if b is null or coalesce(b->>'iban', '') = '' then
    raise notice 'Billing details (IBAN) are missing: no invoices issued.';
    return 0;
  end if;
  req := coalesce((b->>'require_consents')::boolean, true);
  for m in
    select ms.id, ms.player_id, ms.next_due_on, ms.ends_on, mp.amount_cents, mp.currency, mp.period, d.issue_on, d.due_on
    from memberships ms join membership_plans mp on mp.id = ms.plan_id, lateral app.invoice_dates(ms.next_due_on) d
    where ms.status = 'active' and ms.auto_renew and ms.next_due_on is not null and d.issue_on <= p_today
      and mp.amount_cents > 0 and mp.period in ('month', 'quarter', 'year', 'season')
      and (ms.ends_on is null or ms.next_due_on <= ms.ends_on)
      and (not req or cardinality(app.invoice_hold(ms.player_id, ms.next_due_on)) = 0)   -- 0036: contract signed, Code of Conduct agreed
    order by ms.next_due_on
    for update of ms skip locked
  loop
    months := case m.period when 'month' then 1 when 'quarter' then 3 when 'year' then 12 end;  -- null for a season
    -- on time: dated the invoice day, due the due day; late (e.g. signed after the invoice day): today, due 7 days on at least
    v_due := case when p_today <= m.issue_on then m.due_on else greatest(m.due_on, p_today + 7) end;
    insert into payments (player_id, membership_id, amount_cents, currency, method, status, due_on, invoice_sent_at, notes)
    values (m.player_id, m.id, m.amount_cents, m.currency, 'invoice', 'pending', v_due,
            case when p_today <= m.issue_on then (m.issue_on + time '08:00') at time zone 'Europe/Helsinki' else now() end, 'automatic invoice')
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

-- Admins: the memberships whose invoice day has come but that wait for a signature or the Code of Conduct.
create or replace function public.invoice_holds() returns table (membership_id uuid, player_id uuid, player_name text, next_due_on date, missing text[])
language plpgsql stable security definer set search_path = public as $$
declare b jsonb;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select value into b from site_settings where key = 'billing';
  if not coalesce((b->>'require_consents')::boolean, true) then return; end if;
  return query
    select ms.id, ms.player_id, pl.first_name || ' ' || pl.last_name, ms.next_due_on, app.invoice_hold(ms.player_id, ms.next_due_on)
    from memberships ms join membership_plans mp on mp.id = ms.plan_id join players pl on pl.id = ms.player_id, lateral app.invoice_dates(ms.next_due_on) d
    where ms.status = 'active' and ms.auto_renew and ms.next_due_on is not null and d.issue_on <= (now() at time zone 'Europe/Helsinki')::date
      and mp.amount_cents > 0 and mp.period in ('month', 'quarter', 'year', 'season') and (ms.ends_on is null or ms.next_due_on <= ms.ends_on)
      and cardinality(app.invoice_hold(ms.player_id, ms.next_due_on)) > 0
    order by ms.next_due_on, pl.last_name;
end $$;

-- Admins: from which month memberships are invoiced (the 1st of p_month). p_membership null = every active membership
-- of the current season with automatic invoices on and no invoice yet. Returns how many memberships changed.
create or replace function public.set_invoice_start(p_month date, p_membership uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_first date := date_trunc('month', p_month)::date; n int;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_month is null or v_first < date_trunc('month', now() at time zone 'Europe/Helsinki')::date - interval '12 months'
     or v_first > date_trunc('month', now() at time zone 'Europe/Helsinki')::date + interval '24 months' then
    raise exception 'month within the last year or the next two' using errcode = '22023';
  end if;
  update memberships ms set next_due_on = v_first, starts_on = least(coalesce(ms.starts_on, v_first), v_first), updated_at = now()
  where ms.status = 'active' and ms.auto_renew
    and (case when p_membership is not null then ms.id = p_membership
              else ms.season_id in (select id from seasons where is_current) and not exists (select 1 from payments p where p.membership_id = ms.id) end);
  get diagnostics n = row_count;
  if p_membership is not null and n = 0 then raise exception 'no such membership with automatic invoices' using errcode = '22023'; end if;
  return n;
end $$;
revoke all on function public.set_invoice_start(date, uuid) from public, anon;
grant execute on function public.set_invoice_start(date, uuid) to authenticated;

-- The month the player's contract starts (the first of it): their sent, signed or running contract that has not ended,
-- earliest first. Null when they have none. Used for "start invoices from each player's contract".
create or replace function app.contract_start_month(p_player uuid) returns date language sql stable security definer set search_path = public as $$
  select date_trunc('month', min(k.starts_on))::date from player_contracts k
  where k.player_id = p_player and k.status in ('sent', 'player_signed', 'active') and k.ends_on >= (now() at time zone 'Europe/Helsinki')::date
$$;
revoke all on function app.contract_start_month(uuid) from public, anon, authenticated;

-- Admins: every membership of the current season without invoices starts in the month its player's contract starts
-- (players without a contract are left as they are). Returns how many memberships changed.
create or replace function public.set_invoice_start_from_contracts() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update memberships ms set next_due_on = c.m, starts_on = least(coalesce(ms.starts_on, c.m), c.m), updated_at = now()
  from (select ms2.id, app.contract_start_month(ms2.player_id) m from memberships ms2) c
  where c.id = ms.id and c.m is not null and ms.next_due_on is distinct from c.m
    and ms.status = 'active' and ms.auto_renew and ms.season_id in (select id from seasons where is_current)
    and not exists (select 1 from payments p where p.membership_id = ms.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.set_invoice_start_from_contracts() from public, anon;
grant execute on function public.set_invoice_start_from_contracts() to authenticated;

-- defaults for clubs that already saved billing details
update site_settings set value = value || jsonb_build_object('invoice_day', coalesce((value ->> 'invoice_day')::int, 1), 'due_day', coalesce((value ->> 'due_day')::int, 10))
 where key = 'billing';

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.51.0','feature','Monthly invoice schedule',
  'Automatic invoices are dated the 1st of the month and due on the 10th (Club billing details). Admins set from which month each membership is invoiced, or for all memberships without invoices at once (e.g. January 2027). Nothing is invoiced before the contract is signed.','2026-11-19')
on conflict (version) do nothing;


-- ===== 20260101000061_opponents.sql =====
-- 0061 Opponents list (release 0.52.0).
-- The teams the club plays against, ready to pick when a game or friendly is booked (Admin → Events, a coach's team
-- page). A name typed as "+ Add a new opponent" is remembered automatically when the game is saved (trigger on matches),
-- so the next booking can pick it. Admins rename or hide names (Admin → Teams & events → Opponents). Games keep the
-- name they were booked with (matches.opponent stays text), so renaming or hiding never changes past games.

create table if not exists opponents (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120 and name = btrim(name)),
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists opponents_name_key on opponents (lower(name));
alter table opponents enable row level security;
revoke all on opponents from anon;
-- read: the people who book games (coaches, admins); write: admins (coaches add names only through their games)
drop policy if exists staff_read on opponents;
create policy staff_read on opponents for select to authenticated using (app.is_admin() or app.is_coach());
drop policy if exists admin_write on opponents;
create policy admin_write on opponents for all to authenticated using (app.is_admin()) with check (app.is_admin());
drop trigger if exists audit on opponents;
create trigger audit after insert or update or delete on opponents for each row execute function app.audit();

-- a game's opponent joins the list (again visible if it had been hidden)
create or replace function app.remember_opponent() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.opponent is not null and btrim(new.opponent) <> '' then
    insert into opponents (name, created_by) values (btrim(new.opponent), auth.uid())
    on conflict ((lower(name))) do update set active = true, updated_at = now() where not opponents.active;
  end if;
  return new;
end $$;
drop trigger if exists remember_opponent on matches;
create trigger remember_opponent after insert or update of opponent on matches for each row execute function app.remember_opponent();

-- the club's list (November 2026) and every opponent already booked
insert into opponents (name) values
  ('5/1'),
  ('6/10'),
  ('AFC EMU'),
  ('AFG united'),
  ('Africa United'),
  ('Akilles'),
  ('Anadolusk'),
  ('Andalus FC'),
  ('Ariana AFG'),
  ('Chicken Wings/2'),
  ('Club Latino Español "CLE"'),
  ('Congo'),
  ('Espa United'),
  ('FC Degis'),
  ('FC Eagles'),
  ('FC Fortuna'),
  ('FC Haxi'),
  ('FC Inter Vuosaari'),
  ('FC KaKe'),
  ('FC Kontu/KoVa'),
  ('FC Mango'),
  ('FC Nile'),
  ('FC Parseh'),
  ('FC Pehmeet ja Märät'),
  ('FC POHU/Futboleros'),
  ('FC Tuusula'),
  ('FC Viikingit'),
  ('FC Viikingit/S.C.P'),
  ('FC Vuosaari (Div. 4)'),
  ('Flamingo FC, Lahti'),
  ('Flamingo United'),
  ('Gambia 🇬🇲'),
  ('HAlku'),
  ('HaPK Edustus/2'),
  ('HDS/Express'),
  ('Helsingin Ponnistus/2 (Div 5)'),
  ('HePuli'),
  ('HJK/Töölön Ihme'),
  ('HyPS'),
  ('JäPS/Akatemia'),
  ('JäPS/U23'),
  ('Jätkäsaaren pallo'),
  ('KeIA'),
  ('KeiKa/United'),
  ('Kenya 🇰🇪'),
  ('Kilo IF/1'),
  ('KoiPS'),
  ('KoiPS/Dynamo'),
  ('KPPK'),
  ('Millbrook FC'),
  ('MK-United'),
  ('MPS/Atletico Akatemia'),
  ('MPS/AtleticoAkatemia'),
  ('Nikinmäki United'),
  ('NJS/Jucola'),
  ('PETO/2'),
  ('PK-35/2'),
  ('Polin Pallo'),
  ('Ponnistajat'),
  ('Ponnistus'),
  ('PPS'),
  ('PPS/OS'),
  ('PuiU/86'),
  ('PuiU/Akatemia'),
  ('Rwanda Team 🇷🇼'),
  ('SAPA/2'),
  ('Sierra Leone 🇸🇱'),
  ('SUMU/sob'),
  ('TAT Oppenent'),
  ('TBD'),
  ('Team Congo'),
  ('Team Gambia 🇬🇲'),
  ('Team Nigeria'),
  ('Team Vietnam'),
  ('Team Zambia'),
  ('ToBK'),
  ('ToTe/Keparoi'),
  ('ToTe/Taiskin Tykit'),
  ('TuPS/Skavaböle'),
  ('United Arabs'),
  ('Valtti/3'),
  ('Veijarit'),
  ('Vietfin FC'),
  ('Wartti/Wild Boars')
on conflict ((lower(name))) do nothing;
insert into opponents (name, created_by) select distinct on (lower(btrim(opponent))) btrim(opponent), null from matches where btrim(opponent) <> ''
on conflict ((lower(name))) do nothing;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.52.0','feature','Opponents list',
  'Booking a game or friendly: pick the opponent from the club''s list, or add a new one (it is remembered). Admins rename or hide names under Teams & events → Opponents.','2026-11-20')
on conflict (version) do nothing;


-- ===== 20260101000062_event_tasks.sql =====
-- 0062 Game-day and training-day tasks (release 0.53.0). Safe to run again.
-- Jobs around a game or a training session, each with an icon: bring the balls, the water, the first-aid kit, wash the
-- kit, drive… The club keeps a list of task types (task_types: ten built in, coaches and admins add more). On a game or
-- training the coach adds tasks and gives each to a player, or leaves it open: a player of the team takes an open task
-- ("I'll do it") or gives back their own ("I can't do it") through claim_event_task / release_event_task.
-- Who sees the tasks of an event: its team's players, its coaches and admins. Who changes them: its coaches and admins.

-- the icons the app can draw (components/TaskIcon.tsx)
create or replace function app.task_icon_ok(p text) returns boolean language sql immutable as $$
  select p in ('ball', 'water', 'first_aid', 'shirt', 'bib', 'cone', 'car', 'whistle', 'camera', 'snack', 'flag', 'bag', 'key', 'clipboard', 'star', 'music')
$$;

create table if not exists task_types (
  id uuid primary key default gen_random_uuid(),
  -- built-in types have a key (their name is translated in the app); a type added by the club has its name as typed
  builtin text unique check (builtin is null or builtin ~ '^[a-z_]{2,30}$'),
  name text not null check (char_length(name) between 2 and 60 and name = btrim(name)),
  icon text not null check (app.task_icon_ok(icon)),
  position int not null default 100,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists task_types_name_key on task_types (lower(name));
alter table task_types enable row level security;
revoke all on task_types from anon;
drop policy if exists members_read on task_types;
create policy members_read on task_types for select to authenticated using (app.is_active());
-- coaches and admins add a type; only admins change or hide one (built-in names and keys stay as they are)
drop policy if exists staff_add on task_types;
create policy staff_add on task_types for insert to authenticated with check ((app.is_admin() or app.is_coach()) and builtin is null);
drop policy if exists admin_change on task_types;
create policy admin_change on task_types for update to authenticated using (app.is_admin()) with check (app.is_admin());
drop trigger if exists audit on task_types;
create trigger audit after insert or update or delete on task_types for each row execute function app.audit();

insert into task_types (builtin, name, icon, position) values
  ('balls', 'Bring the balls', 'ball', 10),
  ('water', 'Bring the water', 'water', 20),
  ('first_aid', 'First-aid kit', 'first_aid', 30),
  ('wash_kit', 'Wash the kit', 'shirt', 40),
  ('bibs', 'Bring the bibs', 'bib', 50),
  ('cones', 'Set up the cones', 'cone', 60),
  ('carpool', 'Drive / carpool', 'car', 70),
  ('referee', 'Referee', 'whistle', 80),
  ('photos', 'Take photos', 'camera', 90),
  ('snacks', 'Fruit and snacks', 'snack', 100)
on conflict (builtin) do nothing;

create table if not exists event_tasks (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  session_id uuid references training_sessions(id) on delete cascade,
  task_type_id uuid not null references task_types(id) on delete restrict,
  player_id uuid references players(id) on delete set null,   -- null: open, anyone in the team can take it
  note text check (note is null or char_length(note) between 1 and 120),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(match_id, session_id) = 1)
);
create index if not exists event_tasks_match on event_tasks (match_id) where match_id is not null;
create index if not exists event_tasks_session on event_tasks (session_id) where session_id is not null;
create index if not exists event_tasks_player on event_tasks (player_id) where player_id is not null;

-- the team (team_season) of a task's game or training
create or replace function app.task_ts(p_match uuid, p_session uuid) returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select team_season_id from matches where id = p_match), (select team_season_id from training_sessions where id = p_session))
$$;
create or replace function app.in_team_now(p_ts uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_players where team_season_id = p_ts and player_id = app.my_player_id() and left_on is null)
$$;
-- a task's player must be in the event's team
create or replace function app.event_task_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.player_id is not null and not exists (select 1 from team_players where team_season_id = app.task_ts(new.match_id, new.session_id) and player_id = new.player_id and left_on is null) then
    raise exception 'the player is not in this team' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists event_task_guard on event_tasks;
create trigger event_task_guard before insert or update on event_tasks for each row execute function app.event_task_guard();

alter table event_tasks enable row level security;
revoke all on event_tasks from anon;
drop policy if exists team_read on event_tasks;
create policy team_read on event_tasks for select to authenticated
  using (app.is_admin() or app.coaches_ts(app.task_ts(match_id, session_id)) or app.in_team_now(app.task_ts(match_id, session_id)));
drop policy if exists staff_write on event_tasks;
create policy staff_write on event_tasks for all to authenticated
  using (app.is_admin() or app.coaches_ts(app.task_ts(match_id, session_id)))
  with check (app.is_admin() or app.coaches_ts(app.task_ts(match_id, session_id)));
drop trigger if exists audit on event_tasks;
create trigger audit after insert or update or delete on event_tasks for each row execute function app.audit();

-- "I'll do it": a player of the team takes an open task of an event that has not started
create or replace function public.claim_event_task(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_player uuid := app.my_player_id(); k event_tasks; v_start timestamptz;
begin
  if v_player is null or not app.is_active() then raise exception 'members only' using errcode = '42501'; end if;
  select * into k from event_tasks where id = p_task for update;
  if k.id is null or not app.in_team_now(app.task_ts(k.match_id, k.session_id)) then raise exception 'not your team' using errcode = '42501'; end if;
  select coalesce((select kickoff_at from matches where id = k.match_id), (select starts_at from training_sessions where id = k.session_id)) into v_start;
  if v_start <= now() then raise exception 'the event has started' using errcode = '22023'; end if;
  if k.player_id is not null then raise exception 'already taken' using errcode = '23505'; end if;
  update event_tasks set player_id = v_player where id = p_task;
end $$;
revoke all on function public.claim_event_task(uuid) from public, anon;
grant execute on function public.claim_event_task(uuid) to authenticated;

-- "I can't do it": a player gives back their own task (it is open again) before the event starts
create or replace function public.release_event_task(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_player uuid := app.my_player_id(); k event_tasks; v_start timestamptz;
begin
  select * into k from event_tasks where id = p_task for update;
  if k.id is null or v_player is null or k.player_id is distinct from v_player then raise exception 'not your task' using errcode = '42501'; end if;
  select coalesce((select kickoff_at from matches where id = k.match_id), (select starts_at from training_sessions where id = k.session_id)) into v_start;
  if v_start <= now() then raise exception 'the event has started' using errcode = '22023'; end if;
  update event_tasks set player_id = null where id = p_task;
end $$;
revoke all on function public.release_event_task(uuid) from public, anon;
grant execute on function public.release_event_task(uuid) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.53.0','feature','Game-day and training tasks, menu icons',
  'Coaches add tasks to a game or training (balls, water, first-aid kit, washing the kit, driving…), give them to players or leave them open; players take open tasks in their calendar. Coaches and admins can add new tasks. The Admin, Coach and Player menus have icons.','2026-11-20')
on conflict (version) do nothing;


-- ===== 20260101000063_season_invoices.sql =====
-- 0063 Past-season invoices (release 0.54.0). Safe to run again.
-- Admin → Finance → Past seasons: bill players for a season afterwards. The admin picks the season, the first and last
-- month (e.g. January–October 2025), the monthly fee, the invoice date, the due date and the players; each player gets
-- one invoice with one line per month (like the automatic invoices), marked as a season invoice of that season. A player
-- who already has a season invoice for any of those months is skipped, so running it twice bills nobody twice.
-- mark_invoices_paid() records several invoices as paid in full at once (through record_invoice_payment, 0056).
-- Players see these invoices like any other (Membership → My payments) and they count in Finance → Balances.

create or replace function public.create_season_invoices(p_season uuid, p_from date, p_to date, p_monthly_cents int, p_players uuid[],
  p_due date, p_issue date default null, p_description text default 'Membership fees')
returns table (created int, skipped int)
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Europe/Helsinki')::date;
  v_from date := date_trunc('month', p_from)::date; v_to date := date_trunc('month', p_to)::date;
  v_months int; v_desc text := btrim(coalesce(p_description, '')); v_issue date := coalesce(p_issue, (now() at time zone 'Europe/Helsinki')::date);
  v_player uuid; v_pay uuid; i int; n int := 0; s int := 0;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if not exists (select 1 from seasons where id = p_season) then raise exception 'unknown season' using errcode = '22023'; end if;
  if v_from is null or v_to is null or v_to < v_from then raise exception 'the last month is before the first' using errcode = '22023'; end if;
  v_months := (extract(year from v_to) - extract(year from v_from))::int * 12 + (extract(month from v_to) - extract(month from v_from))::int + 1;
  if v_months > 24 then raise exception 'at most 24 months' using errcode = '22023'; end if;
  if p_monthly_cents is null or p_monthly_cents < 1 or p_monthly_cents > 100000 then raise exception 'monthly fee between EUR 0.01 and 1000' using errcode = '22023'; end if;
  if p_due is null or p_due < v_today - 365 or p_due > v_today + 365 then raise exception 'due date within a year' using errcode = '22023'; end if;
  if v_issue > v_today or v_issue < v_today - 3650 or v_issue > p_due then raise exception 'invoice date: not in the future, not after the due date' using errcode = '22023'; end if;
  if char_length(v_desc) not between 3 and 60 then raise exception 'description 3–60 characters' using errcode = '22023'; end if;
  if p_players is null or cardinality(p_players) not between 1 and 300 then raise exception '1 to 300 players' using errcode = '22023'; end if;

  foreach v_player in array (select array_agg(distinct x) from unnest(p_players) x) loop
    if not exists (select 1 from players where id = v_player) then raise exception 'unknown player' using errcode = '22023'; end if;
    -- already billed for one of these months of this season: skipped
    if exists (select 1 from payments p join payment_lines l on l.payment_id = p.id
               where p.player_id = v_player and p.season_id = p_season and p.notes = 'season invoice' and p.status <> 'refunded'
                 and l.line_date between v_from and v_to) then
      s := s + 1; continue;
    end if;
    insert into payments (player_id, amount_cents, method, status, due_on, invoice_sent_at, notes, season_id, recorded_by)
    values (v_player, p_monthly_cents * v_months, 'invoice', 'pending', p_due,
            case when v_issue = v_today then now() else (v_issue + time '12:00') at time zone 'Europe/Helsinki' end,
            'season invoice', p_season, auth.uid())
    returning id into v_pay;
    for i in 0 .. v_months - 1 loop
      insert into payment_lines (payment_id, position, description, line_date, unit_price_cents, kind)
      values (v_pay, i + 1, v_desc, (v_from + make_interval(months => i))::date, p_monthly_cents, 'fee');
    end loop;
    n := n + 1;
  end loop;
  return query select n, s;
end $$;
revoke all on function public.create_season_invoices(uuid, date, date, int, uuid[], date, date, text) from public, anon;
grant execute on function public.create_season_invoices(uuid, date, date, int, uuid[], date, date, text) to authenticated;

-- Several invoices paid in full on one day (what is still owed on each); invoices already paid are left as they are.
create or replace function public.mark_invoices_paid(p_payments uuid[], p_paid_on date default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int := 0;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_payments is null or cardinality(p_payments) not between 1 and 300 then raise exception '1 to 300 invoices' using errcode = '22023'; end if;
  foreach v_id in array (select array_agg(distinct x) from unnest(p_payments) x) loop
    if exists (select 1 from payments where id = v_id and status in ('pending', 'failed') and amount_cents > paid_cents) then
      perform public.record_invoice_payment(v_id, null, p_paid_on, 'marked paid with others');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.mark_invoices_paid(uuid[], date) from public, anon;
grant execute on function public.mark_invoices_paid(uuid[], date) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.54.0','feature','Past-season invoices',
  'Admin → Finance → Past seasons: bill chosen players for a season afterwards (first and last month, monthly fee, invoice and due date): one invoice per player with a line per month. Mark several as paid at once and see what is paid and still owed per player. Players see these invoices on their page.','2026-11-20')
on conflict (version) do nothing;


-- ===== 20260101000064_content_assistant.sql =====
-- 0064 Content assistant, step 1 (release 0.55.0). Safe to run again.
-- The app finds topics in the club's own data (match reports, previews, events, new players and sponsors, a monthly
-- recap), Claude drafts the website article (English, Finnish, French, Arabic) and the social media posts (English +
-- Finnish), and an approver checks, edits and approves. Approving publishes the article on the website and queues the
-- Facebook / Instagram / TikTok posts; they wait until the platforms are connected (step 2 and 3).
-- Approvers: admins and the club's communications people (content_editors). They also write news by hand.
-- Only facts from the app go to Claude: names only of players who agreed to be shown publicly (players.show_publicly).

-- ---------- who may publish ----------
create table if not exists content_editors (
  profile_id uuid primary key references profiles(id) on delete cascade,
  added_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table content_editors enable row level security;
revoke all on content_editors from anon;
drop policy if exists admin_all on content_editors;
create policy admin_all on content_editors for all to authenticated using (app.is_admin()) with check (app.is_admin());
drop policy if exists self_read on content_editors;
create policy self_read on content_editors for select to authenticated using (profile_id = auth.uid());
drop trigger if exists audit on content_editors;
create trigger audit after insert or update or delete on content_editors for each row execute function app.audit();

create or replace function app.can_publish() returns boolean language sql stable security definer set search_path = public as $$
  select app.is_admin() or (app.is_active() and exists (select 1 from content_editors where profile_id = auth.uid()))
$$;
grant execute on function app.can_publish() to authenticated;
create or replace function public.can_publish() returns boolean language sql stable security definer set search_path = public as $$ select app.can_publish() $$;
revoke all on function public.can_publish() from public, anon;
grant execute on function public.can_publish() to authenticated;

-- communications people write and publish news too (admins already can: admin_all, 0008)
drop policy if exists editor_all on news_posts;
create policy editor_all on news_posts for all to authenticated using (app.can_publish()) with check (app.can_publish());

-- ---------- suggestions ----------
create table if not exists article_suggestions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('match_report', 'match_preview', 'event', 'new_player', 'new_sponsor', 'monthly_recap')),
  source_key text not null unique check (char_length(source_key) between 3 and 120),   -- e.g. match_report:<match id>: one suggestion per topic
  facts jsonb not null,                                                                -- exactly what Claude was given
  status text not null default 'new' check (status in ('new', 'approved', 'rejected')),
  title text not null check (char_length(title) between 3 and 160),
  excerpt text check (excerpt is null or char_length(excerpt) <= 300),
  body_md text not null check (char_length(body_md) between 20 and 20000),
  translations jsonb not null default '{}' check (app.valid_translations(translations)),
  social jsonb not null default '{}' check (jsonb_typeof(social) = 'object'),        -- {facebook, instagram, tiktok}: bilingual captions
  checks text[] not null default '{}',                                                 -- what the approver should verify
  post_at timestamptz,                                                                 -- suggested time for the social posts
  model text,
  news_post_id uuid references news_posts(id) on delete set null,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists article_suggestions_status on article_suggestions (status, created_at desc);
alter table article_suggestions enable row level security;
revoke all on article_suggestions from anon;
drop policy if exists publishers_all on article_suggestions;
create policy publishers_all on article_suggestions for all to authenticated using (app.can_publish()) with check (app.can_publish());
drop trigger if exists audit on article_suggestions;
create trigger audit after insert or update or delete on article_suggestions for each row execute function app.audit();

-- ---------- social media posts ----------
create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  news_post_id uuid not null references news_posts(id) on delete cascade,
  suggestion_id uuid references article_suggestions(id) on delete set null,
  platform text not null check (platform in ('facebook', 'instagram', 'tiktok')),
  caption text not null check (char_length(caption) between 1 and 2200),
  status text not null default 'waiting' check (status in ('waiting', 'scheduled', 'posted', 'failed', 'cancelled')),
  post_at timestamptz,
  external_url text check (external_url is null or external_url ~ '^https://'),
  error text check (error is null or char_length(error) <= 500),
  attempts int not null default 0,
  posted_at timestamptz,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists social_posts_one_per_platform on social_posts (news_post_id, platform) where status <> 'cancelled';
alter table social_posts enable row level security;
revoke all on social_posts from anon;
drop policy if exists publishers_all on social_posts;
create policy publishers_all on social_posts for all to authenticated using (app.can_publish()) with check (app.can_publish());
drop trigger if exists audit on social_posts;
create trigger audit after insert or update or delete on social_posts for each row execute function app.audit();

-- ---------- topics found in the club's data ----------
-- A player's name only if they agreed to be shown publicly; otherwise null (the article says "a player").
create or replace function app.public_name(p uuid) returns text language sql stable security definer set search_path = public as $$
  select case when show_publicly then first_name || ' ' || last_name end from players where id = p
$$;

-- Topics not suggested yet, each with its facts. For approvers (the "Find new topics" button) and the server job.
create or replace function public.content_candidates(p_now timestamptz default now())
returns table (kind text, source_key text, facts jsonb)
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (p_now at time zone 'Europe/Helsinki')::date; v_month date := date_trunc('month', (p_now at time zone 'Europe/Helsinki')::date - interval '1 month')::date;
begin
  if not (app.can_publish() or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role') then raise exception 'publishers only' using errcode = '42501'; end if;
  return query
  with games as (
    select m.*, t.name as team, l.name as venue, l.city
    from matches m join team_seasons ts on ts.id = m.team_season_id join teams t on t.id = ts.team_id left join locations l on l.id = m.location_id
  )
  -- match reports: games finished in the last 3 days
  select 'match_report'::text, 'match_report:' || g.id, jsonb_build_object(
      'team', g.team, 'opponent', g.opponent, 'home_away', g.home_away, 'type', g.event_type, 'division', g.division,
      'kickoff', to_char(g.kickoff_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD HH24:MI'), 'venue', g.venue, 'city', g.city,
      'goals_for', g.goals_for, 'goals_against', g.goals_against,
      'our_goals', coalesce((select jsonb_agg(jsonb_build_object('minute', e.minute, 'scorer', app.public_name(e.player_id), 'assist', app.public_name(e.assist_player_id), 'type', e.type) order by e.minute)
                    from match_events e where e.match_id = g.id and not e.voided and e.side = 'us' and e.type in ('goal', 'penalty_scored')), '[]'),
      'opponent_goal_minutes', coalesce((select jsonb_agg(e.minute order by e.minute) from match_events e where e.match_id = g.id and not e.voided and e.side = 'opponent' and e.type in ('goal', 'penalty_scored', 'own_goal')), '[]'))
  from games g
  where (g.status = 'played' or g.live_state = 'full_time') and g.goals_for is not null and g.kickoff_at between p_now - interval '3 days' and p_now
    and not exists (select 1 from article_suggestions s where s.source_key = 'match_report:' || g.id)
  union all
  -- previews: games in the next 4 days
  select 'match_preview', 'match_preview:' || g.id, jsonb_build_object(
      'team', g.team, 'opponent', g.opponent, 'home_away', g.home_away, 'type', g.event_type, 'division', g.division,
      'kickoff', to_char(g.kickoff_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD HH24:MI'), 'weekday', trim(to_char(g.kickoff_at at time zone 'Europe/Helsinki', 'Day')),
      'venue', g.venue, 'city', g.city,
      'last_results', coalesce((select jsonb_agg(jsonb_build_object('opponent', p.opponent, 'score', p.goals_for || '-' || p.goals_against) order by p.kickoff_at desc)
                       from (select * from matches p where p.team_season_id = g.team_season_id and p.status = 'played' and p.kickoff_at < g.kickoff_at order by p.kickoff_at desc limit 3) p), '[]'))
  from games g
  where g.status = 'scheduled' and g.kickoff_at between p_now and p_now + interval '4 days'
    and not exists (select 1 from article_suggestions s where s.source_key = 'match_preview:' || g.id)
  union all
  -- new public club events still to come
  select 'event', 'event:' || e.id, jsonb_build_object('title', e.title, 'kind', e.kind, 'description', e.description,
      'starts', to_char(e.starts_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD HH24:MI'), 'ends', to_char(e.ends_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD HH24:MI'),
      'place', l.name, 'city', l.city, 'for', coalesce(t.name, 'the whole club'))
  from club_events e left join locations l on l.id = e.location_id left join team_seasons ts on ts.id = e.team_season_id left join teams t on t.id = ts.team_id
  where e.public and e.status = 'scheduled' and e.created_at > p_now - interval '7 days' and e.starts_at > p_now
    and not exists (select 1 from article_suggestions s where s.source_key = 'event:' || e.id)
  union all
  -- new players: contracts countersigned in the last 14 days, players shown publicly only
  select 'new_player', 'new_player:' || k.id, jsonb_build_object('name', pl.first_name || ' ' || pl.last_name, 'position', pl.position, 'contract_years', k.years,
      'contract_starts', k.starts_on, 'team', (select t.name from team_players tp join team_seasons ts on ts.id = tp.team_season_id join teams t on t.id = ts.team_id
                                               where tp.player_id = pl.id and tp.left_on is null order by tp.created_at desc limit 1))
  from player_contracts k join players pl on pl.id = k.player_id
  where k.status = 'active' and k.club_signed_at > p_now - interval '14 days' and pl.show_publicly
    and not exists (select 1 from article_suggestions s where s.source_key = 'new_player:' || k.id)
  union all
  -- new sponsors (last 30 days)
  select 'new_sponsor', 'new_sponsor:' || sp.id, jsonb_build_object('name', sp.name, 'tier', sp.tier, 'description', sp.description, 'website', sp.website_url)
  from sponsors sp
  where sp.active and sp.created_at > p_now - interval '30 days'
    and not exists (select 1 from article_suggestions s where s.source_key = 'new_sponsor:' || sp.id)
  union all
  -- monthly recap of last month, offered on the 1st–5th
  select 'monthly_recap', 'monthly_recap:' || to_char(v_month, 'YYYY-MM'), jsonb_build_object(
      'month', to_char(v_month, 'YYYY-MM'),
      'games', coalesce((select jsonb_agg(jsonb_build_object('date', to_char(m.kickoff_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD'), 'team', t.name, 'opponent', m.opponent,
                          'home_away', m.home_away, 'score', m.goals_for || '-' || m.goals_against) order by m.kickoff_at)
                 from matches m join team_seasons ts on ts.id = m.team_season_id join teams t on t.id = ts.team_id
                 where m.status = 'played' and (m.kickoff_at at time zone 'Europe/Helsinki')::date >= v_month and (m.kickoff_at at time zone 'Europe/Helsinki')::date < (v_month + interval '1 month')::date), '[]'),
      'events', coalesce((select jsonb_agg(e.title order by e.starts_at) from club_events e where e.public and e.status = 'scheduled'
                 and (e.starts_at at time zone 'Europe/Helsinki')::date >= v_month and (e.starts_at at time zone 'Europe/Helsinki')::date < (v_month + interval '1 month')::date), '[]'),
      'new_players', (select count(*) from player_contracts k where k.status = 'active' and (k.club_signed_at at time zone 'Europe/Helsinki')::date >= v_month
                 and (k.club_signed_at at time zone 'Europe/Helsinki')::date < (v_month + interval '1 month')::date))
  where extract(day from v_today) <= 5
    and exists (select 1 from matches m where m.status = 'played' and (m.kickoff_at at time zone 'Europe/Helsinki')::date >= v_month and (m.kickoff_at at time zone 'Europe/Helsinki')::date < (v_month + interval '1 month')::date)
    and not exists (select 1 from article_suggestions s where s.source_key = 'monthly_recap:' || to_char(v_month, 'YYYY-MM'));
end $$;
revoke all on function public.content_candidates(timestamptz) from public, anon;
grant execute on function public.content_candidates(timestamptz) to authenticated, service_role;

-- ---------- approve: publish the article and queue the social posts ----------
create or replace function app.slugify(p text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(translate(coalesce(p, ''), 'ÄÖÅäöåÉÈÊéèêÇçÜüÏïÔô', 'AOAaoaEEEeeeCcUuIiOo')), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.approve_suggestion(p_id uuid, p_post_at timestamptz, p_platforms text[], p_captions jsonb default null, p_site_url text default 'https://www.afrofoot.club') returns uuid
language plpgsql security definer set search_path = public as $$
declare s article_suggestions; v_slug text; v_base text; v_post uuid; v_p text; v_cap text; n int := 1;
begin
  if not app.can_publish() then raise exception 'publishers only' using errcode = '42501'; end if;
  select * into s from article_suggestions where id = p_id for update;
  if s.id is null or s.status <> 'new' then raise exception 'not an open suggestion' using errcode = '22023'; end if;
  if p_post_at is not null and (p_post_at < now() - interval '1 hour' or p_post_at > now() + interval '60 days') then raise exception 'posting time: from now to 60 days ahead' using errcode = '22023'; end if;
  if p_platforms is null or not (p_platforms <@ array['facebook', 'instagram', 'tiktok']) then raise exception 'unknown platform' using errcode = '22023'; end if;
  v_base := left(coalesce(nullif(app.slugify(s.title), ''), 'news'), 70);
  v_slug := v_base;
  while exists (select 1 from news_posts where slug = v_slug) loop n := n + 1; v_slug := v_base || '-' || n; end loop;
  insert into news_posts (slug, title, excerpt, body_md, status, published_at, author_id, translations)
  values (v_slug, s.title, s.excerpt, s.body_md, 'published', now(), auth.uid(), s.translations)
  returning id into v_post;
  foreach v_p in array (select array_agg(distinct x) from unnest(p_platforms) x where x is not null) loop
    v_cap := coalesce(nullif(btrim(p_captions ->> v_p), ''), nullif(btrim(s.social ->> v_p), ''));
    if v_cap is null then raise exception 'caption missing for %', v_p using errcode = '22023'; end if;
    -- the article's address replaces {link} (Instagram and TikTok captions say "link in bio" instead)
    v_cap := replace(v_cap, '{link}', rtrim(coalesce(nullif(p_site_url, ''), 'https://www.afrofoot.club'), '/') || '/news/' || v_slug);
    insert into social_posts (news_post_id, suggestion_id, platform, caption, status, post_at)
    values (v_post, s.id, v_p, left(v_cap, 2200), 'waiting', coalesce(p_post_at, now()));
  end loop;
  update article_suggestions set status = 'approved', news_post_id = v_post, decided_by = auth.uid(), decided_at = now(), post_at = coalesce(p_post_at, post_at), updated_at = now() where id = s.id;
  return v_post;
end $$;
drop function if exists public.approve_suggestion(uuid, timestamptz, text[], jsonb);
revoke all on function public.approve_suggestion(uuid, timestamptz, text[], jsonb, text) from public, anon;
grant execute on function public.approve_suggestion(uuid, timestamptz, text[], jsonb, text) to authenticated;

-- default posting time: the best time for each kind of post (the app works it out); or a fixed time, e.g. "18:00"
insert into site_settings (key, value, is_public) values ('content', '{"post_time": "best"}', true) on conflict (key) do nothing;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.55.0','feature','Content assistant (step 1): suggested articles',
  'The app finds topics in the club''s data (match reports, previews, events, new players and sponsors, a monthly recap) and drafts the article in four languages and the social media posts in English and Finnish. Admins and the communications people check, edit and approve: the article is published on the website and the Facebook, Instagram and TikTok posts wait for the platform connections. News can also be written by hand.','2026-11-20')
on conflict (version) do nothing;


-- ===== 20260101000065_merge_accounts.sql =====
-- 0065 Merge accounts: when one person has two accounts (signed up twice, e.g. once with an email and once with a phone
-- number), an administrator merges them into one. Everything of the removed account moves to the one kept: its player
-- record (teams, games, trainings, invoices and payments, contracts, shirt numbers, tasks, votes…), its coach record,
-- consents, notifications and sign-in log, and every "done by" mark. Where both have a row for the same thing (the same
-- game, training, season…), the kept account's row stays and the other one is dropped; empty fields of the kept
-- account are filled from the other one. Then the removed login is deleted. Each merge is logged (account_merges).
--
-- Only administrators; only a super administrator merges an administrator's account. The two accounts must share an
-- email address or a phone number (account, or the player's contact details), so two different people are not merged
-- by mistake. An administrator cannot merge away their own account.

-- the contact details of an account, in one comparable form: emails in lower case, phones as + and digits
create or replace function app.account_contacts(p_profile uuid) returns setof text language sql stable security definer set search_path = public as $$
  select distinct c from (
    select lower(p.email::text) as c from profiles p where p.id = p_profile
    union all select '+' || regexp_replace(p.phone, '\D', '', 'g') from profiles p where p.id = p_profile
    union all select lower(pp.email::text) from player_private pp join players pl on pl.id = pp.player_id where pl.profile_id = p_profile
    union all select '+' || regexp_replace(pp.phone, '\D', '', 'g') from player_private pp join players pl on pl.id = pp.player_id where pl.profile_id = p_profile
  ) x where c is not null and c not in ('', '+')
$$;
revoke all on function app.account_contacts(uuid) from public;

-- Possible duplicates for Admin → People → Merge accounts: pairs of accounts that share an email or phone (admins only).
create or replace function public.duplicate_accounts() returns table (a uuid, b uuid, shared text) language sql stable security definer set search_path = public as $$
  with c as (select p.id, x.c from profiles p cross join lateral app.account_contacts(p.id) as x(c))
  select c1.id, c2.id, min(c1.c) from c c1 join c c2 on c2.c = c1.c and c2.id > c1.id
  where app.is_admin() group by c1.id, c2.id order by 1, 2
$$;
revoke all on function public.duplicate_accounts() from public, anon;
grant execute on function public.duplicate_accounts() to authenticated;

create table if not exists account_merges (
  id uuid primary key default gen_random_uuid(),
  kept_profile_id uuid references profiles(id) on delete set null,
  removed_profile_id uuid not null,                -- the login no longer exists
  removed_name text not null,
  removed_email text,
  removed_phone text,
  shared text not null,                            -- the email or phone the two had in common
  moved jsonb not null default '{}',               -- rows moved per table
  merged_by uuid references profiles(id) on delete set null default auth.uid(),
  merged_at timestamptz not null default now()
);
alter table account_merges enable row level security;
revoke all on account_merges from anon;
drop policy if exists admin_read on account_merges;
create policy admin_read on account_merges for select to authenticated using (app.is_admin());
-- no insert/update/delete policies: rows are written only by merge_accounts()
drop trigger if exists audit on account_merges;
create trigger audit after insert or update or delete on account_merges for each row execute function app.audit();

create or replace function public.merge_accounts(p_keep uuid, p_remove uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k profiles; r profiles; kp uuid; rp uuid; ks uuid; rs uuid; shared text; moved jsonb := '{}'; n int;
  pk player_private; pr player_private; mk player_medical; mr player_medical;
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_keep is null or p_remove is null or p_keep = p_remove then raise exception 'choose two different accounts' using errcode = '22023'; end if;
  if p_remove = auth.uid() then raise exception 'you cannot merge away your own account' using errcode = '42501'; end if;
  select * into k from profiles where id = p_keep for update;
  select * into r from profiles where id = p_remove for update;
  if k.id is null or r.id is null then raise exception 'account not found' using errcode = 'P0002'; end if;
  if (k.role in ('super_admin', 'club_admin') or r.role in ('super_admin', 'club_admin')) and not app.is_super() then
    raise exception 'only a super administrator merges an administrator''s account' using errcode = '42501';
  end if;
  select min(c) into shared from app.account_contacts(p_keep) c where c in (select app.account_contacts(p_remove));
  if shared is null then raise exception 'the accounts share no email or phone number' using errcode = '22023'; end if;

  select id into kp from players where profile_id = p_keep;
  select id into rp from players where profile_id = p_remove;
  select id into ks from staff_members where profile_id = p_keep;
  select id into rs from staff_members where profile_id = p_remove;

  -- ===== the player record =====
  if rp is not null and kp is null then
    update players set profile_id = p_keep, updated_at = now() where id = rp;
    moved := moved || jsonb_build_object('player', 1);
  elsif rp is not null then
    -- one row per game / training / season / team: keep the kept player's, drop the other's
    delete from team_players x using team_players y where x.player_id = rp and y.player_id = kp and y.team_season_id = x.team_season_id;
    update team_players set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('team_players', n);
    delete from match_availability x using match_availability y where x.player_id = rp and y.player_id = kp and y.match_id = x.match_id;
    update match_availability set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('match_availability', n);
    delete from session_attendance x using session_attendance y where x.player_id = rp and y.player_id = kp and y.session_id = x.session_id;
    update session_attendance set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('session_attendance', n);
    delete from match_squad x using match_squad y where x.player_id = rp and y.player_id = kp and y.match_id = x.match_id;
    update match_squad set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('match_squad', n);
    delete from match_player_stats x using match_player_stats y where x.player_id = rp and y.player_id = kp and y.match_id = x.match_id;
    update match_player_stats set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('match_player_stats', n);
    delete from mvp_votes x using mvp_votes y where x.voter_player_id = rp and y.voter_player_id = kp and y.match_id = x.match_id;
    update mvp_votes set voter_player_id = kp where voter_player_id = rp;
    update mvp_votes set candidate_player_id = kp where candidate_player_id = rp;
    delete from jersey_requests x using jersey_requests y where x.player_id = rp and x.status = 'pending' and y.player_id = kp and y.status = 'pending' and y.team_season_id = x.team_season_id;
    update jersey_requests set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('jersey_requests', n);
    -- a season membership both have: the invoices of the other one move to the kept membership
    update payments pay set membership_id = y.id from memberships x join memberships y on y.player_id = kp and y.season_id = x.season_id
      where x.player_id = rp and pay.membership_id = x.id;
    delete from memberships x using memberships y where x.player_id = rp and y.player_id = kp and y.season_id = x.season_id;
    update memberships set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('memberships', n);
    update payments set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('payments', n);
    update player_contracts set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('player_contracts', n);
    update player_enrolments set player_id = kp where player_id = rp;
    update player_ratings set player_id = kp where player_id = rp;
    update evaluations set player_id = kp where player_id = rp;
    update development_goals set player_id = kp where player_id = rp;
    update event_tasks set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('event_tasks', n);
    update match_events set player_id = kp where player_id = rp;
    update match_events set assist_player_id = kp where assist_player_id = rp;
    update match_events set player_out_id = kp where player_out_id = rp;
    update match_rotation_plan set player_on_id = kp where player_on_id = rp;
    update match_rotation_plan set player_off_id = kp where player_off_id = rp;
    if exists (select 1 from federation_players where player_id = kp) then update federation_players set player_id = null where player_id = rp;
    else update federation_players set player_id = kp where player_id = rp; end if;
    -- contact and medical details: fill the kept player's empty fields
    select * into pk from player_private where player_id = kp; select * into pr from player_private where player_id = rp;
    if pr.id is not null and pk.id is null then update player_private set player_id = kp where id = pr.id;
    elsif pr.id is not null then
      update player_private set phone = coalesce(phone, pr.phone), email = coalesce(email, pr.email), address = coalesce(address, pr.address), city = coalesce(city, pr.city),
        emergency_name = coalesce(emergency_name, pr.emergency_name), emergency_phone = coalesce(emergency_phone, pr.emergency_phone),
        emergency_relation = coalesce(emergency_relation, pr.emergency_relation), updated_at = now() where id = pk.id;
      delete from player_private where id = pr.id;
    end if;
    select * into mk from player_medical where player_id = kp; select * into mr from player_medical where player_id = rp;
    if mr.player_id is not null and mk.player_id is null then update player_medical set player_id = kp where player_id = rp;
    elsif mr.player_id is not null then delete from player_medical where player_id = rp; end if;
    update players k2 set date_of_birth = coalesce(k2.date_of_birth, r2.date_of_birth), nationality = coalesce(k2.nationality, r2.nationality),
      position = coalesce(k2.position, r2.position), secondary_position = coalesce(k2.secondary_position, r2.secondary_position),
      preferred_foot = coalesce(k2.preferred_foot, r2.preferred_foot), height_cm = coalesce(k2.height_cm, r2.height_cm), weight_kg = coalesce(k2.weight_kg, r2.weight_kg),
      bio = coalesce(k2.bio, r2.bio), photo_path = coalesce(k2.photo_path, r2.photo_path), joined_on = least(k2.joined_on, r2.joined_on),
      profile_completed_at = coalesce(k2.profile_completed_at, r2.profile_completed_at), updated_at = now()
      from players r2 where k2.id = kp and r2.id = rp;
    delete from players where id = rp;
    moved := moved || jsonb_build_object('player', 1);
  end if;

  -- ===== the coach record =====
  if rs is not null and ks is null then update staff_members set profile_id = p_keep, updated_at = now() where id = rs;
  elsif rs is not null then
    delete from team_staff x using team_staff y where x.staff_id = rs and y.staff_id = ks and y.team_season_id = x.team_season_id;
    update team_staff set staff_id = ks where staff_id = rs;
    delete from staff_members where id = rs;
  end if;

  -- ===== the account's own rows =====
  delete from conduct_consents x using conduct_consents y where x.profile_id = p_remove and y.profile_id = p_keep and y.version_id = x.version_id;
  update conduct_consents set profile_id = p_keep where profile_id = p_remove;
  if exists (select 1 from content_editors where profile_id = p_keep) then delete from content_editors where profile_id = p_remove;
  else update content_editors set profile_id = p_keep where profile_id = p_remove; end if;
  update notifications set user_id = p_keep where user_id = p_remove;
  update signin_events set profile_id = p_keep where profile_id = p_remove;
  update email_outbox set profile_id = p_keep where profile_id = p_remove;
  -- "done by" marks
  update announcements set created_by = p_keep where created_by = p_remove;
  update app_releases set released_by = p_keep where released_by = p_remove;
  update article_suggestions set decided_by = p_keep where decided_by = p_remove;
  update club_events set created_by = p_keep where created_by = p_remove;
  update contact_messages set handled_by = p_keep where handled_by = p_remove;
  update content_editors set added_by = p_keep where added_by = p_remove;
  update content_revisions set changed_by = p_keep where changed_by = p_remove;
  update development_goals set created_by = p_keep where created_by = p_remove;
  update evaluations set evaluator_id = p_keep where evaluator_id = p_remove;
  update event_tasks set created_by = p_keep where created_by = p_remove;
  update expenses set recorded_by = p_keep where recorded_by = p_remove;
  update invoice_requests set handled_by = p_keep where handled_by = p_remove;
  update jersey_requests set decided_by = p_keep where decided_by = p_remove;
  update join_requests set reviewed_by = p_keep where reviewed_by = p_remove;
  update lineup_templates set created_by = p_keep where created_by = p_remove;
  update locations set created_by = p_keep where created_by = p_remove;
  update match_events set created_by = p_keep where created_by = p_remove;
  update match_events set voided_by = p_keep where voided_by = p_remove;
  update matches set created_by = p_keep where created_by = p_remove;
  update news_posts set author_id = p_keep where author_id = p_remove;
  update opponents set created_by = p_keep where created_by = p_remove;
  update pages set updated_by = p_keep where updated_by = p_remove;
  update payment_receipts set recorded_by = p_keep where recorded_by = p_remove;
  update payments set recorded_by = p_keep where recorded_by = p_remove;
  update player_contracts set club_signed_by = p_keep where club_signed_by = p_remove;
  update player_contracts set created_by = p_keep where created_by = p_remove;
  update player_enrolments set reviewed_by = p_keep where reviewed_by = p_remove;
  update player_ratings set rated_by = p_keep where rated_by = p_remove;
  update session_attendance set marked_by = p_keep where marked_by = p_remove;
  update social_posts set created_by = p_keep where created_by = p_remove;
  update task_types set created_by = p_keep where created_by = p_remove;
  update training_programs set created_by = p_keep where created_by = p_remove;
  update training_schedules set created_by = p_keep where created_by = p_remove;
  update training_sessions set created_by = p_keep where created_by = p_remove;
  update tryout_requests set reviewed_by = p_keep where reviewed_by = p_remove;
  update account_merges set kept_profile_id = p_keep where kept_profile_id = p_remove;
  update account_merges set merged_by = p_keep where merged_by = p_remove;

  -- the kept account's empty fields; an active account stays active when the kept one was still waiting
  update profiles set phone = coalesce(phone, r.phone),
    avatar_path = coalesce(avatar_path, r.avatar_path),
    status = case when status = 'pending' and r.status = 'active' then 'active' else status end, updated_at = now()
    where id = p_keep;

  insert into account_merges (kept_profile_id, removed_profile_id, removed_name, removed_email, removed_phone, shared, moved)
    values (p_keep, p_remove, trim(r.first_name || ' ' || r.last_name), r.email::text, r.phone, shared, moved);
  -- the removed login (its profile goes with it)
  delete from auth.users where id = p_remove;
  return moved || jsonb_build_object('shared', shared);
end $$;
revoke all on function public.merge_accounts(uuid, uuid) from public, anon;
grant execute on function public.merge_accounts(uuid, uuid) to authenticated;


-- ===== 20260101000066_coach_requests.sql =====
-- 0066 Coaches see tryout requests and team enrolments (read only). Coaches and player-coaches (app.is_coach) get the
-- details they need to plan a tryout and welcome a new player: name, birth date, position, previous team, Palloliitto
-- link, contact and guardian details, the message, the status and the tryout date. Not the home address, payment
-- choice, consents or the admins' internal note. The tables stay admins-only (RLS admin_all); this function is the
-- coaches' only way in, and it changes nothing. Admins still handle the requests (Admin → Requests).
create or replace function public.coach_requests(p_all boolean default false)
returns table (kind text, id uuid, created_at timestamptz, status text, first_name text, last_name text, date_of_birth date,
  email text, phone text, "position" text, nationality text, previous_team text, palloliitto_url text, guardian_name text,
  guardian_phone text, message text, tryout_on date, plan text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'tryout'::text, r.id, r.created_at, r.status::text, r.first_name, r.last_name, r.date_of_birth, r.email::text, r.phone,
      r.position::text, null::text, r.previous_team, r.palloliitto_url, r.guardian_name, r.guardian_phone, r.message, r.tryout_on, null::text
    from tryout_requests r where p_all or r.status::text in ('new', 'in_review', 'accepted')
    union all
    select 'enrolment', e.id, e.created_at, e.status::text, e.first_name, e.last_name, e.date_of_birth, e.email::text, e.phone,
      e.position::text, e.nationality, e.previous_team, e.palloliitto_url, e.guardian_name, e.guardian_phone, null, null, mp.name
    from player_enrolments e left join membership_plans mp on mp.id = e.plan_id where p_all or e.status::text in ('new', 'in_review', 'accepted')
  ) x where app.is_coach() or app.is_admin()
  order by 3 desc
  limit 300
$$;
revoke all on function public.coach_requests(boolean) from public, anon;
grant execute on function public.coach_requests(boolean) to authenticated;


-- ===== 20260101000067_duplicate_accounts.sql =====
-- 0067 Duplicate accounts: delete a duplicate that has no history, and tell the club when one is created.
-- When a person signs up a second time (once with an email, once with a phone number), 0065 lets an administrator merge
-- the two. This adds:
--  * delete_account(profile): an administrator deletes an account that has no history (no teams, games, trainings,
--    invoices, contracts, shirt numbers or tasks), e.g. a second account made by mistake. An account with history is
--    refused: merge it instead, so nothing is lost. Same rules as merging: admins only, only a super administrator for
--    an administrator's account, never your own. Logged in account_merges (action 'delete') and the audit trail.
--  * an email to the club (the request-alert address) when a new account shares an email or phone number with another,
--    with a link to Admin → People → Merge accounts. The sign-up form itself never says whether an account exists.

alter table account_merges add column if not exists action text not null default 'merge';
alter table account_merges drop constraint if exists account_merges_action_check;
alter table account_merges add constraint account_merges_action_check check (action in ('merge', 'delete'));
alter table account_merges alter column shared drop not null;

-- Works on every installed version of the database: a table or column that is not there (an older install, e.g.
-- without player contracts) is simply skipped. 0065's merge_accounts is replaced the same way below.
create or replace function app.has_column(p_table text, p_col text) returns boolean language sql stable as $$
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = p_col)
$$;

-- true when p_table has a row whose p_col is one of p_ids (and p_where holds); false when the table or column is missing
create or replace function app.has_rows(p_table text, p_col text, p_ids uuid[], p_where text default 'true') returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v boolean;
begin
  if p_ids is null or cardinality(p_ids) = 0 or not app.has_column(p_table, p_col) then return false; end if;
  execute format('select exists (select 1 from %I where %I = any($1) and (%s))', p_table, p_col, p_where) into v using p_ids;
  return v;
end $$;
revoke all on function app.has_rows(text, text, uuid[], text) from public;

-- moves p_table rows from p_from to p_to (column p_col). With p_key, a row of p_from that has the same p_key as a row
-- of p_to (and p_where, written with x = the moved row and y = the kept one) is dropped first: the kept row stays.
-- Returns the rows moved; 0 when the table or column is missing.
create or replace function app.repoint(p_table text, p_col text, p_from uuid, p_to uuid, p_key text default null, p_where text default 'true') returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_from is null or p_to is null or not app.has_column(p_table, p_col) or (p_key is not null and not app.has_column(p_table, p_key)) then return 0; end if;
  if p_key is not null then
    execute format('delete from %I x using %I y where x.%I = $1 and y.%I = $2 and y.%I is not distinct from x.%I and (%s)', p_table, p_table, p_col, p_col, p_key, p_key, p_where) using p_from, p_to;
  end if;
  execute format('update %I set %I = $2 where %I = $1', p_table, p_col, p_col) using p_from, p_to;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app.repoint(text, text, uuid, uuid, text, text) from public;

-- true when the account has anything worth keeping (then it is merged, not deleted)
create or replace function app.account_has_history(p_profile uuid) returns boolean language plpgsql stable security definer set search_path = public as $$
declare pl uuid[] := array(select id from players where profile_id = p_profile); st uuid[] := array(select id from staff_members where profile_id = p_profile);
begin
  return app.has_rows('team_players', 'player_id', pl)
    or app.has_rows('match_availability', 'player_id', pl, 'availability::text <> ''pending''')
    or app.has_rows('session_attendance', 'player_id', pl, 'availability::text <> ''pending'' or attendance is not null')
    or app.has_rows('match_squad', 'player_id', pl) or app.has_rows('match_player_stats', 'player_id', pl)
    or app.has_rows('match_events', 'player_id', pl) or app.has_rows('match_events', 'assist_player_id', pl) or app.has_rows('match_events', 'player_out_id', pl)
    or app.has_rows('payments', 'player_id', pl) or app.has_rows('memberships', 'player_id', pl) or app.has_rows('player_contracts', 'player_id', pl)
    or app.has_rows('jersey_requests', 'player_id', pl) or app.has_rows('event_tasks', 'player_id', pl) or app.has_rows('federation_players', 'player_id', pl)
    or app.has_rows('team_staff', 'staff_id', st);
end $$;
revoke all on function app.account_has_history(uuid) from public;

-- 0065's merge, rewritten with the helpers so that it also runs where some tables are missing
create or replace function public.merge_accounts(p_keep uuid, p_remove uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k profiles; r profiles; kp uuid; rp uuid; ks uuid; rs uuid; shared text; moved jsonb := '{}'; c text; fk record;
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_keep is null or p_remove is null or p_keep = p_remove then raise exception 'choose two different accounts' using errcode = '22023'; end if;
  if p_remove = auth.uid() then raise exception 'you cannot merge away your own account' using errcode = '42501'; end if;
  select * into k from profiles where id = p_keep for update;
  select * into r from profiles where id = p_remove for update;
  if k.id is null or r.id is null then raise exception 'account not found' using errcode = 'P0002'; end if;
  if (k.role in ('super_admin', 'club_admin') or r.role in ('super_admin', 'club_admin')) and not app.is_super() then
    raise exception 'only a super administrator merges an administrator''s account' using errcode = '42501';
  end if;
  select min(x) into shared from app.account_contacts(p_keep) x where x in (select app.account_contacts(p_remove));
  if shared is null then raise exception 'the accounts share no email or phone number' using errcode = '22023'; end if;

  select id into kp from players where profile_id = p_keep;
  select id into rp from players where profile_id = p_remove;
  select id into ks from staff_members where profile_id = p_keep;
  select id into rs from staff_members where profile_id = p_remove;

  -- ===== the player record =====
  if rp is not null and kp is null then
    update players set profile_id = p_keep, updated_at = now() where id = rp;
    moved := moved || jsonb_build_object('player', 1);
  elsif rp is not null then
    -- one row per team / game / training / season: the kept player's stays
    moved := moved || jsonb_build_object('team_players', app.repoint('team_players', 'player_id', rp, kp, 'team_season_id'));
    moved := moved || jsonb_build_object('match_availability', app.repoint('match_availability', 'player_id', rp, kp, 'match_id'));
    moved := moved || jsonb_build_object('session_attendance', app.repoint('session_attendance', 'player_id', rp, kp, 'session_id'));
    moved := moved || jsonb_build_object('match_squad', app.repoint('match_squad', 'player_id', rp, kp, 'match_id'));
    moved := moved || jsonb_build_object('match_player_stats', app.repoint('match_player_stats', 'player_id', rp, kp, 'match_id'));
    perform app.repoint('mvp_votes', 'voter_player_id', rp, kp, 'match_id');
    perform app.repoint('mvp_votes', 'candidate_player_id', rp, kp);
    moved := moved || jsonb_build_object('jersey_requests', app.repoint('jersey_requests', 'player_id', rp, kp, 'team_season_id', 'x.status = ''pending'' and y.status = ''pending'''));
    -- a season membership both have: the invoices of the other one move to the kept membership
    if app.has_column('payments', 'membership_id') then
      update payments pay set membership_id = y.id from memberships x join memberships y on y.player_id = kp and y.season_id = x.season_id
        where x.player_id = rp and pay.membership_id = x.id;
    end if;
    moved := moved || jsonb_build_object('memberships', app.repoint('memberships', 'player_id', rp, kp, 'season_id'));
    moved := moved || jsonb_build_object('payments', app.repoint('payments', 'player_id', rp, kp));
    moved := moved || jsonb_build_object('player_contracts', app.repoint('player_contracts', 'player_id', rp, kp));
    moved := moved || jsonb_build_object('event_tasks', app.repoint('event_tasks', 'player_id', rp, kp));
    foreach c in array array['player_enrolments.player_id', 'player_ratings.player_id', 'evaluations.player_id', 'development_goals.player_id',
      'match_events.player_id', 'match_events.assist_player_id', 'match_events.player_out_id', 'match_rotation_plan.player_on_id', 'match_rotation_plan.player_off_id'] loop
      perform app.repoint(split_part(c, '.', 1), split_part(c, '.', 2), rp, kp);
    end loop;
    -- the Palloliitto link: at most one per player
    if app.has_column('federation_players', 'player_id') then
      if app.has_rows('federation_players', 'player_id', array[kp]) then execute 'update federation_players set player_id = null where player_id = $1' using rp;
      else perform app.repoint('federation_players', 'player_id', rp, kp); end if;
    end if;
    -- contact details: fill the kept player's empty fields, then drop the other row
    if exists (select 1 from player_private where player_id = kp) then
      update player_private k2 set phone = coalesce(k2.phone, r2.phone), email = coalesce(k2.email, r2.email), address = coalesce(k2.address, r2.address),
        city = coalesce(k2.city, r2.city), emergency_name = coalesce(k2.emergency_name, r2.emergency_name), emergency_phone = coalesce(k2.emergency_phone, r2.emergency_phone),
        emergency_relation = coalesce(k2.emergency_relation, r2.emergency_relation), updated_at = now()
        from player_private r2 where k2.player_id = kp and r2.player_id = rp;
      delete from player_private where player_id = rp;
    else update player_private set player_id = kp where player_id = rp; end if;
    if app.has_column('player_medical', 'player_id') then
      if app.has_rows('player_medical', 'player_id', array[kp]) then execute 'delete from player_medical where player_id = $1' using rp;
      else execute 'update player_medical set player_id = $2 where player_id = $1' using rp, kp; end if;
    end if;
    -- the kept player's empty details, from the other record (only columns this database has)
    foreach c in array array['date_of_birth', 'nationality', 'position', 'secondary_position', 'preferred_foot', 'height_cm', 'weight_kg', 'bio', 'photo_path', 'profile_completed_at', 'joined_on'] loop
      if app.has_column('players', c) then
        execute format('update players k2 set %I = coalesce(k2.%I, r2.%I) from players r2 where k2.id = $1 and r2.id = $2', c, c, c) using kp, rp;
      end if;
    end loop;
    delete from players where id = rp;
    moved := moved || jsonb_build_object('player', 1);
  end if;

  -- ===== the coach record =====
  if rs is not null and ks is null then update staff_members set profile_id = p_keep, updated_at = now() where id = rs;
  elsif rs is not null then
    perform app.repoint('team_staff', 'staff_id', rs, ks, 'team_season_id');
    delete from staff_members where id = rs;
  end if;

  -- ===== the account's own rows =====
  perform app.repoint('conduct_consents', 'profile_id', p_remove, p_keep, 'version_id');
  if app.has_rows('content_editors', 'profile_id', array[p_keep]) then execute 'delete from content_editors where profile_id = $1' using p_remove;
  else perform app.repoint('content_editors', 'profile_id', p_remove, p_keep); end if;
  perform app.repoint('notifications', 'user_id', p_remove, p_keep);
  perform app.repoint('signin_events', 'profile_id', p_remove, p_keep);
  perform app.repoint('email_outbox', 'profile_id', p_remove, p_keep);
  -- every "done by" mark: each column of this database that points to an account and is emptied when the account goes
  for fk in select cl.relname::text as tbl, a.attname::text as col from pg_constraint co join pg_class cl on cl.oid = co.conrelid join pg_namespace ns on ns.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = co.conrelid and a.attnum = any(co.conkey)
      where co.contype = 'f' and co.confrelid = 'public.profiles'::regclass and co.confdeltype = 'n' and ns.nspname = 'public'
        and (cl.relname::text, a.attname::text) not in (('players', 'profile_id'), ('staff_members', 'profile_id')) loop
    perform app.repoint(fk.tbl, fk.col, p_remove, p_keep);
  end loop;

  -- the kept account's empty fields; an active account stays active when the kept one was still waiting
  update profiles set phone = coalesce(phone, r.phone), avatar_path = coalesce(avatar_path, r.avatar_path),
    status = case when status = 'pending' and r.status = 'active' then 'active' else status end, updated_at = now()
    where id = p_keep;

  insert into account_merges (kept_profile_id, removed_profile_id, removed_name, removed_email, removed_phone, shared, moved)
    values (p_keep, p_remove, trim(r.first_name || ' ' || r.last_name), r.email::text, r.phone, shared, moved);
  delete from auth.users where id = p_remove;   -- the removed login (its profile goes with it)
  return moved || jsonb_build_object('shared', shared);
end $$;
revoke all on function public.merge_accounts(uuid, uuid) from public, anon;
grant execute on function public.merge_accounts(uuid, uuid) to authenticated;

-- for the admin page: which accounts can be deleted (no history)
create or replace function public.account_deletable(p_profile uuid) returns boolean language sql stable security definer set search_path = public as $$
  select app.is_admin() and not app.account_has_history(p_profile)
$$;
revoke all on function public.account_deletable(uuid) from public, anon;
grant execute on function public.account_deletable(uuid) to authenticated;

create or replace function public.delete_account(p_profile uuid) returns void language plpgsql security definer set search_path = public as $$
declare r profiles; shared text;
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_profile = auth.uid() then raise exception 'you cannot delete your own account' using errcode = '42501'; end if;
  select * into r from profiles where id = p_profile for update;
  if r.id is null then raise exception 'account not found' using errcode = 'P0002'; end if;
  if r.role in ('super_admin', 'club_admin') and not app.is_super() then
    raise exception 'only a super administrator deletes an administrator''s account' using errcode = '42501';
  end if;
  if app.account_has_history(p_profile) then raise exception 'the account has history: merge it instead' using errcode = '23503'; end if;
  select min(c) into shared from app.account_contacts(p_profile) c
    where exists (select 1 from profiles o where o.id <> p_profile and c in (select app.account_contacts(o.id)));
  insert into account_merges (action, kept_profile_id, removed_profile_id, removed_name, removed_email, removed_phone, shared)
    values ('delete', null, p_profile, trim(r.first_name || ' ' || r.last_name), r.email::text, r.phone, shared);
  -- the empty player and coach records go too (their private and medical rows, replies still pending, follow by cascade)
  delete from match_availability where player_id in (select id from players where profile_id = p_profile);
  delete from session_attendance where player_id in (select id from players where profile_id = p_profile);
  delete from players where profile_id = p_profile;
  delete from staff_members where profile_id = p_profile;
  delete from auth.users where id = p_profile;
end $$;
revoke all on function public.delete_account(uuid) from public, anon;
grant execute on function public.delete_account(uuid) to authenticated;

-- ---------- tell the club about a new duplicate ----------
-- Only where the email outbox (migration 0048) is installed; elsewhere this part is skipped and the duplicates simply
-- show on Admin → People → Merge accounts (with a count in the menu).
do $do$
begin
  if to_regclass('public.email_templates') is null or to_regclass('public.email_outbox') is null
     or to_regprocedure('app.queue_email(text,text,text,jsonb,uuid,uuid,text)') is null or to_regprocedure('app.email_setting(text)') is null then
    raise notice 'email outbox (0048) not installed: no duplicate alert email';
    return;
  end if;
  alter table email_templates drop constraint if exists email_templates_kind_check;
  alter table email_templates add constraint email_templates_kind_check check (kind in ('reminder_3d', 'reminder_last', 'approved', 'request_alert', 'label_game', 'duplicate_alert'));
  alter table email_outbox drop constraint if exists email_outbox_kind_check;
  alter table email_outbox add constraint email_outbox_kind_check check (kind in ('reminder_3d', 'reminder_last', 'approved', 'request_alert', 'duplicate_alert'));
  insert into email_templates (kind, locale, subject, body, cta) values
   ('duplicate_alert', 'en', 'Possible duplicate account: {name}', E'A new account was created with an email or phone number that another account already uses ({shared}): {name}.\n\nCompare the two and merge them (or delete the empty one) in Admin → People → Merge accounts.', 'Open Merge accounts')
  on conflict (kind, locale) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

  create or replace function app.email_on_duplicate() returns trigger language plpgsql security definer set search_path = public as $fn$
  declare v_shared text; v_to text := coalesce(app.email_setting('alert_to'), 'info@afrofoot.club');
  begin
    select min(c) into v_shared from app.account_contacts(new.id) c
      where exists (select 1 from profiles o where o.id <> new.id and c in (select app.account_contacts(o.id)));
    if v_shared is not null then
      perform app.queue_email('duplicate_alert', v_to, 'en', jsonb_build_object('name', trim(new.first_name || ' ' || new.last_name), 'shared', v_shared), new.id, null,
        coalesce(app.email_setting('app_url'), 'https://app.afrofoot.club') || '/admin/members/merge');
    end if;
    return new;
  end $fn$;
  drop trigger if exists email_on_duplicate on profiles;
  create trigger email_on_duplicate after insert or update of phone on profiles for each row execute function app.email_on_duplicate();
end $do$;


-- ===== 20260101000068_minor_contracts.sql =====
-- 0068 Contracts of players under 18: a parent or guardian signs too.
-- When the player is under 18 on the day they sign (from their birth date; when it is not known, the player says so),
-- the contract asks for a parent or guardian: name, relation, phone (with country code) and email, and the parent or
-- guardian types their own name to sign, on the same screen, together with the player. Admins see "Under 18" on the
-- contract and cannot countersign until a parent or guardian has signed. Needs player contracts (migration 0030).
do $$ begin
  if to_regclass('public.player_contracts') is null then
    raise exception 'Player contracts are not installed in this database (migration 0030): install them first';
  end if;
end $$;

alter table player_contracts
  add column if not exists is_minor boolean not null default false,
  add column if not exists guardian_name text,
  add column if not exists guardian_relation text,
  add column if not exists guardian_phone text,
  add column if not exists guardian_email citext,
  add column if not exists guardian_signed_name text,
  add column if not exists guardian_signed_at timestamptz;
alter table player_contracts drop constraint if exists player_contracts_guardian_check;
alter table player_contracts add constraint player_contracts_guardian_check check (
  (guardian_name is null or char_length(guardian_name) between 2 and 120)
  and (guardian_relation is null or guardian_relation in ('mother', 'father', 'parent', 'guardian'))
  and (guardian_phone is null or regexp_replace(guardian_phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$')
  and (guardian_email is null or (char_length(guardian_email) <= 200 and guardian_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  and (guardian_signed_at is null or (guardian_name is not null and guardian_relation is not null and guardian_phone is not null and guardian_signed_name is not null))
  -- a contract signed as a minor carries the parent's or guardian's signature
  and (not is_minor or player_signed_at is null or guardian_signed_at is not null)
);

-- under 18 today (Helsinki), from the birth date; null when the birth date is not known
create or replace function app.is_minor(p_player uuid) returns boolean language sql stable security definer set search_path = public as $$
  select case when date_of_birth is null then null
              else date_of_birth > ((now() at time zone 'Europe/Helsinki')::date - interval '18 years')::date end
  from players where id = p_player
$$;

-- for the player's contract page: is the signed-in player under 18 (true / false / null = birth date unknown)
create or replace function public.my_minor_status() returns boolean language sql stable security definer set search_path = public as $$
  select app.is_minor(app.my_player_id())
$$;
revoke all on function public.my_minor_status() from public, anon;
grant execute on function public.my_minor_status() to authenticated;

-- The player signs. Under 18 (or, without a birth date, when the player says so): the parent or guardian's details
-- and their typed name are required and stored with the signature. The old two-argument form stays for adults.
create or replace function public.sign_contract(p_id uuid, p_name text, p_minor boolean, p_guardian_name text, p_guardian_relation text,
  p_guardian_phone text, p_guardian_email text, p_guardian_sign text) returns void
language plpgsql security definer set search_path = public as $$
declare c player_contracts; v_expected text; norm text; v_minor boolean; g text;
begin
  select * into c from player_contracts where id = p_id and player_id = app.my_player_id() and status = 'sent' for update;
  if not found or not app.is_active() then raise exception 'No contract to sign' using errcode = 'no_data_found'; end if;
  if c.ends_on < current_date then raise exception 'This contract has expired' using errcode = 'check_violation'; end if;
  if c.body_sha256 is distinct from encode(sha256(convert_to(c.body, 'UTF8')), 'hex') then raise exception 'Contract text changed' using errcode = 'check_violation'; end if;
  norm := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
  select lower(regexp_replace(trim(first_name || ' ' || last_name), '\s+', ' ', 'g')) into v_expected from profiles where id = auth.uid();
  if norm = '' or norm is distinct from v_expected then raise exception 'Type your full name as it appears on your account' using errcode = 'check_violation'; end if;
  -- the birth date decides; without one, the player's own answer
  v_minor := coalesce(app.is_minor(c.player_id), p_minor, false);
  if v_minor then
    g := regexp_replace(trim(coalesce(p_guardian_name, '')), '\s+', ' ', 'g');
    if char_length(g) < 2 or char_length(g) > 120 then raise exception 'guardian: enter the parent or guardian''s full name' using errcode = 'check_violation'; end if;
    if lower(g) = norm then raise exception 'guardian: the parent or guardian is someone else than the player' using errcode = 'check_violation'; end if;
    if coalesce(p_guardian_relation, '') not in ('mother', 'father', 'parent', 'guardian') then raise exception 'guardian: choose the relation' using errcode = 'check_violation'; end if;
    if regexp_replace(coalesce(p_guardian_phone, ''), '[ ()-]', '', 'g') !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'guardian: phone with country code' using errcode = 'check_violation'; end if;
    if nullif(trim(coalesce(p_guardian_email, '')), '') is not null and trim(p_guardian_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'guardian: email' using errcode = 'check_violation'; end if;
    if lower(regexp_replace(trim(coalesce(p_guardian_sign, '')), '\s+', ' ', 'g')) is distinct from lower(g) then
      raise exception 'guardian: the parent or guardian types their own full name to sign' using errcode = 'check_violation';
    end if;
  end if;
  update player_contracts set status = 'player_signed', player_signed_name = regexp_replace(trim(p_name), '\s+', ' ', 'g'),
    is_minor = v_minor,
    guardian_name = case when v_minor then g end, guardian_relation = case when v_minor then p_guardian_relation end,
    guardian_phone = case when v_minor then trim(p_guardian_phone) end, guardian_email = case when v_minor then nullif(trim(p_guardian_email), '') end,
    guardian_signed_name = case when v_minor then g end, guardian_signed_at = case when v_minor then now() end
  where id = p_id;
end $$;
revoke all on function public.sign_contract(uuid, text, boolean, text, text, text, text, text) from public, anon;
grant execute on function public.sign_contract(uuid, text, boolean, text, text, text, text, text) to authenticated;

-- the old form: adults only (a minor is sent to the form with the parent or guardian)
create or replace function public.sign_contract(p_id uuid, p_name text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.sign_contract(p_id, p_name, false, null, null, null, null, null);
end $$;
revoke all on function public.sign_contract(uuid, text) from public, anon;
grant execute on function public.sign_contract(uuid, text) to authenticated;

-- The parent's or guardian's details change only with the player's signature (in sign_contract), and the club
-- countersigns a minor's contract only once the parent or guardian has signed. Runs after app.guard_contract.
create or replace function app.guard_guardian() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.is_minor, new.guardian_name, new.guardian_relation, new.guardian_phone, new.guardian_email, new.guardian_signed_name, new.guardian_signed_at)
      is distinct from (old.is_minor, old.guardian_name, old.guardian_relation, old.guardian_phone, old.guardian_email, old.guardian_signed_name, old.guardian_signed_at)
     and not (old.status = 'sent' and new.status = 'player_signed') then
    raise exception 'The parent or guardian''s signature cannot be edited' using errcode = 'check_violation';
  end if;
  if new.status = 'active' and old.status = 'player_signed' and new.is_minor and new.guardian_signed_at is null then
    raise exception 'A parent or guardian must sign first' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists guard_guardian on player_contracts;
create trigger guard_guardian before update on player_contracts for each row execute function app.guard_guardian();

-- For Admin → Contracts: the players who are under 18 today (birth date known), to flag their contracts before signing.
create or replace function public.minor_players() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from players where app.is_admin() and app.is_minor(id)
$$;
revoke all on function public.minor_players() from public, anon;
grant execute on function public.minor_players() to authenticated;


-- ===== 20260101000069_reply_counts.sql =====
-- 0069 How many teammates said they are in: for the player's home screen ("14 in · 2 out · 4 waiting"). Counts only,
-- never names, and only for trainings and games of a team the caller plays in or coaches (admins: any).
create or replace function public.event_reply_counts(p_ids uuid[])
returns table (event_id uuid, yes int, no int, maybe int, pending int)
language sql stable security definer set search_path = public as $$
  select s.id, count(*) filter (where a.availability = 'yes')::int, count(*) filter (where a.availability = 'no')::int,
         count(*) filter (where a.availability = 'maybe')::int, count(*) filter (where a.availability = 'pending')::int
  from training_sessions s join session_attendance a on a.session_id = s.id
  where s.id = any(p_ids) and (app.is_admin() or app.coaches_ts(s.team_season_id) or app.in_team_ts(s.team_season_id))
  group by s.id
  union all
  select m.id, count(*) filter (where a.availability = 'yes')::int, count(*) filter (where a.availability = 'no')::int,
         count(*) filter (where a.availability = 'maybe')::int, count(*) filter (where a.availability = 'pending')::int
  from matches m join match_availability a on a.match_id = m.id
  where m.id = any(p_ids) and (app.is_admin() or app.coaches_ts(m.team_season_id) or app.in_team_ts(m.team_season_id))
  group by m.id
$$;
revoke all on function public.event_reply_counts(uuid[]) from public, anon;
grant execute on function public.event_reply_counts(uuid[]) to authenticated;


-- ===== 20260101000070_coach_permissions.sql =====
-- 0070 Coach permissions: extra rights an administrator grants to a coach (or player-coach), one tick per right, on
-- Admin → People → Coach permissions. Each right only ever reaches the teams the coach coaches this season. Off by default.
--   contracts  see the contracts of their teams' players (read only; replaces 0031's rule that every coach saw them)
--   fees       see their teams' players' invoices and whether they are paid (read only)
--   opponents  add, rename and hide names in the opponents list
--   posters    upload and remove matchday poster photos and sponsor logos (storage: public-media/posters/)
-- Safe to run more than once; parts for tables that are not installed (e.g. player contracts) are skipped.

create table if not exists coach_permissions (
  profile_id uuid not null references profiles(id) on delete cascade,
  permission text not null check (permission in ('contracts', 'fees', 'opponents', 'posters')),
  granted_by uuid references profiles(id) on delete set null default auth.uid(),
  granted_at timestamptz not null default now(),
  primary key (profile_id, permission)
);
alter table coach_permissions enable row level security;
revoke all on coach_permissions from anon;
drop policy if exists admin_all on coach_permissions;
create policy admin_all on coach_permissions for all to authenticated using (app.is_admin()) with check (app.is_admin());
drop policy if exists self_read on coach_permissions;
create policy self_read on coach_permissions for select to authenticated using (profile_id = auth.uid());
drop trigger if exists audit on coach_permissions;
create trigger audit after insert or update or delete on coach_permissions for each row execute function app.audit();

-- only coaches and player-coaches hold a permission
create or replace function app.guard_coach_permission() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- role::text: a database installed before 0045 has no 'player_coach' role value yet
  if not exists (select 1 from profiles where id = new.profile_id and role::text in ('coach', 'player_coach')) then
    raise exception 'Permissions are for coaches and player-coaches' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists guard on coach_permissions;
create trigger guard before insert or update on coach_permissions for each row execute function app.guard_coach_permission();

-- true when the signed-in coach (still a coach or player-coach, active) has been granted this right. Uses app.role()
-- (migration 0007) rather than app.is_coach() (0045), so it also works on a database installed before 0045.
create or replace function app.coach_may(p_permission text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.role()::text in ('coach', 'player_coach'), false)
     and exists (select 1 from coach_permissions where profile_id = auth.uid() and permission = p_permission)
$$;

-- contracts: only with the right (it was every coach of the player's team since 0031)
do $$ begin
  if to_regclass('public.player_contracts') is not null then
    drop policy if exists contract_coach_read on player_contracts;
    create policy contract_coach_read on player_contracts for select to authenticated
      using (status <> 'draft' and app.coach_may('contracts') and app.coaches_player(player_id));
  end if;
end $$;

-- fees: the invoices (and their lines and receipts) of the coach's players
drop policy if exists coach_fees_read on payments;
create policy coach_fees_read on payments for select to authenticated using (app.coach_may('fees') and app.coaches_player(player_id));
drop policy if exists coach_fees_read on memberships;
create policy coach_fees_read on memberships for select to authenticated using (app.coach_may('fees') and app.coaches_player(player_id));

-- opponents: coaches with the right add, rename and hide names (every coach already reads them, 0061; skipped before 0061)
do $$ begin
  if to_regclass('public.opponents') is not null then
    drop policy if exists coach_write on opponents;
    create policy coach_write on opponents for all to authenticated using (app.coach_may('opponents')) with check (app.coach_may('opponents'));
  end if;
end $$;

-- poster photos and logos (only where Supabase Storage is installed)
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "public-media posters by coaches" on storage.objects';
    execute $p$create policy "public-media posters by coaches" on storage.objects for all to authenticated
      using (bucket_id = 'public-media' and name like 'posters/%' and app.coach_may('posters'))
      with check (bucket_id = 'public-media' and name like 'posters/%' and app.coach_may('posters'))$p$;
  end if;
end $$;


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

