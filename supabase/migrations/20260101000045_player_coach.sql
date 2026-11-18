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
