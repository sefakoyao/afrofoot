-- 0048 Reply deadlines, reminders, approval email, request alerts, outbox. Uses the t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f7000000-0000-0000-0000-000000000001', 'em-admin@example.test', '{"first_name":"Em","last_name":"Admin"}'),
 ('f7000000-0000-0000-0000-000000000002', 'em-coach@example.test', '{"first_name":"Em","last_name":"Coach"}'),
 ('f7000000-0000-0000-0000-000000000003', 'em-yes@example.test', '{"first_name":"Ada","last_name":"Yes"}'),
 ('f7000000-0000-0000-0000-000000000004', 'em-quiet@example.test', '{"first_name":"Ben","last_name":"Quiet"}'),
 ('f7000000-0000-0000-0000-000000000005', 'em-off@example.test', '{"first_name":"Cy","last_name":"Off"}'),
 ('f7000000-0000-0000-0000-000000000006', 'em-owes@example.test', '{"first_name":"Di","last_name":"Owes"}'),
 ('f7000000-0000-0000-0000-000000000007', 'em-new@example.test', '{"first_name":"Eva","last_name":"New"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f7000000-0000-0000-0000-000000000001';
update profiles set role = 'coach', status = 'active' where id = 'f7000000-0000-0000-0000-000000000002';
update profiles set role = 'player', status = 'active' where id in ('f7000000-0000-0000-0000-000000000003', 'f7000000-0000-0000-0000-000000000004', 'f7000000-0000-0000-0000-000000000005', 'f7000000-0000-0000-0000-000000000006');
update profiles set locale = 'fi' where id = 'f7000000-0000-0000-0000-000000000004';
update profiles set reminder_emails = false where id = 'f7000000-0000-0000-0000-000000000005';
insert into seasons (id, name, starts_on, ends_on, is_current) values ('f7200000-0000-0000-0000-000000000001', 'Em season', current_date - 30, current_date + 300, false);
insert into teams (id, name, slug) values ('f7300000-0000-0000-0000-000000000001', 'Em Team', 'em-team');
insert into team_seasons (id, team_id, season_id) values ('f7400000-0000-0000-0000-000000000001', 'f7300000-0000-0000-0000-000000000001', 'f7200000-0000-0000-0000-000000000001');
insert into staff_members (id, profile_id, first_name, last_name) values ('f7600000-0000-0000-0000-000000000002', 'f7000000-0000-0000-0000-000000000002', 'Em', 'Coach');
insert into team_staff (team_season_id, staff_id) values ('f7400000-0000-0000-0000-000000000001', 'f7600000-0000-0000-0000-000000000002');
insert into players (id, profile_id, first_name, last_name, status) values
 ('f7500000-0000-0000-0000-000000000003', 'f7000000-0000-0000-0000-000000000003', 'Ada', 'Yes', 'active'),
 ('f7500000-0000-0000-0000-000000000004', 'f7000000-0000-0000-0000-000000000004', 'Ben', 'Quiet', 'active'),
 ('f7500000-0000-0000-0000-000000000005', 'f7000000-0000-0000-0000-000000000005', 'Cy', 'Off', 'active'),
 ('f7500000-0000-0000-0000-000000000006', 'f7000000-0000-0000-0000-000000000006', 'Di', 'Owes', 'active');
insert into team_players (team_season_id, player_id) select 'f7400000-0000-0000-0000-000000000001', id from players where id::text like 'f75%';
update fee_policy set enabled = true, grace_days = 14;
insert into payments (player_id, amount_cents, status, due_on) values ('f7500000-0000-0000-0000-000000000006', 24000, 'pending', current_date - 30);
-- a training in 5 days at 18:00 and a game in 6 days at 19:00 (Helsinki)
insert into training_sessions (id, team_season_id, title, starts_at, ends_at) values ('f7700000-0000-0000-0000-000000000001', 'f7400000-0000-0000-0000-000000000001', 'Em training',
  ((current_date + 5)::timestamp + time '18:00') at time zone 'Europe/Helsinki', ((current_date + 5)::timestamp + time '19:30') at time zone 'Europe/Helsinki');
insert into matches (id, team_season_id, opponent, kickoff_at, home_away, division) values ('f7800000-0000-0000-0000-000000000001', 'f7400000-0000-0000-0000-000000000001', 'Em Rivals',
  ((current_date + 6)::timestamp + time '19:00') at time zone 'Europe/Helsinki', 'home', 'Em league');

-- ---------- deadlines ----------
select t.check('training: deadline the day before at 20:00', (select reply_by = ((current_date + 4)::timestamp + time '20:00') at time zone 'Europe/Helsinki' from training_sessions where id = 'f7700000-0000-0000-0000-000000000001'));
select t.check('game: deadline two days before at 20:00', (select reply_by = ((current_date + 4)::timestamp + time '20:00') at time zone 'Europe/Helsinki' from matches where id = 'f7800000-0000-0000-0000-000000000001'));
update training_sessions set starts_at = starts_at + interval '1 day', ends_at = ends_at + interval '1 day' where id = 'f7700000-0000-0000-0000-000000000001';
select t.check('moving the training moves its automatic deadline', (select reply_by = ((current_date + 5)::timestamp + time '20:00') at time zone 'Europe/Helsinki' from training_sessions where id = 'f7700000-0000-0000-0000-000000000001'));
select t.login('f7000000-0000-0000-0000-000000000002');
select t.check('a coach sets a deadline', t.rows($$update training_sessions set reply_by = ((current_date + 5)::timestamp + time '12:00') at time zone 'Europe/Helsinki' where id = 'f7700000-0000-0000-0000-000000000001'$$) = 1);
select t.check('a deadline after the start is refused', t.raises($$update matches set reply_by = kickoff_at + interval '1 hour' where id = 'f7800000-0000-0000-0000-000000000001'$$));
select t.check('the view gives players the deadline', (select reply_by is not null from team_schedule where id = 'f7800000-0000-0000-0000-000000000001'));

-- ---------- replies close at the deadline ----------
select t.login('f7000000-0000-0000-0000-000000000003');
select t.check('a player replies before the deadline', t.rows($$update session_attendance set availability = 'yes' where session_id = 'f7700000-0000-0000-0000-000000000001' and player_id = 'f7500000-0000-0000-0000-000000000003'$$) = 1);
select t.admin();
update matches set reply_by = now() - interval '1 minute' where id = 'f7800000-0000-0000-0000-000000000001';
select t.login('f7000000-0000-0000-0000-000000000003');
select t.check('after the deadline the player cannot reply (before kick-off)', t.raises($$update match_availability set availability = 'yes' where match_id = 'f7800000-0000-0000-0000-000000000001' and player_id = 'f7500000-0000-0000-0000-000000000003'$$));
select t.login('f7000000-0000-0000-0000-000000000002');
select t.check('the coach can still record the reply', t.rows($$update match_availability set availability = 'yes' where match_id = 'f7800000-0000-0000-0000-000000000001' and player_id = 'f7500000-0000-0000-0000-000000000003'$$) = 1);
select t.admin();
update matches set reply_by = null where id = 'f7800000-0000-0000-0000-000000000001'; -- back to the automatic deadline

-- ---------- reminders ----------
-- training deadline: day +5 12:00 → the 3-day reminder goes out on day +2, the last call on day +5
select t.check('3 days before: reminders for players who have not replied', app.queue_reminders(((current_date + 2)::timestamp + time '08:05') at time zone 'Europe/Helsinki') = 1);
select t.check('…only the quiet player: not who replied, switched off, or is blocked by fees',
  (select string_agg(to_email::text, ',') from email_outbox where kind = 'reminder_3d' and ref_id = 'f7700000-0000-0000-0000-000000000001') = 'em-quiet@example.test');
select t.check('…in their language, with the event, the deadline and a link to it', (select subject like 'Tuletko? Em training, %' and body_text like '%vastaa viimeistään%12:00%' and body_text like '%/me?m=%#ev-f7700000-0000-0000-0000-000000000001%' and body_html like '%href=%'
  from email_outbox where kind = 'reminder_3d' and ref_id = 'f7700000-0000-0000-0000-000000000001'));
select t.check('running again sends nothing twice', app.queue_reminders(((current_date + 2)::timestamp + time '09:00') at time zone 'Europe/Helsinki') = 0);
select t.check('other days: no reminder', app.queue_reminders(((current_date + 3)::timestamp + time '08:05') at time zone 'Europe/Helsinki') = 0);
select t.check('last day: the last call is queued', app.queue_reminders(((current_date + 5)::timestamp + time '08:05') at time zone 'Europe/Helsinki') >= 1);
select t.check('…to the player who has not replied', exists (select 1 from email_outbox where kind = 'reminder_last' and ref_id = 'f7700000-0000-0000-0000-000000000001' and to_email = 'em-quiet@example.test'));
select t.check('game reminders are queued 3 days before their deadline', app.queue_reminders(((current_date + 1)::timestamp + time '08:05') at time zone 'Europe/Helsinki') >= 1);
select t.check('game reminders name the opponent', (select subject from email_outbox where kind = 'reminder_3d' and ref_id = 'f7800000-0000-0000-0000-000000000001' and to_email = 'em-quiet@example.test') like 'Tuletko? Ottelu vs Em Rivals,%');
select t.check('no reminders to a player who switched them off or is blocked by fees', (select count(*) from email_outbox where kind like 'reminder%' and to_email in ('em-off@example.test', 'em-owes@example.test')) = 0);

-- ---------- approval email ----------
update profiles set role = 'player', locale = 'fr' where id = 'f7000000-0000-0000-0000-000000000007';
select t.login('f7000000-0000-0000-0000-000000000001');
update profiles set status = 'active' where id = 'f7000000-0000-0000-0000-000000000007';
select t.admin();
select t.check('approval: an email in the member''s language with the sign-in link', (select subject like 'Bienvenue à Afro Foot Club%' and body_text like '%Eva%' and body_text like '%/login%'
  from email_outbox where kind = 'approved' and ref_id = 'f7000000-0000-0000-0000-000000000007'));
update profiles set status = 'suspended' where id = 'f7000000-0000-0000-0000-000000000007';
update profiles set status = 'active' where id = 'f7000000-0000-0000-0000-000000000007';
select t.check('approval: reactivating sends nothing', (select count(*) from email_outbox where kind = 'approved' and ref_id = 'f7000000-0000-0000-0000-000000000007') = 1);

-- ---------- request alerts ----------
select t.anon();
insert into tryout_requests (id, first_name, last_name, date_of_birth, email, phone, position) values ('f7900000-0000-0000-0000-000000000001', 'Ty', 'Tryout', '2002-02-02', 'em-try@example.test', '+358401234567', 'forward');
insert into contact_messages (id, name, email, topic, message) values ('f7900000-0000-0000-0000-000000000002', 'Sy Sponsor', 'em-sp@example.test', 'partnership', 'We want to support the club.');
select t.admin();
select t.check('request alerts go to info@afrofoot.club with the name and the inbox link', (select count(*) from email_outbox where kind = 'request_alert' and to_email = 'info@afrofoot.club'
  and ((subject = 'New tryout request: Ty Tryout') or (subject = 'New sponsor enquiry: Sy Sponsor')) and body_text like '%/admin/requests%') = 2);
select t.check('alerts carry no contact details of the sender', not exists (select 1 from email_outbox where kind = 'request_alert' and (body_text like '%em-try@%' or body_text like '%+35840%' or body_text like '%support the club%')));

-- ---------- who can see the outbox ----------
select t.login('f7000000-0000-0000-0000-000000000004');
select t.check('a player sees no emails, not even their own', (select count(*) from email_outbox) = 0);
select t.login('f7000000-0000-0000-0000-000000000002');
select t.check('a coach sees no emails or templates', (select count(*) from email_outbox) = 0 and (select count(*) from email_templates) = 0);
select t.check('a coach cannot read the email status', t.raises($$select * from email_status()$$));
select t.anon();
select t.check('anon reads nothing', t.raises($$select 1 from email_outbox$$) and not exists (select 1 from site_settings where key = 'email'));
select t.login('f7000000-0000-0000-0000-000000000001');
select t.check('an admin reads the outbox and the status (no key here)', (select count(*) from email_outbox) >= 5 and (select not key_set from email_status()));
select t.check('nobody can queue or send from the app', t.raises($$select app.send_outbox()$$) and t.raises($$select app.queue_reminders()$$));
select t.login('f7000000-0000-0000-0000-000000000004');
select t.check('a player switches reminders off for themselves', t.rows($$update profiles set reminder_emails = false where id = 'f7000000-0000-0000-0000-000000000004'$$) = 1);

-- ---------- sending ----------
select t.admin();
select t.check('without the Resend key nothing is sent and emails wait', app.send_outbox() = 0 and not exists (select 1 from email_outbox where status <> 'queued'));
update email_outbox set created_at = now() - interval '3 days' where kind = 'approved';
select app.send_outbox();
select t.check('emails older than 2 days expire instead of going out late', (select status from email_outbox where kind = 'approved' limit 1) = 'expired');
select t.check('release 0.36.0 present', exists (select 1 from app_releases where version = '0.36.0'));
rollback;
