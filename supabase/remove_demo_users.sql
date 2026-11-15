-- Removes every account created by demo_users.sql (all addresses demo-…@example.com), with their player records, payments, match stats and the demo training sessions.
-- Paste into Supabase → SQL Editor and run. Audit-log entries about them are kept (the log is append-only).
delete from team_staff where staff_id in (select s.id from staff_members s join profiles p on p.id = s.profile_id where p.email like 'demo-%@example.com');
delete from staff_members where profile_id in (select id from profiles where email like 'demo-%@example.com');
delete from training_sessions where title = 'Demo training';   -- their attendance rows go with them
delete from match_player_stats where player_id in (select pl.id from players pl join profiles p on p.id = pl.profile_id where p.email like 'demo-%@example.com');
delete from payments where player_id in (select pl.id from players pl join profiles p on p.id = pl.profile_id where p.email like 'demo-%@example.com');
delete from team_players where player_id in (select pl.id from players pl join profiles p on p.id = pl.profile_id where p.email like 'demo-%@example.com');
delete from players where profile_id in (select id from profiles where email like 'demo-%@example.com');
delete from auth.users where email like 'demo-%@example.com';   -- also removes their profiles and identities (on delete cascade)
select count(*) as demo_accounts_left from profiles where email like 'demo-%@example.com';
