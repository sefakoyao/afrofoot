-- 0008 Row Level Security. Default deny; each policy states who and why.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop; end $$;

-- Administrators (club_admin + super_admin) manage everything except the append-only log and personal notifications.
do $$ declare t text; begin
  foreach t in array array['profiles','seasons','teams','team_seasons','locations','players','player_private','player_medical','staff_members','team_staff','team_players',
    'training_programs','training_sessions','session_attendance','competitions','matches','match_availability','match_squad','match_player_stats',
    'evaluation_criteria','evaluations','evaluation_scores','development_goals','membership_plans','memberships','payments','expenses',
    'pages','news_posts','sponsors','site_settings','contact_messages','join_requests','announcements'] loop
    execute format('create policy admin_all on public.%I for all to authenticated using (app.is_admin()) with check (app.is_admin())', t);
  end loop; end $$;

-- profiles
create policy profiles_self_read on profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- (role/status/email are protected by the guard_profiles trigger)

-- reference data readable by any active member
do $$ declare t text; begin
  foreach t in array array['seasons','teams','team_seasons','locations','competitions','membership_plans','team_staff','evaluation_criteria'] loop
    execute format('create policy member_read on public.%I for select to authenticated using (app.is_active())', t);
  end loop; end $$;

-- players & private data
create policy players_self_read   on players for select to authenticated using (profile_id = auth.uid());
create policy players_coach_read  on players for select to authenticated using (app.coaches_player(id));
create policy players_self_update on players for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy private_self        on player_private for all to authenticated using (player_id = app.my_player_id()) with check (player_id = app.my_player_id());
create policy private_coach_read  on player_private for select to authenticated using (app.coaches_player(player_id));
create policy medical_self        on player_medical for all to authenticated using (player_id = app.my_player_id()) with check (player_id = app.my_player_id());

-- staff
create policy staff_read_coaches on staff_members for select to authenticated using (app.role() = 'coach');
create policy staff_read_self    on staff_members for select to authenticated using (profile_id = auth.uid());
create policy staff_read_team    on staff_members for select to authenticated using (exists (
  select 1 from team_staff t join team_players tp on tp.team_season_id = t.team_season_id where t.staff_id = staff_members.id and tp.player_id = app.my_player_id()));
create policy staff_self_update  on staff_members for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- roster
create policy roster_read on team_players for select to authenticated using (app.coaches_ts(team_season_id) or app.in_team_ts(team_season_id));

-- training
create policy programs_read  on training_programs for select to authenticated using (app.coaches_ts(team_season_id) or app.in_team_ts(team_season_id));
create policy programs_write on training_programs for all to authenticated using (app.coaches_ts(team_season_id)) with check (app.coaches_ts(team_season_id));
create policy sessions_read  on training_sessions for select to authenticated using (app.coaches_ts(team_season_id) or app.in_team_ts(team_season_id));
create policy sessions_write on training_sessions for all to authenticated using (app.coaches_ts(team_season_id)) with check (app.coaches_ts(team_season_id));
create policy attendance_self  on session_attendance for select to authenticated using (player_id = app.my_player_id());
create policy attendance_self_update on session_attendance for update to authenticated using (player_id = app.my_player_id()) with check (player_id = app.my_player_id());
create policy attendance_coach on session_attendance for all to authenticated
  using (exists (select 1 from training_sessions s where s.id = session_id and app.coaches_ts(s.team_season_id)))
  with check (exists (select 1 from training_sessions s where s.id = session_id and app.coaches_ts(s.team_season_id)));

-- matches
create policy matches_read  on matches for select to authenticated using (app.coaches_ts(team_season_id) or app.in_team_ts(team_season_id));
create policy matches_write on matches for all to authenticated using (app.coaches_ts(team_season_id)) with check (app.coaches_ts(team_season_id));
create policy mavail_self        on match_availability for select to authenticated using (player_id = app.my_player_id());
create policy mavail_self_update on match_availability for update to authenticated using (player_id = app.my_player_id()) with check (player_id = app.my_player_id());
create policy mavail_coach on match_availability for all to authenticated
  using (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)))
  with check (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)));
