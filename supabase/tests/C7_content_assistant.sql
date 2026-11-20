-- 0064 Content assistant: who may publish, topics found in the club's data, approving publishes and queues posts.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('f5000000-0000-0000-0000-000000000001', 'ca-admin@example.test', '{"first_name":"Ca","last_name":"Admin"}'),
 ('f5000000-0000-0000-0000-000000000002', 'ca-comms@example.test', '{"first_name":"Ca","last_name":"Comms"}'),
 ('f5000000-0000-0000-0000-000000000003', 'ca-p1@example.test', '{"first_name":"Yaa","last_name":"Public"}'),
 ('f5000000-0000-0000-0000-000000000004', 'ca-p2@example.test', '{"first_name":"Kojo","last_name":"Private"}');
update profiles set role = 'club_admin', status = 'active' where id = 'f5000000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id in ('f5000000-0000-0000-0000-000000000002', 'f5000000-0000-0000-0000-000000000003', 'f5000000-0000-0000-0000-000000000004');
insert into players (id, profile_id, first_name, last_name, show_publicly) values
 ('f5500000-0000-0000-0000-000000000003', 'f5000000-0000-0000-0000-000000000003', 'Yaa', 'Public', true),
 ('f5500000-0000-0000-0000-000000000004', 'f5000000-0000-0000-0000-000000000004', 'Kojo', 'Private', false);
insert into teams (id, name, slug) values ('f5100000-0000-0000-0000-000000000001', 'Ca team', 'ca-team');
insert into seasons (id, name, starts_on, ends_on) values ('f5200000-0000-0000-0000-000000000001', 'Ca season', '2026-01-01', '2027-12-31');
insert into team_seasons (id, team_id, season_id) values ('f5300000-0000-0000-0000-000000000001', 'f5100000-0000-0000-0000-000000000001', 'f5200000-0000-0000-0000-000000000001');
insert into team_players (team_season_id, player_id) values ('f5300000-0000-0000-0000-000000000001', 'f5500000-0000-0000-0000-000000000003'), ('f5300000-0000-0000-0000-000000000001', 'f5500000-0000-0000-0000-000000000004');
insert into matches (id, team_season_id, opponent, kickoff_at, event_type, status, goals_for, goals_against) values
 ('f5600000-0000-0000-0000-000000000001', 'f5300000-0000-0000-0000-000000000001', 'Ca Rovers', now() - interval '1 day', 'friendly', 'played', 2, 1),
 ('f5600000-0000-0000-0000-000000000002', 'f5300000-0000-0000-0000-000000000001', 'Ca United', now() + interval '2 days', 'friendly', 'scheduled', null, null),
 ('f5600000-0000-0000-0000-000000000003', 'f5300000-0000-0000-0000-000000000001', 'Ca Old', now() - interval '10 days', 'friendly', 'played', 0, 0);
insert into match_squad (match_id, player_id, status, shirt_number) values ('f5600000-0000-0000-0000-000000000001', 'f5500000-0000-0000-0000-000000000003', 'starter', 7), ('f5600000-0000-0000-0000-000000000001', 'f5500000-0000-0000-0000-000000000004', 'starter', 9);
insert into match_events (match_id, type, side, minute, player_id) values
 ('f5600000-0000-0000-0000-000000000001', 'goal', 'us', 12, 'f5500000-0000-0000-0000-000000000003'),
 ('f5600000-0000-0000-0000-000000000001', 'goal', 'us', 70, 'f5500000-0000-0000-0000-000000000004'),
 ('f5600000-0000-0000-0000-000000000001', 'goal', 'opponent', 55, null);
update matches set status = 'played', goals_for = 2, goals_against = 1 where id = 'f5600000-0000-0000-0000-000000000001';

-- who may publish
select t.login('f5000000-0000-0000-0000-000000000002');
select t.check('a member is not a publisher', not public.can_publish());
select t.check('…and cannot list topics', t.raises($$select * from public.content_candidates()$$));
select t.check('…nor add themselves as a communications person', t.raises($$insert into content_editors (profile_id) values ('f5000000-0000-0000-0000-000000000002')$$));
select t.login('f5000000-0000-0000-0000-000000000001');
select t.check('admin names the communications person', t.rows($$insert into content_editors (profile_id) values ('f5000000-0000-0000-0000-000000000002')$$) = 1);
select t.login('f5000000-0000-0000-0000-000000000002');
select t.check('the communications person can publish', public.can_publish());

-- topics
create temp table c7 as select * from public.content_candidates();
select t.check('match report for the game played yesterday, not for the one 10 days ago', exists (select 1 from c7 where source_key = 'match_report:f5600000-0000-0000-0000-000000000001')
  and not exists (select 1 from c7 where source_key = 'match_report:f5600000-0000-0000-0000-000000000003'));
