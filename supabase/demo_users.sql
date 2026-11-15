-- DEMO SIGN-IN ACCOUNTS FOR THE STAGING DATABASE ONLY. Never run this in production.
-- Paste into Supabase → SQL Editor and run. Safe to run twice (existing demo accounts are skipped).
-- Creates: 1 coach and 3 players who can sign in, plus 1 player waiting for approval (to try the Members page).
-- Sample payments: player1 paid last month and has one coming up; player2 is overdue but still inside the grace period
-- (sees the warning, can still sign in); player3 is fully paid.
-- Sport data (needs the sample season from seed_staging_sample.sql, run that first): match stats on the sample's played
-- matches and 8 past "Demo training" sessions with attendance. player1 also gets a phone and an emergency contact.
-- The demo coach is assigned to the sample team as head coach.
-- Password for every demo account: Demo-Afrofoot-2026   (change it below before running if you like)
-- All addresses end in @example.com, a reserved domain that never receives mail, so password-reset emails go nowhere.
-- Remove them all: supabase/remove_demo_users.sql

do $$
declare
  v_password constant text := 'Demo-Afrofoot-2026';
  v_ts uuid := (select ts.id from team_seasons ts join seasons s on s.id = ts.season_id where s.is_current order by ts.created_at limit 1);
  r record; v_id uuid; v_player uuid;
begin
  for r in select * from (values
    -- email,                          first,     last,       role,     status,    position,     shirt
    ('demo-coach@example.com',         'Kwame',   'Mensah',   'coach',  'active',  null,         null),
    ('demo-player1@example.com',       'Amadou',  'Diallo',   'player', 'active',  'forward',    9),
    ('demo-player2@example.com',       'Leila',   'Haddad',   'player', 'active',  'midfielder', 8),
    ('demo-player3@example.com',       'Mikko',   'Virtanen', 'player', 'active',  'goalkeeper', 1),
    ('demo-pending@example.com',       'Samuel',  'Okafor',   'player', 'pending', 'defender',   null)
  ) as t(email, first_name, last_name, role, status, position, shirt)
  loop
    continue when exists (select 1 from auth.users where email = r.email);
    v_id := gen_random_uuid();

    -- Sign-in account (what Authentication → Add user does). The trigger on auth.users creates the profile as a pending player.
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', r.email,
            extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('first_name', r.first_name, 'last_name', r.last_name),
            now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', r.email, 'email_verified', true),
            'email', now(), now(), now());

    -- Role and status (run as the database owner, so no admin session is needed).
    update profiles set role = r.role::user_role, status = r.status::account_status where id = v_id;

    -- Players get a player record linked to their account, and join the current team when one exists.
    if r.role = 'player' then
      insert into players (profile_id, first_name, last_name, position, status, joined_on)
      values (v_id, r.first_name, r.last_name, r.position::player_position, case when r.status = 'active' then 'active' else 'prospect' end::player_status, current_date)
      returning id into v_player;
      if r.email = 'demo-player1@example.com' then
        insert into payments (player_id, amount_cents, status, due_on, paid_at, notes) values
          (v_player, 4000, 'paid', current_date - 30, now() - interval '28 days', 'demo'),
          (v_player, 4000, 'pending', current_date + 20, null, 'demo');
      elsif r.email = 'demo-player2@example.com' then
        insert into payments (player_id, amount_cents, status, due_on, paid_at, notes) values
          (v_player, 4000, 'paid', current_date - 60, now() - interval '55 days', 'demo'),
          (v_player, 4000, 'pending', current_date - 5, null, 'demo');
      elsif r.email = 'demo-player3@example.com' then
        insert into payments (player_id, amount_cents, status, due_on, paid_at, notes) values
          (v_player, 12000, 'paid', current_date - 10, now() - interval '9 days', 'demo');
      end if;
      if v_ts is not null and r.status = 'active' then
        insert into team_players (team_season_id, player_id, jersey_number, joined_on) values (v_ts, v_player, r.shirt, current_date)
        on conflict do nothing;
      end if;
    end if;
  end loop;
