-- 0050 More quiz questions: text lengths are checked; club facts add the biggest win, league position, first season and cup seasons.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f7000000-0000-0000-0000-000000000001', 'qm-admin@example.test', '{"first_name":"Qm","last_name":"Admin"}'),
 ('f7000000-0000-0000-0000-000000000002', 'qm-player@example.test', '{"first_name":"Qm","last_name":"Player"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f7000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id = 'f7000000-0000-0000-0000-000000000002';
update federation_teams set is_club = false;
insert into federation_teams (external_id, name, is_club) values ('6700001', 'Qm Club', true), ('6700002', 'Qm Rovers', false), ('6700003', 'Qm United', false)
  on conflict (external_id) do update set is_club = excluded.is_club;
update federation_competitions set show_publicly = false;
insert into federation_competitions (external_id, name, category, season, kind) values
 ('qm22/M7/1', 'Qm 2022', 'Miesten Kutonen', 2022, 'league'), ('qm25/M5/1', 'Qm 2025', 'Miesten Vitonen', 2025, 'league'),
 ('qm26/M4/1', 'Qm 2026', 'Miesten Nelonen', 2026, 'league'), ('qmcup25/MSC/1', 'Qm Cup 25', 'Miesten Suomen Cup', 2025, 'cup'),
 ('qmcup26/MSC/1', 'Qm Cup 26', 'Miesten Suomen Cup', 2026, 'cup');
insert into federation_matches (external_id, competition_external_id, kickoff_at, home_external_id, away_external_id, home_name, away_name, home_goals, away_goals, status) values
 ('qm-1', 'qm26/M4/1', '2026-05-01', '6700001', '6700002', 'Qm Club', 'Qm Rovers', 5, 0, 'played'),
 ('qm-2', 'qm25/M5/1', '2025-05-01', '6700003', '6700001', 'Qm United', 'Qm Club', 1, 3, 'played'),
 ('qm-3', 'qm22/M7/1', '2022-05-01', '6700001', '6700003', 'Qm Club', 'Qm United', 9, 0, 'played');
insert into federation_standings (competition_external_id, position, team_external_id, team_name, played, won, drawn, lost, goals_for, goals_against, points) values
 ('qm26/M4/1', 2, '6700001', 'Qm Club', 10, 7, 1, 2, 30, 10, 22), ('qm26/M4/1', 1, '6700002', 'Qm Rovers', 10, 8, 0, 2, 25, 12, 24),
 ('qm26/M4/1', 3, '6700003', 'Qm United', 10, 1, 1, 8, 5, 30, 4);

select t.login('f7000000-0000-0000-0000-000000000002');
select t.check('the quiz has 33 rules questions after 0050', (select count(*) from quiz_questions where topic = 'rules') >= 33);
select t.check('club facts: biggest win of the last two seasons, not older', (select quiz_club_facts() -> 'biggest_win' ->> 'opponent') = 'Qm Rovers'
  and (select (quiz_club_facts() -> 'biggest_win' ->> 'gf')::int) = 5);
select t.check('club facts: recent opponents', (select quiz_club_facts() -> 'opponents') = '["Qm Rovers", "Qm United"]'::jsonb);
select t.check('club facts: league position and table size', (select quiz_club_facts() -> 'position' ->> 'position') = '2' and (select quiz_club_facts() -> 'position' ->> 'teams') = '3');
select t.check('club facts: first league season', (select (quiz_club_facts() ->> 'first_league_season')::int) = 2022);
select t.check('club facts: Finnish Cup seasons', (select (quiz_club_facts() ->> 'cup_seasons')::int) = 2);

select t.login('f7000000-0000-0000-0000-000000000001');
select t.check('a question text is at most 300 characters', t.raises(format($$insert into quiz_questions (question, options, answer) values (%L, '[{"en":"A"},{"en":"B"}]', 0)$$, jsonb_build_object('en', repeat('x', 301)))));
select t.check('an option is at most 150 characters', t.raises(format($$insert into quiz_questions (question, options, answer) values ('{"en":"Q?"}', %L, 0)$$, jsonb_build_array(jsonb_build_object('en', 'A'), jsonb_build_object('en', repeat('x', 151))))));
select t.check('an explanation is at most 600 characters', t.raises(format($$insert into quiz_questions (question, options, answer, explain) values ('{"en":"Q?"}', '[{"en":"A"},{"en":"B"}]', 0, %L)$$, jsonb_build_object('fi', repeat('x', 601)))));
select t.check('only the four languages', t.raises($$insert into quiz_questions (question, options, answer) values ('{"en":"Q?","de":"F?"}', '[{"en":"A"},{"en":"B"}]', 0)$$));
select t.check('every option has an English text', t.raises($$insert into quiz_questions (question, options, answer) values ('{"en":"Q?"}', '[{"en":"A"},{"fi":"B"}]', 0)$$));
select t.check('a full valid question is accepted', t.rows($$insert into quiz_questions (question, options, answer, explain, source) values ('{"en":"Q2?","ar":"س؟"}', '[{"en":"A","fr":"A"},{"en":"B"},{"en":"C"}]', 2, '{"en":"Why."}', 'Test')$$) = 1);
rollback;
