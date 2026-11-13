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
