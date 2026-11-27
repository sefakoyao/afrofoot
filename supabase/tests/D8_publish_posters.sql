-- 0074 Publish posters: a news article with the poster, social posts with the poster as the image, tryouts on the calendar.
begin;
create or replace function t.service() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fe500000-0000-0000-0000-000000000001', 'pp-admin@example.test', '{"first_name":"Pp","last_name":"Admin"}'),
 ('fe500000-0000-0000-0000-000000000002', 'pp-player@example.test', '{"first_name":"Pp","last_name":"Player"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fe500000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id = 'fe500000-0000-0000-0000-000000000002';

select t.login('fe500000-0000-0000-0000-000000000002');
select t.check('a player cannot publish a poster', t.raises($$select publish_poster('welcome', 'Welcome Pp', 'Hello', 'posters/published/00000000-0000-0000-0000-000000000001.jpg', array['facebook'], null)$$));

select t.login('fe500000-0000-0000-0000-000000000001');
select t.check('an unknown poster kind is refused', t.raises($$select publish_poster('party', 'A title', '', 'posters/published/00000000-0000-0000-0000-000000000001.jpg', null, null)$$));
select t.check('a picture outside the published posters is refused', t.raises($$select publish_poster('welcome', 'A title', '', 'posters/bg/00000000-0000-0000-0000-000000000001.jpg', null, null)$$));
select t.check('a too short title is refused', t.raises($$select publish_poster('welcome', 'A', '', 'posters/published/00000000-0000-0000-0000-000000000001.jpg', null, null)$$));
select t.check('an unknown platform is refused', t.raises($$select publish_poster('welcome', 'A title', '', 'posters/published/00000000-0000-0000-0000-000000000001.jpg', array['myspace'], null)$$));
select t.check('a posting time more than 60 days ahead is refused', t.raises($$select publish_poster('welcome', 'A title', '', 'posters/published/00000000-0000-0000-0000-000000000001.jpg', array['facebook'], null, now() + interval '61 days')$$));
select t.check('an X caption over 280 characters with the link is refused', t.raises($$select publish_poster('welcome', 'A title', '', 'posters/published/00000000-0000-0000-0000-000000000001.jpg', array['x'], jsonb_build_object('x', repeat('a', 270) || ' {link}'))$$));

create temp table pp_ids (k text, id uuid);
grant all on pp_ids to authenticated;
insert into pp_ids select 'welcome', publish_poster('welcome', 'Welcome to the club, Pp Player', 'Pp joins us from FC Example.', 'posters/published/00000000-0000-0000-0000-000000000001.jpg',
  array['facebook', 'instagram', 'x'], jsonb_build_object('instagram', 'Welcome! Link in bio'), now() + interval '2 hours');
select t.check('the article is published with the poster as its picture', (select status::text = 'published' and cover_path = 'posters/published/00000000-0000-0000-0000-000000000001.jpg' and excerpt = 'Pp joins us from FC Example.' and author_id = auth.uid()
  from news_posts where id = (select id from pp_ids where k = 'welcome')));
select t.check('one waiting post per platform, at the chosen time, with the poster', (select count(*) = 3 and bool_and(status = 'waiting' and image_path = 'posters/published/00000000-0000-0000-0000-000000000001.jpg' and post_at > now() + interval '100 minutes')
  from social_posts where news_post_id = (select id from pp_ids where k = 'welcome')));
select t.check('the default caption carries the article''s address', (select caption like '%/news/welcome-to-the-club-pp-player%' from social_posts where news_post_id = (select id from pp_ids where k = 'welcome') and platform = 'facebook'));
select t.check('a written caption is used as is', (select caption = 'Welcome! Link in bio' from social_posts where news_post_id = (select id from pp_ids where k = 'welcome') and platform = 'instagram'));
select t.check('the X caption fits in 280 characters', (select char_length(caption) <= 280 from social_posts where news_post_id = (select id from pp_ids where k = 'welcome') and platform = 'x'));
select t.check('people cannot change a post''s picture', t.raises($$update social_posts set image_path = 'posters/published/00000000-0000-0000-0000-000000000002.jpg' where news_post_id = (select id from pp_ids where k = 'welcome') and platform = 'facebook'$$));
insert into pp_ids select 'again', publish_poster('welcome', 'Welcome to the club, Pp Player', '', 'posters/published/00000000-0000-0000-0000-000000000003.jpg', null, null);
select t.check('a second poster with the same title gets its own address', (select slug = 'welcome-to-the-club-pp-player-2' from news_posts where id = (select id from pp_ids where k = 'again')));

-- an open tryout: the article and the club calendar
insert into pp_ids select 'tryout', publish_poster('tryout', 'Open tryouts', 'All levels welcome.', 'posters/published/00000000-0000-0000-0000-000000000004.jpg', array[]::text[], null, null,
  jsonb_build_object('starts_at', (now() + interval '10 days')::text, 'ends_at', (now() + interval '10 days 90 minutes')::text, 'place', 'Pp Park'));
select t.check('an open tryout goes on the public club calendar', (select count(*) = 1 and bool_and(public and kind = 'other' and description like 'Pp Park%') from club_events where title = 'Open tryouts'));
select t.check('…without social posts when no platform is chosen', (select count(*) = 0 from social_posts where news_post_id = (select id from pp_ids where k = 'tryout')));
select t.check('a tryout with a broken date is refused', t.raises($$select publish_poster('tryout', 'Open tryouts', '', 'posters/published/00000000-0000-0000-0000-000000000005.jpg', null, null, null, '{"starts_at":"not a date"}'::jsonb)$$));
select t.check('publishing is audited (the article)', exists (select 1 from audit_log where table_name = 'news_posts' and record_id = (select id from pp_ids where k = 'tryout')));
rollback;
