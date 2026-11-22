-- 0071 Social media publishing: the app claims due posts once, only the app marks them sent, people retry or cancel.
begin;
create or replace function t.service() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
insert into auth.users (id, email, raw_user_meta_data) values
 ('fc100000-0000-0000-0000-000000000001', 'sp-admin@example.test', '{"first_name":"Sp","last_name":"Admin"}'),
 ('fc100000-0000-0000-0000-000000000002', 'sp-player@example.test', '{"first_name":"Sp","last_name":"Player"}');
update profiles set role = 'club_admin', status = 'active' where id = 'fc100000-0000-0000-0000-000000000001';
update profiles set role = 'player', status = 'active' where id = 'fc100000-0000-0000-0000-000000000002';
insert into news_posts (id, slug, title, body_md, status, published_at) values ('fc200000-0000-0000-0000-000000000001', 'sp-news', 'Sp news', 'Body text', 'published', now());

select t.login('fc100000-0000-0000-0000-000000000001');
select t.check('a publisher queues posts (waiting)', t.rows($$insert into social_posts (id, news_post_id, platform, caption, post_at) values
  ('fc300000-0000-0000-0000-000000000001', 'fc200000-0000-0000-0000-000000000001', 'facebook', 'Due now', now() - interval '5 minutes'),
  ('fc300000-0000-0000-0000-000000000002', 'fc200000-0000-0000-0000-000000000001', 'instagram', 'Later', now() + interval '2 hours'),
  ('fc300000-0000-0000-0000-000000000003', 'fc200000-0000-0000-0000-000000000001', 'tiktok', 'Tiktok due', now() - interval '5 minutes')$$) = 3);
select t.check('LinkedIn and X posts can be queued', t.rows($$insert into social_posts (id, news_post_id, platform, caption, post_at) values
  ('fc300000-0000-0000-0000-000000000004', 'fc200000-0000-0000-0000-000000000001', 'linkedin', 'Linkedin text', now() + interval '1 day'),
  ('fc300000-0000-0000-0000-000000000005', 'fc200000-0000-0000-0000-000000000001', 'x', 'Short X text', now() + interval '1 day')$$) = 2);
select t.check('an X post longer than 280 characters is refused', t.raises($$insert into social_posts (news_post_id, platform, caption) values ('fc200000-0000-0000-0000-000000000001', 'x', repeat('a', 281))$$));
select t.check('unknown platforms are refused', t.raises($$insert into social_posts (news_post_id, platform, caption) values ('fc200000-0000-0000-0000-000000000001', 'myspace', 'X')$$));
select t.check('…but cannot queue a post as already sent', t.raises($$insert into social_posts (news_post_id, platform, caption, status) values ('fc200000-0000-0000-0000-000000000001', 'facebook', 'X', 'posted')$$));
select t.check('a publisher cannot mark a post as sent', t.raises($$update social_posts set status = 'posted', external_url = 'https://facebook.com/1' where id = 'fc300000-0000-0000-0000-000000000001'$$));
select t.check('…nor as being sent', t.raises($$update social_posts set status = 'posting' where id = 'fc300000-0000-0000-0000-000000000001'$$));
select t.check('a publisher edits a waiting caption', t.rows($$update social_posts set caption = 'Due now, edited' where id = 'fc300000-0000-0000-0000-000000000001'$$) = 1);
select t.check('people cannot claim posts (app only)', t.raises($$select * from public.claim_social_posts(array['facebook'])$$));
select t.check('…nor one post', t.raises($$select * from public.claim_social_post('fc300000-0000-0000-0000-000000000001')$$));
select t.check('…nor ping the job', t.raises($$select app.ping_social_publisher()$$));
select t.check('admins see the job status', (select count(*) from public.social_job_status()) = 1);
select t.check('automatic posting starts switched off', (select value = '{"facebook": false, "instagram": false, "linkedin": false, "x": false}'::jsonb from site_settings where key = 'social_posting'));
select t.check('the website social links (setting "social") are left alone', not exists (select 1 from site_settings where key = 'social' and not is_public));
select t.login('fc100000-0000-0000-0000-000000000002');
select t.check('members cannot see the job status', t.raises($$select * from public.social_job_status()$$));
select t.check('members see no social posts', (select count(*) from social_posts) = 0);
select t.anon();
select t.check('visitors cannot read the social setting', (select count(*) from site_settings where key = 'social_posting') = 0);

-- approving a suggestion drafted before LinkedIn and X: their texts come from the others
select t.service();
insert into article_suggestions (id, kind, source_key, title, excerpt, body_md, facts, social, status) values
 ('fc400000-0000-0000-0000-000000000001', 'event', 'sp:1', 'Sp camp opens', 'Excerpt text here', repeat('Body text. ', 20), '{}', '{"facebook": "FB text {link}", "instagram": "IG text", "tiktok": "TT"}', 'new');
