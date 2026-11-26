-- 0072 Coaches sign in and out of their teams' events too. Release 0.73.0.
-- A coach (or player-coach) answers I'm in / Maybe / Can't, with an optional note, for the trainings, games and team
-- events (club_events) of the teams they coach this season, like players do. Players' answers stay where they are
-- (session_attendance, match_availability); a coach who is not a player has no row there, so coaches' answers have their
-- own table.
--  * A coach writes only their own answer, only for an event of a team they coach (app.coaches_ts), only while the
--    event is scheduled and has not started. Admins may correct any answer at any time.
--  * Coaches of the team and admins read the answers. Every change is in the audit trail.
-- Uses only functions from migrations 0007-0008 (app.coaches_ts, app.is_admin, app.role), so it also installs on a
-- database without later updates; team events are answerable once club events (migration 0034) are installed.
-- Safe to run more than once.

create table if not exists coach_replies (
  id uuid primary key default gen_random_uuid(),
  event_kind text not null check (event_kind in ('practice', 'match', 'event')),
  event_id uuid not null,
  profile_id uuid not null references profiles(id) on delete cascade default auth.uid(),
  availability text not null check (availability in ('yes', 'no', 'maybe')),
  note text check (note is null or char_length(note) <= 300),
  responded_at timestamptz not null default now(),
  unique (event_kind, event_id, profile_id)
);
create index if not exists coach_replies_event on coach_replies (event_kind, event_id);
alter table coach_replies enable row level security;
revoke all on coach_replies from anon;

-- The team, start and status of an event (null when it does not exist, or club events are not installed).
create or replace function app.reply_event(p_kind text, p_id uuid, out team_season_id uuid, out starts_at timestamptz, out status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'practice' then
    select s.team_season_id, s.starts_at, s.status::text into team_season_id, starts_at, status from training_sessions s where s.id = p_id;
  elsif p_kind = 'match' then
    select m.team_season_id, m.kickoff_at, m.status::text into team_season_id, starts_at, status from matches m where m.id = p_id;
  elsif p_kind = 'event' and to_regclass('public.club_events') is not null then
    execute 'select e.team_season_id, e.starts_at, e.status::text from club_events e where e.id = $1' into team_season_id, starts_at, status using p_id;
  end if;
end $$;
revoke all on function app.reply_event(text, uuid) from public, anon;
grant execute on function app.reply_event(text, uuid) to authenticated;

-- true when the signed-in coach coaches the team of this event (role::text: works before the player-coach role, 0045)
create or replace function app.coaches_event(p_kind text, p_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.role()::text in ('coach', 'player_coach'), false)
     and coalesce((select app.coaches_ts(e.team_season_id) from app.reply_event(p_kind, p_id) e where e.team_season_id is not null), false)
$$;
grant execute on function app.coaches_event(text, uuid) to authenticated;

drop policy if exists admin_all on coach_replies;
create policy admin_all on coach_replies for all to authenticated using (app.is_admin()) with check (app.is_admin());
drop policy if exists coach_read on coach_replies;
create policy coach_read on coach_replies for select to authenticated using (app.coaches_event(event_kind, event_id));
drop policy if exists coach_own on coach_replies;
create policy coach_own on coach_replies for insert to authenticated with check (profile_id = auth.uid() and app.is_active() and app.coaches_event(event_kind, event_id));
drop policy if exists coach_own_update on coach_replies;
create policy coach_own_update on coach_replies for update to authenticated
  using (profile_id = auth.uid() and app.coaches_event(event_kind, event_id))
  with check (profile_id = auth.uid() and app.is_active() and app.coaches_event(event_kind, event_id));

-- The answer time is the database's; a coach's answer closes when the event starts or if it is cancelled.
create or replace function app.guard_coach_reply() returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if tg_op = 'UPDATE' and (new.event_kind, new.event_id, new.profile_id) is distinct from (old.event_kind, old.event_id, old.profile_id) then
    raise exception 'An answer cannot be moved to another event or person' using errcode = 'check_violation';
  end if;
  new.responded_at := now();
  if auth.uid() is null or app.is_admin() then return new; end if;
  select * into e from app.reply_event(new.event_kind, new.event_id);
  if e.team_season_id is null then raise exception 'No such event of a team' using errcode = 'check_violation'; end if;
  if e.status is distinct from 'scheduled' or e.starts_at <= now() then
    raise exception 'Replies are closed for this event' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function app.guard_coach_reply() from public, anon, authenticated;
drop trigger if exists guard on coach_replies;
create trigger guard before insert or update on coach_replies for each row execute function app.guard_coach_reply();
drop trigger if exists audit on coach_replies;
create trigger audit after insert or update or delete on coach_replies for each row execute function app.audit();

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.73.0','feature','Coaches sign in and out',
  'Coaches answer I''m in / Maybe / Can''t for their teams'' trainings, games and team events on the Coach home, like players do. The other coaches of the team and admins see who is coming.','2026-11-26')
on conflict (version) do nothing;
