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