create policy squad_coach on match_squad for all to authenticated
  using (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)))
  with check (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)));
create policy squad_players_read on match_squad for select to authenticated
  using (exists (select 1 from matches m where m.id = match_id and m.squad_published and app.in_team_ts(m.team_season_id)));
create policy stats_coach on match_player_stats for all to authenticated
  using (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)))
  with check (exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)));
create policy stats_team_read on match_player_stats for select to authenticated
  using (exists (select 1 from matches m where m.id = match_id and app.in_team_ts(m.team_season_id)));

-- development
create policy eval_coach_read   on evaluations for select to authenticated using (app.coaches_player(player_id));
create policy eval_player_read  on evaluations for select to authenticated using (visible_to_player and player_id = app.my_player_id());
create policy eval_coach_insert on evaluations for insert to authenticated with check (app.coaches_player(player_id) and evaluator_id = auth.uid());
create policy eval_coach_modify on evaluations for update to authenticated using (evaluator_id = auth.uid() and app.role() = 'coach') with check (evaluator_id = auth.uid() and app.coaches_player(player_id));
create policy eval_coach_delete on evaluations for delete to authenticated using (evaluator_id = auth.uid() and app.role() = 'coach');
create policy escores_read  on evaluation_scores for select to authenticated using (exists (select 1 from evaluations e where e.id = evaluation_id));
create policy escores_write on evaluation_scores for all to authenticated
  using (exists (select 1 from evaluations e where e.id = evaluation_id and e.evaluator_id = auth.uid() and app.role() = 'coach'))
  with check (exists (select 1 from evaluations e where e.id = evaluation_id and e.evaluator_id = auth.uid() and app.role() = 'coach'));
create policy goals_read  on development_goals for select to authenticated using (player_id = app.my_player_id() or app.coaches_player(player_id));
create policy goals_write on development_goals for all to authenticated using (app.coaches_player(player_id)) with check (app.coaches_player(player_id) and created_by = auth.uid());

-- membership & money: players see only their own; coaches see none
create policy memberships_self on memberships for select to authenticated using (player_id = app.my_player_id());
create policy payments_self    on payments    for select to authenticated using (player_id = app.my_player_id());

-- communication
create policy announcements_read on announcements for select to authenticated using (
  app.is_active() and published_at is not null and published_at <= now() and (expires_at is null or expires_at > now()) and (
    audience = 'everyone' or (audience = 'players' and app.role() = 'player') or (audience = 'coaches' and app.role() = 'coach')
    or (audience = 'team' and (app.coaches_ts(team_season_id) or app.in_team_ts(team_season_id)))));
create policy announcements_coach_draft on announcements for all to authenticated
  using (app.role() = 'coach' and created_by = auth.uid() and published_at is null)
  with check (app.role() = 'coach' and created_by = auth.uid() and audience = 'team' and app.coaches_ts(team_season_id) and published_at is null);
create policy notifications_own_read   on notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_own_update on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own_delete on notifications for delete to authenticated using (user_id = auth.uid());
create policy audit_admin_read on audit_log for select to authenticated using (app.is_admin());

-- public website content (anonymous visitors)
create policy pages_public    on pages        for select to anon, authenticated using (status = 'published');
create policy news_public     on news_posts   for select to anon, authenticated using (status = 'published' and published_at <= now());
create policy sponsors_public on sponsors     for select to anon, authenticated using (active);
create policy settings_public on site_settings for select to anon, authenticated using (is_public);
create policy contact_public  on contact_messages for insert to anon, authenticated with check (status = 'new' and handled_by is null);
create policy join_public     on join_requests    for insert to anon, authenticated with check (status = 'new' and reviewed_by is null);

-- table privileges: belt and braces on top of RLS
revoke all on all tables in schema public from anon;
grant select on pages, news_posts, sponsors, site_settings to anon;
grant insert on contact_messages, join_requests to anon;
revoke insert, update, delete, truncate on audit_log from authenticated, anon;
revoke insert, delete, truncate on notifications from authenticated, anon;
alter default privileges in schema public revoke all on tables from anon;