select t.login('fc100000-0000-0000-0000-000000000001');
select t.check('approve with LinkedIn and X', public.approve_suggestion('fc400000-0000-0000-0000-000000000001', null, array['facebook', 'linkedin', 'x'], null, 'https://www.example.test') is not null);
select t.check('…LinkedIn gets the Facebook text with the link', (select caption from social_posts where suggestion_id = 'fc400000-0000-0000-0000-000000000001' and platform = 'linkedin') = 'FB text https://www.example.test/news/sp-camp-opens');
select t.check('…X gets the headline, the link and the hashtag', (select caption from social_posts where suggestion_id = 'fc400000-0000-0000-0000-000000000001' and platform = 'x') = 'Sp camp opens https://www.example.test/news/sp-camp-opens #afrofootclub');
select t.service();
insert into article_suggestions (id, kind, source_key, title, excerpt, body_md, facts, social, status) values
 ('fc400000-0000-0000-0000-000000000002', 'event', 'sp:2', 'Sp long', 'Excerpt text here', repeat('Body text. ', 20), '{}', '{"facebook": "FB"}', 'new');
select t.login('fc100000-0000-0000-0000-000000000001');
select t.check('an X text too long with the link is refused', t.raises($$select public.approve_suggestion('fc400000-0000-0000-0000-000000000002', null, array['x'], jsonb_build_object('x', repeat('a', 260) || ' {link}'), 'https://www.example.test')$$));
delete from social_posts where suggestion_id = 'fc400000-0000-0000-0000-000000000001';

-- the app (service role)
select t.service();
select t.check('the app claims only due posts of switched-on platforms', (select array_agg(id::text) from public.claim_social_posts(array['facebook', 'instagram'])) = array['fc300000-0000-0000-0000-000000000001']);
select t.check('…marked as being sent, one attempt', (select status = 'posting' and attempts = 1 from social_posts where id = 'fc300000-0000-0000-0000-000000000001'));
select t.check('a second run does not take it again', (select count(*) from public.claim_social_posts(array['facebook', 'instagram'])) = 0);
select t.check('TikTok waits while it is not switched on', (select status = 'waiting' from social_posts where id = 'fc300000-0000-0000-0000-000000000003'));
select t.login('fc100000-0000-0000-0000-000000000001');
select t.check('a post being sent cannot be edited', t.raises($$update social_posts set caption = 'X' where id = 'fc300000-0000-0000-0000-000000000001'$$));
select t.service();
update social_posts set status = 'posted', external_id = '123_456', external_url = 'https://www.facebook.com/123_456', posted_at = now() where id = 'fc300000-0000-0000-0000-000000000001';
select t.check('the app marks it posted with its link', (select status = 'posted' and external_url like 'https://%' from social_posts where id = 'fc300000-0000-0000-0000-000000000001'));
select t.login('fc100000-0000-0000-0000-000000000001');
select t.check('a sent post cannot be cancelled', t.raises($$update social_posts set status = 'cancelled' where id = 'fc300000-0000-0000-0000-000000000001'$$));

-- failing, retry, post now
select t.service();
update social_posts set post_at = now() - interval '1 minute' where id = 'fc300000-0000-0000-0000-000000000002';
select t.check('the Instagram post is claimed when due', (select count(*) from public.claim_social_posts(array['instagram'])) = 1);
update social_posts set status = 'failed', error = 'Image could not be read' where id = 'fc300000-0000-0000-0000-000000000002';
select t.login('fc100000-0000-0000-0000-000000000001');
select t.check('a failed caption can be fixed', t.rows($$update social_posts set caption = 'Fixed' where id = 'fc300000-0000-0000-0000-000000000002'$$) = 1);
select t.check('Retry: a failed post waits again', t.rows($$update social_posts set status = 'waiting' where id = 'fc300000-0000-0000-0000-000000000002'$$) = 1);
select t.check('…and its reason is cleared', (select status = 'waiting' and error is null from social_posts where id = 'fc300000-0000-0000-0000-000000000002'));
select t.check('changes are audited', exists (select 1 from audit_log where table_name = 'social_posts' and action = 'UPDATE'));
select t.service();
update social_posts set post_at = now() - interval '5 days', status = 'waiting' where id = 'fc300000-0000-0000-0000-000000000002';
select t.check('old posts are not sent automatically', (select count(*) from public.claim_social_posts(array['instagram'])) = 0);
select t.check('…but Post now takes them', (select count(*) from public.claim_social_post('fc300000-0000-0000-0000-000000000002')) = 1);
update social_posts set updated_at = now() - interval '20 minutes' where id = 'fc300000-0000-0000-0000-000000000002';
select t.check('a run that stopped half-way is not sent again', (select count(*) from public.claim_social_posts(array['instagram'])) = 0);
select t.check('…it becomes failed with the reason', (select status = 'failed' and error like 'Interrupted%' from social_posts where id = 'fc300000-0000-0000-0000-000000000002'));
rollback;
