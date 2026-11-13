-- 0007 authorization helpers, guards, automation, audit
-- All helpers are SECURITY DEFINER with a fixed search_path so RLS policies can call them without recursion.
create function app.role() returns user_role language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() and status = 'active' $$;
create function app.is_active() returns boolean language sql stable security definer set search_path = public as
$$ select app.role() is not null $$;
create function app.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role() in ('super_admin','club_admin'), false) $$;
create function app.is_super() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role() = 'super_admin', false) $$;
create function app.my_player_id() returns uuid language sql stable security definer set search_path = public as
$$ select id from players where profile_id = auth.uid() $$;
create function app.coaches_ts(ts uuid) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role() = 'coach', false) and exists (
     select 1 from team_staff t join staff_members s on s.id = t.staff_id
     where s.profile_id = auth.uid() and t.team_season_id = ts) $$;
create function app.coaches_player(pid uuid) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role() = 'coach', false) and exists (
     select 1 from team_players tp join team_staff t on t.team_season_id = tp.team_season_id
     join staff_members s on s.id = t.staff_id
     where tp.player_id = pid and s.profile_id = auth.uid()) $$;
create function app.in_team_ts(ts uuid) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role() = 'player', false) and exists (
     select 1 from team_players tp where tp.team_season_id = ts and tp.player_id = app.my_player_id()) $$;
grant execute on all functions in schema app to anon, authenticated;

-- updated_at
do $$ declare t text; begin
  for t in select c.table_name from information_schema.columns c
           join information_schema.tables x on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
           where c.table_schema = 'public' and c.column_name = 'updated_at' loop
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop; end $$;

-- Non-admin/non-coach users may only change the listed columns (RLS decides *which rows*, this decides *which columns*).
create function app.restrict_columns() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or app.is_admin() or app.role() = 'coach' then return new; end if;
  if (to_jsonb(new) - tg_argv) is distinct from (to_jsonb(old) - tg_argv) then
    raise exception 'You may not change these fields' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger restrict_cols before update on players for each row execute function app.restrict_columns('preferred_foot','height_cm','weight_kg','bio','photo_path','show_publicly','updated_at');
create trigger restrict_cols before update on staff_members for each row execute function app.restrict_columns('bio','photo_path','updated_at');
create trigger restrict_cols before update on session_attendance for each row execute function app.restrict_columns('availability','responded_at','note','updated_at');
create trigger restrict_cols before update on match_availability for each row execute function app.restrict_columns('availability','responded_at','note','updated_at');
create trigger restrict_cols before update on notifications for each row execute function app.restrict_columns('read_at');

-- Coaches may only change attendance marking fields on attendance rows, not a player's own response.
-- (kept simple: coaches are trusted for their own teams; every change is audited.)

create function app.guard_profiles() returns trigger language plpgsql security definer set search_path = public as $$
declare privileged user_role[] := array['super_admin','club_admin']::user_role[];
begin
  if auth.uid() is null then return new; end if;   -- service role / migrations
  if new.id is distinct from old.id or new.email is distinct from old.email then
    raise exception 'id and email are managed by the authentication system' using errcode = '42501'; end if;
  if new.role is distinct from old.role or new.status is distinct from old.status then
    if not app.is_admin() then raise exception 'Only administrators can change role or status' using errcode = '42501'; end if;
    if (new.role = any(privileged) or old.role = any(privileged)) and not app.is_super() then
      raise exception 'Only a super administrator can manage administrator accounts' using errcode = '42501'; end if;
    if old.role = 'super_admin' and old.status = 'active' and (new.role <> 'super_admin' or new.status <> 'active')
       and (select count(*) from profiles where role = 'super_admin' and status = 'active') <= 1 then
      raise exception 'The last active super administrator cannot be removed' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
create trigger guard_profiles before update on profiles for each row execute function app.guard_profiles();

-- Every new sign-up gets a pending *player* profile. The role in user metadata is never trusted.
create function app.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, first_name, last_name)
  values (new.id, new.email, left(coalesce(new.raw_user_meta_data->>'first_name',''), 80), left(coalesce(new.raw_user_meta_data->>'last_name',''), 80));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