end $$;

-- Sport data for the active demo players: profile details, match stats and training attendance (current season only).
do $$
declare
  v_ts uuid := (select ts.id from team_seasons ts join seasons s on s.id = ts.season_id where s.is_current order by ts.created_at limit 1);
  p1 uuid := (select pl.id from players pl join profiles p on p.id = pl.profile_id where p.email = 'demo-player1@example.com');
  p2 uuid := (select pl.id from players pl join profiles p on p.id = pl.profile_id where p.email = 'demo-player2@example.com');
  p3 uuid := (select pl.id from players pl join profiles p on p.id = pl.profile_id where p.email = 'demo-player3@example.com');
  m record; i int := 0;
begin
  if p1 is null or v_ts is null then return; end if;
  -- The demo coach coaches the sample team (staff record + team assignment), so the coach area has a team to work with.
  insert into staff_members (profile_id, first_name, last_name, type)
  select p.id, p.first_name, p.last_name, 'head_coach' from profiles p where p.email = 'demo-coach@example.com'
  on conflict (profile_id) do nothing;
  insert into team_staff (team_season_id, staff_id, role_label)
  select v_ts, s.id, 'Head coach' from staff_members s join profiles p on p.id = s.profile_id where p.email = 'demo-coach@example.com'
  on conflict (team_season_id, staff_id) do nothing;
  update players set preferred_foot = 'right', height_cm = 181 where id = p1 and preferred_foot is null;
  update players set preferred_foot = 'left' where id = p2 and preferred_foot is null;
  insert into player_private (player_id, phone, emergency_name, emergency_relation, emergency_phone)
  values (p1, '+358401110001', 'Fatou Diallo', 'mother', '+358401110002') on conflict (player_id) do nothing;

  -- Stats on the played matches, newest first (skipped if this player already has stats for the match).
  for m in select id, goals_for, goals_against from matches where team_season_id = v_ts and status = 'played' order by kickoff_at desc loop
    i := i + 1;
    insert into match_player_stats (match_id, player_id, minutes, goals, assists, yellow_cards, clean_sheet) values
      (m.id, p1, case i when 4 then 0 else 90 - (i - 1) * 5 end, (array[2,0,1,0])[least(i,4)], (array[0,1,1,0])[least(i,4)], 0, false),
      (m.id, p2, 90, (array[0,1,0,0])[least(i,4)], (array[2,0,1,0])[least(i,4)], case i when 2 then 1 else 0 end, false),
      (m.id, p3, 90, 0, 0, 0, m.goals_against = 0)
    on conflict (match_id, player_id) do nothing;
  end loop;

  -- 8 past training sessions (the database adds an attendance row for every player in the team), then mark the demo players.
  if not exists (select 1 from training_sessions where team_season_id = v_ts and title = 'Demo training') then
    insert into training_sessions (team_season_id, title, starts_at, ends_at, status)
    select v_ts, 'Demo training', date_trunc('day', now()) - (n * 3 || ' days')::interval + interval '17 hours',
           date_trunc('day', now()) - (n * 3 || ' days')::interval + interval '18 hours 30 minutes', 'completed'
    from generate_series(1, 8) n;
    update session_attendance sa set attendance = x.att::attendance_status, marked_at = now()
    from (select ts.id, row_number() over (order by ts.starts_at desc) as k from training_sessions ts where ts.team_season_id = v_ts and ts.title = 'Demo training') s,
         lateral (values
           (p1, (array['present','present','late','present','absent','present','present','present'])[s.k]),
           (p2, (array['present','absent','excused','present','absent','present','excused','present'])[s.k]),
           (p3, 'present')) as x(pid, att)
    where sa.session_id = s.id and sa.player_id = x.pid;
  end if;
end $$;

select p.email, p.first_name || ' ' || p.last_name as name, p.role, p.status, (pl.id is not null) as has_player_record
from profiles p left join players pl on pl.profile_id = p.id
where p.email like 'demo-%@example.com' order by p.role, p.email;
