-- DEMO SIGN-IN ACCOUNTS FOR THE STAGING DATABASE ONLY. Never run this in production.
-- Paste into Supabase → SQL Editor and run. Safe to run twice (existing demo accounts are skipped).
-- Creates: 1 coach and 3 players who can sign in, plus 1 player waiting for approval (to try the Members page).
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
      if v_ts is not null and r.status = 'active' then
        insert into team_players (team_season_id, player_id, jersey_number, joined_on) values (v_ts, v_player, r.shirt, current_date)
        on conflict do nothing;
      end if;
    end if;
  end loop;
end $$;

select p.email, p.first_name || ' ' || p.last_name as name, p.role, p.status, (pl.id is not null) as has_player_record
from profiles p left join players pl on pl.profile_id = p.id
where p.email like 'demo-%@example.com' order by p.role, p.email;
