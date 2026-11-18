-- 0049 Football quiz: members read active questions; club facts from live data respect the opt-outs. t.* helpers of 10_rls.sql.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f6000000-0000-0000-0000-000000000001', 'qz-admin@example.test', '{"first_name":"Qz","last_name":"Admin"}'),
 ('f6000000-0000-0000-0000-000000000002', 'qz-player@example.test', '{"first_name":"Qz","last_name":"Player"}'),
 ('f6000000-0000-0000-0000-000000000003', 'qz-pending@example.test', '{"first_name":"Qz","last_name":"Pending"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f6000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id = 'f6000000-0000-0000-0000-000000000002';
insert into players (id, profile_id, first_name, last_name, status) values ('f6500000-0000-0000-0000-000000000002', 'f6000000-0000-0000-0000-000000000002', 'Qz', 'Player', 'active');
-- club data: seasons 2024–2026, three scorers (one hidden by the club, one who opted out)
update federation_teams set is_club = false;
insert into federation_teams (external_id, name, is_club) values ('6600001', 'Qz Club', true) on conflict (external_id) do update set is_club = true;
update federation_competitions set show_publicly = false;
insert into federation_competitions (external_id, name, category, season, kind) values
 ('qz24/M6/1', 'Qz 2024', 'Miesten Kutonen', 2024, 'league'), ('qz25/M5/1', 'Qz 2025', 'Miesten Vitonen', 2025, 'league'),
 ('qz26/M4/1', 'Qz 2026', 'Miesten Nelonen', 2026, 'league'), ('qzcup26/MSC/1', 'Qz Cup', 'Miesten Suomen Cup', 2026, 'cup'), ('qzfr26/H/1', 'Qz friendlies', 'Harjoitukset', 2026, 'friendly');
insert into federation_players (external_id, team_external_id, display_name, player_id) values
 ('66001', '6600001', 'Qz Striker', null), ('66002', '6600001', 'Qz Winger', null), ('66003', '6600001', 'Qz Hidden', null),
 ('66004', '6600001', 'Qz Player', 'f6500000-0000-0000-0000-000000000002'), ('66005', '6600001', 'Qz Old Star', null);
update federation_players set hidden = true where external_id = '66003';
update players set website_hidden = true where id = 'f6500000-0000-0000-0000-000000000002';
insert into federation_player_stats (player_external_id, competition_external_id, appearances, goals) values
 ('66001', 'qz26/M4/1', 18, 9), ('66001', 'qzcup26/MSC/1', 2, 2), ('66002', 'qz25/M5/1', 20, 7), ('66003', 'qz26/M4/1', 18, 30),
 ('66004', 'qz26/M4/1', 18, 25), ('66005', 'qz24/M6/1', 20, 40), ('66002', 'qzfr26/H/1', 3, 15);

-- ---------- questions ----------
select t.login('f6000000-0000-0000-0000-000000000002');
select t.check('a player reads the active questions (12 rules to start with)', (select count(*) from quiz_questions) >= 12);
select t.check('a player cannot change questions', t.rows($$update quiz_questions set answer = 1$$) = 0 and t.raises($$insert into quiz_questions (question, options, answer) values ('{"en":"x"}', '["a","b"]', 0)$$));
select t.login('f6000000-0000-0000-0000-000000000003');
select t.check('a member waiting for approval reads none', (select count(*) from quiz_questions) = 0);
select t.anon();
select t.check('anon reads none', t.raises($$select 1 from quiz_questions$$));
select t.login('f6000000-0000-0000-0000-000000000001');
select t.check('an admin adds a question', t.rows($$insert into quiz_questions (question, options, answer, explain) values ('{"en":"Q?","fi":"K?"}', '[{"en":"A"},{"en":"B"}]', 1, '{"en":"Because."}')$$) = 1);
select t.check('the right answer must be one of the options', t.raises($$insert into quiz_questions (question, options, answer) values ('{"en":"Q?"}', '[{"en":"A"},{"en":"B"}]', 2)$$));
select t.check('every question has an English text', t.raises($$insert into quiz_questions (question, options, answer) values ('{"fi":"K?"}', '[{"en":"A"},{"en":"B"}]', 0)$$));
select t.check('an inactive question is hidden from players', t.rows($$update quiz_questions set active = false where question ->> 'en' = 'Q?'$$) = 1);
select t.login('f6000000-0000-0000-0000-000000000002');
select t.check('…like this', not exists (select 1 from quiz_questions where question ->> 'en' = 'Q?'));

-- ---------- club facts ----------
select t.check('club facts: the last two seasons, league and cup', (select (quiz_club_facts() -> 'seasons')::text) = '[2025, 2026]');
select t.check('club facts: top scorers of those seasons, without hidden or opted-out players or friendlies',
  (select string_agg(x ->> 'name' || ':' || (x ->> 'goals'), ',') from jsonb_array_elements(quiz_club_facts() -> 'scorers') x) = 'Qz Striker:11,Qz Winger:7');
select t.check('club facts: the leagues played, by their Finnish names', (select quiz_club_facts() -> 'leagues') @> '["Kutonen", "Vitonen", "Nelonen"]'::jsonb);
select t.check('club facts: the founding year from the club settings', (select (quiz_club_facts() ->> 'founded')::int) = 2020);
select t.login('f6000000-0000-0000-0000-000000000003');
select t.check('club facts: not for members waiting for approval', t.raises($$select quiz_club_facts()$$));
select t.anon();
select t.check('club facts: not for anon', t.raises($$select quiz_club_facts()$$));
select t.admin();
select t.check('release 0.37.0 present', exists (select 1 from app_releases where version = '0.37.0'));
rollback;