-- Attendance / availability rows are generated from the roster so players never insert rows themselves.
create function app.seed_session_attendance() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into session_attendance (session_id, player_id)
  select new.id, tp.player_id from team_players tp where tp.team_season_id = new.team_season_id and tp.left_on is null
  on conflict do nothing;
  return new;
end $$;
create trigger seed_attendance after insert on training_sessions for each row execute function app.seed_session_attendance();
create function app.seed_match_availability() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into match_availability (match_id, player_id)
  select new.id, tp.player_id from team_players tp where tp.team_season_id = new.team_season_id and tp.left_on is null
  on conflict do nothing;
  return new;
end $$;
create trigger seed_availability after insert on matches for each row execute function app.seed_match_availability();
create function app.roster_join_backfill() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.left_on is not null then return new; end if;
  insert into session_attendance (session_id, player_id)
    select s.id, new.player_id from training_sessions s where s.team_season_id = new.team_season_id and s.starts_at > now() and s.status = 'scheduled' on conflict do nothing;
  insert into match_availability (match_id, player_id)
    select m.id, new.player_id from matches m where m.team_season_id = new.team_season_id and m.kickoff_at > now() and m.status = 'scheduled' on conflict do nothing;
  return new;
end $$;
create trigger roster_backfill after insert on team_players for each row execute function app.roster_join_backfill();

-- Publishing an announcement fans out in-app notifications to the right audience.
create function public.publish_announcement(p_id uuid) returns int language plpgsql security definer set search_path = public as $$
declare a announcements; n int;
begin
  select * into a from announcements where id = p_id;
  if not found then raise exception 'Announcement not found' using errcode = 'P0002'; end if;
  if not (app.is_admin() or (app.role() = 'coach' and a.audience = 'team' and app.coaches_ts(a.team_season_id))) then
    raise exception 'Not allowed to publish this announcement' using errcode = '42501'; end if;
  if a.published_at is not null then raise exception 'Already published' using errcode = '23505'; end if;
  update announcements set published_at = now() where id = p_id;
  insert into notifications (user_id, kind, title, body, link)
  select p.id, 'announcement', a.title, left(a.body, 200), '/announcements' from profiles p
  where p.status = 'active' and (
    a.audience = 'everyone'
    or (a.audience = 'players' and p.role = 'player')
    or (a.audience = 'coaches' and p.role = 'coach')
    or (a.audience = 'team' and (
         exists (select 1 from players pl join team_players tp on tp.player_id = pl.id where pl.profile_id = p.id and tp.team_season_id = a.team_season_id and tp.left_on is null)
      or exists (select 1 from staff_members sm join team_staff ts on ts.staff_id = sm.id where sm.profile_id = p.id and ts.team_season_id = a.team_season_id))));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.publish_announcement(uuid) from anon;

-- Audit trail. 'redact' variant stores only the NAMES of changed columns (private/medical data never copied into the log).
create function app.audit() returns trigger language plpgsql security definer set search_path = public as $$
declare redact boolean := coalesce(tg_argv[0], '') = 'redact'; o jsonb; n jsonb; rid uuid;
begin
  o := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  rid := coalesce(n->>'id', o->>'id')::uuid;
  if tg_op = 'UPDATE' and (o - 'updated_at') = (n - 'updated_at') then return new; end if;
  if redact then
    if tg_op = 'UPDATE' then
      n := (select coalesce(jsonb_object_agg(k, true), '{}'::jsonb) from jsonb_each(n) e(k, v) where k <> 'updated_at' and o->k is distinct from v);
    else n := null; end if;
    o := null;
  end if;
  insert into audit_log (actor_id, action, table_name, record_id, old_data, new_data) values (auth.uid(), tg_op, tg_table_name, rid, o, n);
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['profiles','players','staff_members','seasons','teams','team_seasons','team_staff','team_players','competitions','matches',
    'memberships','membership_plans','payments','expenses','announcements','pages','news_posts','sponsors','site_settings','join_requests','evaluations','development_goals'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit()', t);
  end loop;
  foreach t in array array['player_private','player_medical'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit(%L)', t, 'redact');
  end loop;
end $$;