select t.check('…score 2–1 with the minutes', (select facts ->> 'goals_for' || '-' || (facts ->> 'goals_against') || '|' || (facts -> 'opponent_goal_minutes')::text from c7 where kind = 'match_report' and source_key like '%f5600000-0000-0000-0000-000000000001') = '2-1|[55]');
select t.check('…a scorer''s name only if shown publicly (Yaa yes, Kojo no)', (select string_agg(coalesce(g ->> 'scorer', '–'), ',' order by (g ->> 'minute')::int) from c7, jsonb_array_elements(facts -> 'our_goals') g where source_key like 'match_report:f5600000-0000-0000-0000-000000000001') = 'Yaa Public,–');
select t.check('preview for the game in 2 days', exists (select 1 from c7 where source_key = 'match_preview:f5600000-0000-0000-0000-000000000002'));
-- a suggestion is saved: the same topic is not offered again
insert into article_suggestions (id, kind, source_key, facts, title, excerpt, body_md, translations, social, checks)
values ('f5800000-0000-0000-0000-000000000001', 'match_report', 'match_report:f5600000-0000-0000-0000-000000000001', '{}', 'Afro Foot win 2–1 against Ca Rovers', 'A late goal decided it.', 'Ca team won 2–1 at home against Ca Rovers. Yaa Public opened the scoring.',
        '{"fi": {"title": "Afro Foot voitti Ca Roversin 2–1", "body_md": "Ca team voitti kotonaan 2–1."}}',
        '{"facebook": "FI: Voitto! EN: A win!", "instagram": "Voitto! A win! #afrofoot", "tiktok": "2–1 🔥"}', '{"Check the scorer of the second goal"}');
select t.check('a topic already suggested is not offered again', not exists (select 1 from public.content_candidates() where source_key = 'match_report:f5600000-0000-0000-0000-000000000001'));
select t.check('one suggestion per topic', t.raises($$insert into article_suggestions (kind, source_key, facts, title, body_md) values ('match_report', 'match_report:f5600000-0000-0000-0000-000000000001', '{}', 'Again', 'Twenty characters at least.')$$));

-- approve
select t.check('an unknown platform is refused', t.raises($$select public.approve_suggestion('f5800000-0000-0000-0000-000000000001', now() + interval '2 hours', array['myspace'])$$));
create temp table c7b (post uuid);
grant all on c7b to authenticated;
insert into c7b select public.approve_suggestion('f5800000-0000-0000-0000-000000000001', now() + interval '2 hours', array['facebook', 'instagram'], '{"facebook": "Edited caption {link}"}', 'https://www.example.test');
select t.check('approving publishes the article', (select status::text || '|' || slug from news_posts where id = (select post from c7b)) = 'published|afro-foot-win-2-1-against-ca-rovers');
select t.check('…with its Finnish text', (select translations -> 'fi' ->> 'title' from news_posts where id = (select post from c7b)) = 'Afro Foot voitti Ca Roversin 2–1');
select t.check('…two social posts waiting (Facebook with the edited caption, no TikTok)', (select string_agg(platform || ':' || status || ':' || left(caption, 6), ',' order by platform) from social_posts where news_post_id = (select post from c7b)) = 'facebook:waiting:Edited,instagram:waiting:Voitto');
select t.check('…{link} becomes the article address', (select caption from social_posts where news_post_id = (select post from c7b) and platform = 'facebook') = 'Edited caption https://www.example.test/news/afro-foot-win-2-1-against-ca-rovers');
select t.check('…the suggestion is approved and linked', (select status = 'approved' and news_post_id = (select post from c7b) and decided_by = 'f5000000-0000-0000-0000-000000000002' from article_suggestions where id = 'f5800000-0000-0000-0000-000000000001'));
select t.check('approving twice is refused', t.raises($$select public.approve_suggestion('f5800000-0000-0000-0000-000000000001', null, array['facebook'])$$));

-- not a publisher any more
select t.login('f5000000-0000-0000-0000-000000000001');
delete from content_editors where profile_id = 'f5000000-0000-0000-0000-000000000002';
select t.login('f5000000-0000-0000-0000-000000000002');
select t.check('removed: no suggestions visible', (select count(*) from article_suggestions) = 0);
select t.check('…cannot approve', t.raises($$select public.approve_suggestion('f5800000-0000-0000-0000-000000000001', null, array['facebook'])$$));
select t.check('…cannot write news', t.raises($$insert into news_posts (slug, title, body_md) values ('x-news', 'X', 'Body text')$$));
select t.anon();
select t.check('visitors cannot read suggestions', t.raises($$select count(*) from article_suggestions$$));
select t.check('visitors see the published article', (select count(*) from news_posts where slug = 'afro-foot-win-2-1-against-ca-rovers') = 1);
rollback;
