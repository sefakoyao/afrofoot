-- Removes every account created by demo_users.sql (all addresses demo-…@example.com), with their player records and payments.
-- Paste into Supabase → SQL Editor and run. Audit-log entries about them are kept (the log is append-only).
delete from payments where player_id in (select pl.id from players pl join profiles p on p.id = pl.profile_id where p.email like 'demo-%@example.com');
delete from team_players where player_id in (select pl.id from players pl join profiles p on p.id = pl.profile_id where p.email like 'demo-%@example.com');
delete from players where profile_id in (select id from profiles where email like 'demo-%@example.com');
delete from auth.users where email like 'demo-%@example.com';   -- also removes their profiles and identities (on delete cascade)
select count(*) as demo_accounts_left from profiles where email like 'demo-%@example.com';
