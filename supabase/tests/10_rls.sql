-- RLS / constraint / workflow tests. Run by run_tests.sh against a throw-away database.
create schema t; grant usage on schema t to public;
create function t.check(name text, cond boolean) returns void language plpgsql as $$
begin if cond is true then raise notice 'PASS %', name; else raise exception 'FAIL %', name; end if; end $$;
create function t.raises(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;
create function t.rows(sql text) returns int language plpgsql as $$ declare n int; begin execute sql; get diagnostics n = row_count; return n; end $$;
create function t.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated'; end $$;
create function t.anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon'; end $$;
create function t.admin() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
grant execute on all functions in schema t to public;

begin;
-- ---------- fixtures (as superuser) ----------
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000001','super@x.io','{"role":"super_admin"}'),
 ('00000000-0000-0000-0000-000000000002','admin@x.io','{}'),
 ('00000000-0000-0000-0000-000000000003','coacha@x.io','{}'),
 ('00000000-0000-0000-0000-000000000004','coachb@x.io','{}'),
 ('00000000-0000-0000-0000-000000000011','p1@x.io','{"first_name":"Pa"}'),
 ('00000000-0000-0000-0000-000000000012','p2@x.io','{}'),
 ('00000000-0000-0000-0000-000000000013','p3@x.io','{}'),
 ('00000000-0000-0000-0000-000000000099','pending@x.io','{}');
select t.check('signup ignores role in metadata (pending player)', (select role = 'player' and status = 'pending' from profiles where email = 'super@x.io'));
update profiles set role='super_admin', status='active' where email='super@x.io';
update profiles set role='club_admin',  status='active' where email='admin@x.io';
update profiles set role='coach',  status='active' where email in ('coacha@x.io','coachb@x.io');
update profiles set role='player', status='active' where email in ('p1@x.io','p2@x.io','p3@x.io');
insert into seasons (id,name,starts_on,ends_on,is_current) values ('10000000-0000-0000-0000-000000000001','2026','2026-01-01','2026-12-31',true);
insert into teams (id,name,slug) values ('20000000-0000-0000-0000-00000000000a','Afro Foot A','afro-foot-a'),('20000000-0000-0000-0000-00000000000b','Afro Foot B','afro-foot-b');
insert into team_seasons (id,team_id,season_id) values ('30000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-00000000000b','20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-000000000001');
insert into staff_members (id,profile_id,first_name,last_name,type,is_public) values
 ('40000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000003','Coach','A','head_coach',true),
 ('40000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000004','Coach','B','head_coach',false);
insert into team_staff (team_season_id,staff_id) values ('30000000-0000-0000-0000-00000000000a','40000000-0000-0000-0000-00000000000a'),('30000000-0000-0000-0000-00000000000b','40000000-0000-0000-0000-00000000000b');
insert into players (id,profile_id,first_name,last_name,status,show_publicly) values
 ('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','Pa','One','active',true),
 ('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000012','Pa','Two','active',false),
 ('50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000013','Pa','Three','active',true);
insert into team_players (team_season_id,player_id,jersey_number) values
 ('30000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-000000000001',10),
 ('30000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-000000000002',7),
 ('30000000-0000-0000-0000-00000000000b','50000000-0000-0000-0000-000000000003',10);
insert into player_private (player_id,phone,emergency_name,emergency_phone) values
 ('50000000-0000-0000-0000-000000000001','+358401111111','Mum','+358402222222'),('50000000-0000-0000-0000-000000000002','+358403333333','Dad','+358404444444');
insert into player_medical (player_id,allergies) values ('50000000-0000-0000-0000-000000000001','peanuts');
insert into membership_plans (id,name,amount_cents) values ('60000000-0000-0000-0000-000000000001','Season 2026',12000);
insert into memberships (id,player_id,plan_id,season_id,status) values ('61000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','active');
insert into payments (player_id,membership_id,amount_cents,status,paid_at) values
 ('50000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001',12000,'paid',now()),
 ('50000000-0000-0000-0000-000000000002',null,5000,'pending',null);
insert into pages (slug,title,status) values ('about','About','published'),('secret','Secret','draft');
insert into news_posts (slug,title,status,published_at) values ('hello','Hello','published',now() - interval '1 day'),('soon','Soon','published',now() + interval '1 day'),('d','Draft','draft',null);
insert into sponsors (name,tier,active) values ('Montel Intergalactic','main',true),('Hidden','partner',false);

-- ---------- anonymous visitor ----------
select t.anon();
select t.check('anon sees published pages only', (select count(*) from pages) = 1);
select t.check('anon sees only already-published news', (select count(*) from news_posts) = 1);
select t.check('anon sees active sponsors only', (select count(*) from sponsors) = 1);
select t.check('anon sees public site settings', (select count(*) from site_settings) >= 4);
select t.check('anon cannot read players table', t.raises('select * from players'));
select t.check('anon cannot read payments', t.raises('select * from payments'));
select t.check('anon cannot read profiles', t.raises('select * from profiles'));
select t.check('public_players exposes only consented players', (select count(*) from public_players) = 2 and not exists (select 1 from public_players where display_name = 'Pa Two'));
select t.check('public_players has no private columns', not exists (select 1 from information_schema.columns where table_name = 'public_players' and column_name in ('date_of_birth','phone','email','status','profile_id')));
select t.check('public_staff shows only public staff', (select count(*) from public_staff) = 1);
insert into contact_messages (name,email,message) values ('Visitor','v@x.io','Hello club!');
select t.check('anon can submit contact form', true);
select t.check('anon cannot read contact messages', t.raises('select * from contact_messages'));
select t.check('anon cannot self-assign status on contact form', t.raises($$insert into contact_messages (name,email,message,status) values ('V','v@x.io','Hello there','accepted')$$));
select t.check('contact form validates email', t.raises($$insert into contact_messages (name,email,message) values ('V','not-an-email','Hello there')$$));
insert into join_requests (name,email,position,message) values ('Newbie','n@x.io','forward','I want to play');
select t.check('anon can submit join request', true);
select t.check('anon cannot call finance_summary', t.raises($$select * from finance_summary('10000000-0000-0000-0000-000000000001')$$));
select t.admin();

-- ---------- pending (unapproved) user ----------
select t.login('00000000-0000-0000-0000-000000000099');
select t.check('pending user sees no seasons', (select count(*) from seasons) = 0);
select t.check('pending user sees own profile', (select count(*) from profiles) = 1);
select t.admin();

-- ---------- player 1 ----------
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('player sees only own player row', (select count(*) from players) = 1);
select t.check('player sees own private data', (select count(*) from player_private) = 1);
select t.check('player sees own medical data', (select count(*) from player_medical) = 1);
select t.check('player sees teammates through roster view only', (select count(*) from team_roster) = 2 and not exists (select 1 from team_roster where display_name = 'Pa Three'));
select t.check('player can update own height', not t.raises($$update players set height_cm = 182 where id = '50000000-0000-0000-0000-000000000001'$$));
select t.check('player cannot change own status', t.raises($$update players set status = 'alumni' where id = '50000000-0000-0000-0000-000000000001'$$));
update players set height_cm = 150 where id = '50000000-0000-0000-0000-000000000002';
select t.admin();
select t.check('player cannot update another player (0 rows)', (select height_cm from players where id = '50000000-0000-0000-0000-000000000002') is null);
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('player cannot promote self', t.raises($$update profiles set role = 'club_admin' where id = auth.uid()$$));
select t.check('player cannot change own status', t.raises($$update profiles set status = 'pending' where id = auth.uid()$$));
select t.check('player can edit own name', not t.raises($$update profiles set first_name = 'Paul' where id = auth.uid()$$));
select t.check('player cannot change email', t.raises($$update profiles set email = 'x@x.io' where id = auth.uid()$$));
select t.check('player sees own payments only', (select count(*) from payments) = 1);
select t.check('player sees own membership only', (select count(*) from memberships) = 1);
select t.check('player cannot write payments', t.raises($$insert into payments (player_id,amount_cents) values ('50000000-0000-0000-0000-000000000001',100)$$));
select t.check('player cannot read audit log', (select count(*) from audit_log) = 0);
select t.check('player cannot read expenses', (select count(*) from expenses) = 0);
select t.check('player cannot read contact messages', (select count(*) from contact_messages) = 0);
select t.check('player cannot create matches', t.raises($$insert into matches (team_season_id,opponent,kickoff_at) values ('30000000-0000-0000-0000-00000000000a','X',now())$$));
select t.check('player cannot delete audit log', t.raises('delete from audit_log'));
select t.admin();

-- ---------- coach A ----------
select t.login('00000000-0000-0000-0000-000000000003');
select t.check('coach sees own team players only', (select count(*) from players) = 2);
select t.check('coach sees emergency contacts of own players', (select count(*) from player_private) = 2);
select t.check('coach cannot see medical notes', (select count(*) from player_medical) = 0);
select t.check('coach cannot see payments', (select count(*) from payments) = 0);
select t.check('coach cannot see memberships', (select count(*) from memberships) = 0);
select t.check('coach cannot change player status', t.rows($$update players set status = 'inactive'$$) = 0);
select t.check('coach cannot edit another team session', t.raises($$insert into training_sessions (team_season_id,title,starts_at,ends_at) values ('30000000-0000-0000-0000-00000000000b','Hack',now(),now()+interval '1 hour')$$));
insert into training_sessions (id,team_season_id,title,starts_at,ends_at) values ('70000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','Tuesday training', now() + interval '2 days', now() + interval '2 days 90 minutes');
select t.check('coach created session for own team', true);
select t.check('attendance rows created for roster', (select count(*) from session_attendance) = 2);
select t.check('session end must be after start', t.raises($$insert into training_sessions (team_season_id,title,starts_at,ends_at) values ('30000000-0000-0000-0000-00000000000a','Bad',now(),now())$$));
insert into matches (id,team_season_id,opponent,kickoff_at,division) values ('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','FC Rivals', now() + interval '5 days','M4 Group A');
insert into match_squad (match_id,player_id,status,shirt_number) values ('80000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','starter',10);
select t.check('duplicate shirt number in a squad rejected', t.raises($$insert into match_squad (match_id,player_id,status,shirt_number) values ('80000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','starter',10)$$));
select t.check('played match requires a score', t.raises($$update matches set status = 'played' where id = '80000000-0000-0000-0000-000000000001'$$));
select t.check('coach can record a result', not t.raises($$update matches set status = 'played', goals_for = 3, goals_against = 1 where id = '80000000-0000-0000-0000-000000000001'$$));
insert into match_player_stats (match_id,player_id,minutes,goals) values ('80000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',90,2);
select t.check('coach can mark attendance', not t.raises($$update session_attendance set attendance = 'present', marked_by = auth.uid(), marked_at = now() where player_id = '50000000-0000-0000-0000-000000000001'$$));
insert into evaluations (id,player_id,evaluator_id,summary,visible_to_player) values ('90000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','Good progress',false);
insert into evaluation_scores (evaluation_id,criterion_id,score) select '90000000-0000-0000-0000-000000000001', id, 4 from evaluation_criteria limit 3;
select t.check('coach cannot evaluate a player outside own team', t.raises($$insert into evaluations (player_id,evaluator_id) values ('50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003')$$));
select t.check('score outside 1-5 rejected', t.raises($$insert into evaluation_scores (evaluation_id,criterion_id,score) select '90000000-0000-0000-0000-000000000001', id, 9 from evaluation_criteria offset 5 limit 1$$));
insert into announcements (id,title,body,audience,team_season_id,created_by) values ('a0000000-0000-0000-0000-000000000001','Kit day','Bring your boots','team','30000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000003');
select t.check('coach cannot target another team', t.raises($$insert into announcements (title,body,audience,team_season_id,created_by) values ('x','y','team','30000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000003')$$));
select t.check('coach cannot broadcast to everyone', t.raises($$insert into announcements (title,body,audience,created_by) values ('x','y','everyone','00000000-0000-0000-0000-000000000003')$$));
select t.check('coach publishes team announcement → 2 notifications + coach', public.publish_announcement('a0000000-0000-0000-0000-000000000001') = 3);
select t.check('audit log hidden from coach', (select count(*) from audit_log) = 0);
select t.check('coach cannot call finance_summary', t.raises($$select * from finance_summary('10000000-0000-0000-0000-000000000001')$$));
select t.admin();

-- ---------- player 1 again: attendance, squads, evaluations, notifications ----------
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('player sees only own attendance row', (select count(*) from session_attendance) = 1);
select t.check('player can answer availability', not t.raises($$update session_attendance set availability = 'yes', responded_at = now() where player_id = auth.uid() or true$$));
select t.check('player cannot mark own attendance', t.raises($$update session_attendance set attendance = 'late'$$));
select t.check('player availability for match', not t.raises($$update match_availability set availability = 'yes', responded_at = now()$$));
select t.check('squad hidden until published', (select count(*) from match_squad) = 0);
select t.check('evaluation hidden until shared', (select count(*) from evaluations) = 0);
select t.check('player sees team match', (select count(*) from matches) = 1);
select t.check('player sees team stats', (select count(*) from match_player_stats) = 1);
select t.check('player received the announcement', (select count(*) from announcements) = 1 and (select count(*) from notifications) = 1);
select t.check('player can mark notification read', not t.raises($$update notifications set read_at = now()$$));
select t.check('player cannot rewrite notification', t.raises($$update notifications set title = 'hacked'$$));
select t.check('player cannot publish announcements', t.raises($$select public.publish_announcement('a0000000-0000-0000-0000-000000000001')$$));
select t.admin();
update matches set squad_published = true where id = '80000000-0000-0000-0000-000000000001';
update evaluations set visible_to_player = true;
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('squad visible once published', (select count(*) from match_squad) = 1);
select t.check('evaluation visible once shared', (select count(*) from evaluations) = 1 and (select count(*) from evaluation_scores) = 3);
select t.admin();

-- ---------- player 3 / coach B isolation ----------
select t.login('00000000-0000-0000-0000-000000000013');
select t.check('other-team player sees no team A matches', (select count(*) from matches) = 0);
select t.check('other-team player sees no team A sessions', (select count(*) from training_sessions) = 0);
select t.check('other-team player not notified', (select count(*) from notifications) = 0 and (select count(*) from announcements) = 0);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000004');
select t.check('coach B sees only team B players', (select count(*) from players) = 1);
select t.check('coach B cannot see team A evaluations', (select count(*) from evaluations) = 0);
select t.check('coach B cannot see team A matches', (select count(*) from matches) = 0);
select t.admin();

-- ---------- club admin & super admin ----------
select t.login('00000000-0000-0000-0000-000000000002');
select t.check('admin sees all payments', (select count(*) from payments) = 2);
select t.check('admin sees all players', (select count(*) from players) = 3);
select t.check('admin reads contact messages and join requests', (select count(*) from contact_messages) = 1 and (select count(*) from join_requests) = 1);
select t.check('admin can approve a pending user', not t.raises($$update profiles set status = 'active' where email = 'pending@x.io'$$));
select t.check('admin cannot create another admin', t.raises($$update profiles set role = 'club_admin' where email = 'p3@x.io'$$));
select t.check('admin cannot demote super admin', t.raises($$update profiles set role = 'player' where email = 'super@x.io'$$));
select t.check('admin cannot suspend super admin', t.raises($$update profiles set status = 'suspended' where email = 'super@x.io'$$));
select t.check('admin can make a coach', not t.raises($$update profiles set role = 'coach' where email = 'p3@x.io'$$));
select t.check('finance summary works for admin', (select income_cents from finance_summary('10000000-0000-0000-0000-000000000001')) = 12000);
select t.check('admin can read audit log', (select count(*) from audit_log) > 5);
select t.check('audit log never stores private contact values', not exists (select 1 from audit_log where table_name in ('player_private','player_medical') and (new_data::text ~ '358401111111|peanuts' or old_data::text ~ '358401111111|peanuts')));
select t.check('profile role changes are audited', exists (select 1 from audit_log where table_name = 'profiles' and action = 'UPDATE'));
select t.check('admin cannot edit audit log', t.raises($$update audit_log set action = 'x'$$));
select t.check('admin cannot delete audit log', t.raises($$delete from audit_log$$));
select t.admin();
select t.login('00000000-0000-0000-0000-000000000001');
select t.check('super admin can create an admin', not t.raises($$update profiles set role = 'club_admin' where email = 'p3@x.io'$$));
select t.check('last super admin cannot be removed', t.raises($$update profiles set role = 'club_admin' where email = 'super@x.io'$$));
select t.admin();

-- ---------- data integrity ----------
select t.check('one current season only', t.raises($$insert into seasons (name,starts_on,ends_on,is_current) values ('2027','2027-01-01','2027-12-31',true)$$));
select t.check('jersey unique per team season', t.raises($$insert into team_players (team_season_id,player_id,jersey_number) values ('30000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-000000000003',10)$$));
select t.check('payment amount must be positive', t.raises($$insert into payments (player_id,amount_cents) values ('50000000-0000-0000-0000-000000000001',0)$$));
select t.check('paid payment needs paid_at', t.raises($$insert into payments (player_id,amount_cents,status) values ('50000000-0000-0000-0000-000000000001',100,'paid')$$));
select t.check('one membership per player per season', t.raises($$insert into memberships (player_id,plan_id,season_id) values ('50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')$$));
select t.check('published news needs a date', t.raises($$insert into news_posts (slug,title,status) values ('x','x','published')$$));
select t.check('history kept: team season with matches/roster cannot be deleted', t.raises($$delete from team_seasons where id = '30000000-0000-0000-0000-00000000000a'$$));
select t.check('player with stats cannot be deleted', t.raises($$delete from players where id = '50000000-0000-0000-0000-000000000001'$$));
insert into matches (team_season_id,opponent,kickoff_at,division) values ('30000000-0000-0000-0000-00000000000a','Next FC', now() + interval '9 days','M4 Group A');
insert into players (id,first_name,last_name) values ('50000000-0000-0000-0000-000000000004','Late','Joiner');
insert into team_players (team_season_id,player_id,jersey_number) values ('30000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-000000000004',22);
select t.check('new roster member gets future attendance rows', exists (select 1 from session_attendance where player_id = '50000000-0000-0000-0000-000000000004') and exists (select 1 from match_availability where player_id = '50000000-0000-0000-0000-000000000004'));
-- ---------- multilingual content ----------
select t.check('translations accept fi and fr', not t.raises($$update pages set translations = '{"fi":{"title":"Tietoa"},"fr":{"title":"À propos"}}' where slug = 'about'$$));
select t.check('translations reject other languages', t.raises($$update pages set translations = '{"de":{"title":"Über uns"}}' where slug = 'about'$$));
select t.check('translations reject non-object values', t.raises($$update pages set translations = '{"fi":"Tietoa"}' where slug = 'about'$$));
select t.check('localized() returns the Finnish title', (select app.localized(title, translations, 'fi', 'title') from pages where slug = 'about') = 'Tietoa');
select t.check('localized() falls back to English when missing', (select app.localized(title, translations, 'fi', 'body_md') from pages where slug = 'about') = 'About');
select t.check('contact form stores locale', not t.raises($$insert into contact_messages (name,email,message,locale) values ('Visitor','v@x.io','Hei seura!','fi')$$));
select t.check('contact form rejects unknown locale', t.raises($$insert into contact_messages (name,email,message,locale) values ('Visitor','v@x.io','Hallo Klub','de')$$));
select t.check('profile locale limited to en/fi/fr', t.raises($$update profiles set locale = 'de' where email = 'p1@x.io'$$));
select t.anon();
select t.check('anon sees translations of published pages', (select translations -> 'fr' ->> 'title' from pages where slug = 'about') = 'À propos');
select t.check('public_staff exposes translations', exists (select 1 from information_schema.columns where table_name = 'public_staff' and column_name = 'translations'));
select t.admin();
-- ---------- federation mirror ----------
insert into federation_competitions (external_id,name,show_publicly) values ('c1','M4 Group A',true),('c2','Hidden Cup',false);
insert into federation_standings (competition_external_id,team_external_id,team_name,position,played,won,points) values ('c1','t1','Afro Foot',1,8,6,19),('c2','t1','Afro Foot',1,2,2,6);
insert into federation_players (external_id,display_name,player_id) values ('fp1','Pa One','50000000-0000-0000-0000-000000000001'),('fp2','Other','50000000-0000-0000-0000-000000000003');
insert into federation_player_stats (player_external_id,competition_external_id,appearances,goals) values ('fp1','c1',7,3),('fp2','c1',5,1);
select t.anon();
select t.check('anon sees standings only of published competitions', (select count(*) from public_standings) = 1);
select t.check('anon cannot read federation tables', t.raises('select * from federation_standings') and t.raises('select * from federation_players'));
select t.admin();
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('player reads league standings', (select count(*) from federation_standings) = 2);
select t.check('player sees only own federation stats', (select count(*) from federation_player_stats) = 1);
select t.check('player cannot read federation player list', (select count(*) from federation_players) = 0);
select t.check('player cannot write federation data', t.raises($$insert into federation_standings (competition_external_id,team_external_id,team_name,position) values ('c1','t9','X',2)$$));
select t.check('player cannot read sync runs', (select count(*) from sync_runs) = 0);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000002');
select t.check('admin can link a federation player to a club player', not t.raises($$update federation_players set player_id = '50000000-0000-0000-0000-000000000002' where external_id = 'fp2'$$));
select t.check('federation settings hidden from the public', true);
select t.admin();
select t.anon();
select t.check('anon cannot read federation settings', not exists (select 1 from site_settings where key = 'federation'));
select t.admin();

-- ---------- lineups, live events, Arabic ----------
select t.admin();
insert into players (id,first_name,last_name,status,show_publicly)
  select format('51000000-0000-0000-0000-%s', lpad(i::text,12,'0'))::uuid, 'Extra', 'P'||i, 'active', false from generate_series(1,12) i;
insert into team_players (team_season_id,player_id,jersey_number)
  select '30000000-0000-0000-0000-00000000000a', format('51000000-0000-0000-0000-%s', lpad(i::text,12,'0'))::uuid, 30+i from generate_series(1,12) i;
create temp table tt_p (n int primary key, pid uuid, shirt int);
insert into tt_p values (1,'50000000-0000-0000-0000-000000000001',10),(2,'50000000-0000-0000-0000-000000000002',7),(3,'50000000-0000-0000-0000-000000000004',22);
insert into tt_p select 3+i, format('51000000-0000-0000-0000-%s', lpad(i::text,12,'0'))::uuid, 30+i from generate_series(1,12) i;
grant select on tt_p to authenticated, anon;
select t.check('eight formations of eleven slots', (select count(*) from formations) = 8 and (select bool_and(jsonb_array_length(slots) = 11) from formations));
insert into matches (id,team_season_id,opponent,kickoff_at,formation,division) values ('80000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-00000000000a','Lions FC', now() + interval '1 day','4-4-2','M4 Group A');
insert into match_squad (match_id,player_id,status,shirt_number,slot,position)
  select '80000000-0000-0000-0000-000000000002', pid, 'starter', shirt, n, case when n = 1 then 'goalkeeper'::player_position else 'midfielder'::player_position end from tt_p where n <= 11;
insert into match_squad (match_id,player_id,status,shirt_number,slot)
  select '80000000-0000-0000-0000-000000000002', pid, 'substitute', shirt, 5 from tt_p where n between 12 and 15;
select t.check('substitute never keeps a pitch slot', (select count(*) from match_squad where match_id = '80000000-0000-0000-0000-000000000002' and status = 'substitute' and slot is not null) = 0);
select t.check('twelfth starter rejected', t.raises($$insert into match_squad (match_id,player_id,status,shirt_number) select '80000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000012', 'starter', 99$$));
select t.check('duplicate pitch slot rejected', t.raises($$update match_squad set slot = 1 where match_id = '80000000-0000-0000-0000-000000000002' and player_id = '50000000-0000-0000-0000-000000000002'$$));
select t.check('player outside the roster rejected', t.raises($$insert into match_squad (match_id,player_id,status) values ('80000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003','substitute')$$));
update match_squad set captain = true where match_id = '80000000-0000-0000-0000-000000000002' and player_id = '50000000-0000-0000-0000-000000000001';
select t.check('only one captain', t.raises($$update match_squad set captain = true where match_id = '80000000-0000-0000-0000-000000000002' and player_id = '50000000-0000-0000-0000-000000000002'$$));

-- coach of the team runs the match
select t.login('00000000-0000-0000-0000-000000000003');
insert into match_events (match_id,type,minute) values ('80000000-0000-0000-0000-000000000002','kickoff',0);
select t.check('kickoff starts the first half', (select live_state from matches where id = '80000000-0000-0000-0000-000000000002') = 'first_half');
select t.check('lineup locked after kickoff for coaches', t.raises($$update match_squad set slot = 11 where match_id = '80000000-0000-0000-0000-000000000002' and player_id = '50000000-0000-0000-0000-000000000004'$$));
insert into match_events (match_id,type,minute,player_id,assist_player_id) values ('80000000-0000-0000-0000-000000000002','goal',10,'50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000004');
select t.check('goal updates the score', (select goals_for||'-'||goals_against from matches where id = '80000000-0000-0000-0000-000000000002') = '1-0');
insert into match_events (match_id,type,side,minute,opponent_label) values ('80000000-0000-0000-0000-000000000002','goal','opponent',25,'#9');
select t.check('opponent goal counts against', (select goals_for||'-'||goals_against from matches where id = '80000000-0000-0000-0000-000000000002') = '1-1');
insert into match_events (match_id,type,side,minute) values ('80000000-0000-0000-0000-000000000002','own_goal','opponent',33);
select t.check('opponent own goal counts for us', (select goals_for||'-'||goals_against from matches where id = '80000000-0000-0000-0000-000000000002') = '2-1');
update match_events set voided = true where match_id = '80000000-0000-0000-0000-000000000002' and type = 'goal' and side = 'opponent';
select t.check('voiding a goal corrects the score', (select goals_for||'-'||goals_against from matches where id = '80000000-0000-0000-0000-000000000002') = '2-0');
select t.check('assist cannot equal scorer', t.raises($$insert into match_events (match_id,type,minute,player_id,assist_player_id) values ('80000000-0000-0000-0000-000000000002','goal',12,'50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002')$$));
select t.check('cards carry no assist', t.raises($$insert into match_events (match_id,type,minute,player_id,assist_player_id) values ('80000000-0000-0000-0000-000000000002','yellow_card',12,'50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000004')$$));
select t.check('event player must be in the squad', t.raises($$insert into match_events (match_id,type,minute,player_id) values ('80000000-0000-0000-0000-000000000002','yellow_card',12,'50000000-0000-0000-0000-000000000003')$$));
select t.check('goal needs a scorer', t.raises($$insert into match_events (match_id,type,minute) values ('80000000-0000-0000-0000-000000000002','goal',12)$$));
insert into match_events (match_id,type,minute,player_id) values ('80000000-0000-0000-0000-000000000002','yellow_card',30,'51000000-0000-0000-0000-000000000003');
insert into match_events (match_id,type,minute,player_id,player_out_id) values ('80000000-0000-0000-0000-000000000002','substitution',60,'51000000-0000-0000-0000-000000000009','51000000-0000-0000-0000-000000000001');
select t.check('substitute cannot come on twice', t.raises($$insert into match_events (match_id,type,minute,player_id,player_out_id) values ('80000000-0000-0000-0000-000000000002','substitution',65,'51000000-0000-0000-0000-000000000009','51000000-0000-0000-0000-000000000002')$$));
select t.check('player already off cannot go off again', t.raises($$insert into match_events (match_id,type,minute,player_id,player_out_id) values ('80000000-0000-0000-0000-000000000002','substitution',66,'51000000-0000-0000-0000-000000000010','51000000-0000-0000-0000-000000000001')$$));
select t.check('a starter cannot come on as substitute', t.raises($$insert into match_events (match_id,type,minute,player_id,player_out_id) values ('80000000-0000-0000-0000-000000000002','substitution',66,'51000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000003')$$));
insert into match_events (match_id,type,minute,player_id) values ('80000000-0000-0000-0000-000000000002','red_card',70,'51000000-0000-0000-0000-000000000002');
insert into match_events (match_id,type,minute) values ('80000000-0000-0000-0000-000000000002','half_time',45),('80000000-0000-0000-0000-000000000002','second_half',46);
select t.check('second half state', (select live_state from matches where id = '80000000-0000-0000-0000-000000000002') = 'second_half');
select t.check('coach cannot delete events', (t.rows($$delete from match_events where type = 'note'$$)) = 0);
insert into match_events (match_id,type,minute) values ('80000000-0000-0000-0000-000000000002','full_time',90);
select t.check('full time marks the match played', (select status::text from matches where id = '80000000-0000-0000-0000-000000000002') = 'played');
select t.check('stats: goal and assist', (select goals from match_player_stats where player_id = '50000000-0000-0000-0000-000000000002' and match_id = '80000000-0000-0000-0000-000000000002') = 1
  and (select assists from match_player_stats where player_id = '50000000-0000-0000-0000-000000000004' and match_id = '80000000-0000-0000-0000-000000000002') = 1);
select t.check('stats: minutes for substituted players', (select minutes from match_player_stats where player_id = '51000000-0000-0000-0000-000000000001' and match_id = '80000000-0000-0000-0000-000000000002') = 60
  and (select minutes from match_player_stats where player_id = '51000000-0000-0000-0000-000000000009' and match_id = '80000000-0000-0000-0000-000000000002') = 30);
select t.check('stats: cards', (select yellow_cards from match_player_stats where player_id = '51000000-0000-0000-0000-000000000003' and match_id = '80000000-0000-0000-0000-000000000002') = 1
  and (select red_card from match_player_stats where player_id = '51000000-0000-0000-0000-000000000002' and match_id = '80000000-0000-0000-0000-000000000002'));
select t.check('stats: goalkeeper clean sheet', (select clean_sheet from match_player_stats where player_id = '50000000-0000-0000-0000-000000000001' and match_id = '80000000-0000-0000-0000-000000000002'));
select t.check('coach cannot add events after full time', t.raises($$insert into match_events (match_id,type,minute) values ('80000000-0000-0000-0000-000000000002','note',91)$$));
select t.check('coach cannot void events after full time', t.raises($$update match_events set voided = true where type = 'yellow_card' and match_id = '80000000-0000-0000-0000-000000000002'$$));
select t.admin();

-- other roles
select t.login('00000000-0000-0000-0000-000000000004');
select t.check('other coach sees no events', (select count(*) from match_events) = 0);
select t.check('other coach cannot log events', t.raises($$insert into match_events (match_id,type,minute) values ('80000000-0000-0000-0000-000000000002','note',5)$$));
select t.admin();
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('teammate reads events, not voided ones', (select count(*) from match_events where match_id = '80000000-0000-0000-0000-000000000002') > 0 and (select count(*) from match_events where voided) = 0);
select t.check('player cannot log events', t.raises($$insert into match_events (match_id,type,minute) values ('80000000-0000-0000-0000-000000000002','note',5)$$));
select t.check('player cannot change a lineup', t.raises($$update match_squad set status = 'not_selected' where match_id = '80000000-0000-0000-0000-000000000002'$$) or t.rows($$update match_squad set status = 'not_selected' where match_id = '80000000-0000-0000-0000-000000000002'$$) = 0);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000002');
select t.check('admin corrects a finished match', not t.raises($$update match_events set voided = true where type = 'yellow_card' and match_id = '80000000-0000-0000-0000-000000000002'$$));
select t.check('correction recomputes stats', (select yellow_cards from match_player_stats where player_id = '51000000-0000-0000-0000-000000000003' and match_id = '80000000-0000-0000-0000-000000000002') = 0);
select t.check('admin can edit lineup after kickoff', not t.raises($$update match_squad set captain = false where match_id = '80000000-0000-0000-0000-000000000002'$$));
select t.check('events are audited', exists (select 1 from audit_log where table_name = 'match_events'));
select t.admin();
insert into match_events (match_id,type,minute,player_id,note) values ('80000000-0000-0000-0000-000000000002','injury',20,'51000000-0000-0000-0000-000000000004','knock');
update team_seasons set is_public = true where id = '30000000-0000-0000-0000-00000000000a';

-- public exposure
select t.anon();
select t.check('public timeline hides injuries and voided events', (select count(*) from public_match_events where match_id = '80000000-0000-0000-0000-000000000002' and type = 'injury') = 0);
select t.check('public timeline hides names of private players', not exists (select 1 from public_match_events where player_label like 'Pa Two%' or player_label like 'Extra%'));
select t.check('lineup hidden until published', (select count(*) from public_lineups where match_id = '80000000-0000-0000-0000-000000000002') = 0);
select t.check('anon cannot read raw events', t.raises('select * from match_events'));
select t.admin();
update matches set squad_published = true where id = '80000000-0000-0000-0000-000000000002';
select t.anon();
select t.check('published lineup is public with safe labels', (select count(*) from public_lineups where match_id = '80000000-0000-0000-0000-000000000002') = 15
  and not exists (select 1 from public_lineups where player_label like 'Extra%'));
select t.admin();

-- Arabic
select t.check('Arabic translations accepted', not t.raises($$update pages set translations = '{"ar":{"title":"من نحن"}}' where slug = 'about'$$));
select t.check('Arabic locale accepted on profile', not t.raises($$update profiles set locale = 'ar' where email = 'p1@x.io'$$));
select t.check('Arabic locale accepted on contact form', not t.raises($$insert into contact_messages (name,email,message,locale) values ('Zaid','z@x.io','مرحبا','ar')$$));

-- ---------- tryouts + billing ----------
select t.admin();
select t.check('Finnish reference check digit', app.finnish_reference(123456) = '1234561');
select t.anon();
select t.check('anyone can apply for a tryout', not t.raises($$insert into tryout_requests (phone,first_name,last_name,date_of_birth,email,previous_team,palloliitto_url,position) values ('+358401111','Ade','Okoro','2000-05-01','ade@x.io','FC Helsinki','https://tulospalvelu.palloliitto.fi/player/12345','forward')$$));
select t.check('tryout link must be a Palloliitto result-service address', t.raises($$insert into tryout_requests (phone,position,first_name,last_name,date_of_birth,email,palloliitto_url) values ('+358400000','midfielder','Bad','Link','2000-05-01','bad@x.io','https://evil.example/tulospalvelu.palloliitto.fi/x')$$));
select t.check('phone and position are required', t.raises($$insert into tryout_requests (first_name,last_name,date_of_birth,email) values ('No','Phone','1999-05-01','np@x.io')$$));
select t.check('tryout link is optional', not t.raises($$insert into tryout_requests (phone,position,first_name,last_name,date_of_birth,email) values ('+358400000','midfielder','No','Link','1999-05-01','nolink@x.io')$$));
select t.check('under-18 needs a guardian', t.raises($$insert into tryout_requests (phone,position,first_name,last_name,date_of_birth,email) values ('+358400000','midfielder','Kid','Young', current_date - 365*14,'kid@x.io')$$));
select t.check('under-18 with guardian accepted', not t.raises($$insert into tryout_requests (phone,position,first_name,last_name,date_of_birth,email,guardian_name,guardian_phone) values ('+358400000','midfielder','Kid','Young', current_date - 365*14,'kid@x.io','Parent','+358401234567')$$));
select t.check('duplicate open tryout rejected', t.raises($$insert into tryout_requests (phone,position,first_name,last_name,date_of_birth,email) values ('+358400000','midfielder','Ade','Okoro','2000-05-01','ADE@x.io')$$));
select t.check('applicant cannot set review fields', t.raises($$insert into tryout_requests (phone,position,first_name,last_name,date_of_birth,email,status) values ('+358400000','midfielder','Sneaky','One','2000-01-01','s@x.io','accepted')$$));
select t.check('anon cannot read tryouts', t.raises('select * from tryout_requests'));
select t.admin();
select t.login('00000000-0000-0000-0000-000000000003');
select t.check('coach cannot read tryout applications', (select count(*) from tryout_requests) = 0);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000002');
select t.check('admin sees applications with age', (select count(*) from tryout_requests_admin where age is not null) = 3);
select t.check('admin schedules a tryout', not t.raises($$update tryout_requests set status = 'in_review', tryout_on = current_date + 7, reviewed_by = '00000000-0000-0000-0000-000000000002' where email = 'ade@x.io'$$));
select t.admin();
-- billing
insert into membership_plans (name, amount_cents, period) values ('Monthly sample', 1500, 'month'), ('Quarterly sample', 4000, 'quarter'), ('Yearly sample', 14000, 'year');
select t.check('monthly, quarterly and yearly plans exist', (select count(distinct period) from membership_plans where period in ('month','quarter','year')) = 3);
insert into payments (player_id, amount_cents, method) values ('50000000-0000-0000-0000-000000000001', 4000, 'bank_transfer'), ('50000000-0000-0000-0000-000000000001', 4000, 'invoice');
select t.check('wire transfer gets a reference number', (select reference from payments where method = 'bank_transfer' and amount_cents = 4000 order by created_at limit 1) ~ '^[0-9]{5,}$');
select t.check('invoice gets number and reference', (select invoice_number is not null and reference is not null from payments where method = 'invoice' limit 1));
insert into payments (player_id, amount_cents, method, provider, provider_ref) values ('50000000-0000-0000-0000-000000000001', 1500, 'mobilepay', 'mobilepay', 'mp-1');
select t.check('MobilePay reference is unique', t.raises($$insert into payments (player_id, amount_cents, method, provider, provider_ref) values ('50000000-0000-0000-0000-000000000001', 1500, 'mobilepay', 'mobilepay', 'mp-1')$$));
select t.check('webhook events are idempotent', not t.raises($$insert into payment_events (provider,event_id,payload) values ('mobilepay','e1','{}')$$) and t.raises($$insert into payment_events (provider,event_id,payload) values ('mobilepay','e1','{}')$$));
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('player cannot read webhook log', t.raises('select * from payment_events'));
select t.check('player sees only own payments', (select count(*) from payments where player_id <> '50000000-0000-0000-0000-000000000001') = 0);
select t.admin();

-- ---------- schedule, ratings, MVP, profile ----------
create function t.service() returns void language plpgsql as $$ begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
select t.service();
insert into training_schedules (id,team_season_id,title,weekday,start_time,duration_min,starts_on,ends_on)
  values ('71000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-00000000000a','Tuesday training',2,'19:00',90,current_date,current_date + 27);
select t.check('weekly schedule creates four sessions in 28 days', public.generate_training_sessions('71000000-0000-0000-0000-000000000001', current_date + 27) = 4);
select t.check('generation is idempotent', public.generate_training_sessions('71000000-0000-0000-0000-000000000001', current_date + 27) = 0);
select t.check('generated sessions are on Tuesdays', (select count(*) from training_sessions where schedule_id = '71000000-0000-0000-0000-000000000001' and extract(isodow from starts_at at time zone 'Europe/Helsinki') = 2) = 4);
select t.check('generated sessions seed attendance', (select count(*) from session_attendance sa join training_sessions s on s.id = sa.session_id where s.schedule_id = '71000000-0000-0000-0000-000000000001') > 0);
select t.login('00000000-0000-0000-0000-000000000003');
select t.check('coach manages own team schedule', not t.raises($$update training_schedules set duration_min = 75 where id = '71000000-0000-0000-0000-000000000001'$$) and public.generate_training_sessions('71000000-0000-0000-0000-000000000001', current_date + 27) = 0);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000004');
select t.check('other coach cannot generate sessions', t.raises($$select public.generate_training_sessions('71000000-0000-0000-0000-000000000001', current_date + 27)$$));
select t.admin();
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('player reads team schedule but cannot change it', (select count(*) from training_schedules) = 1 and t.rows($$update training_schedules set title = 'x'$$) = 0);
select t.admin();
-- ratings
select t.login('00000000-0000-0000-0000-000000000002');
select t.check('admin rates a player', not t.raises($$insert into player_ratings (player_id,season_id,score,category,note) values ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',8.5,'overall','Great season')$$));
select t.check('rating must be 1-10', t.raises($$insert into player_ratings (player_id,season_id,score) values ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',11)$$));
select t.admin();
select t.login('00000000-0000-0000-0000-000000000003');
select t.check('coach cannot see ratings', (select count(*) from player_ratings) = 0 and (select count(*) from player_rating_summary) = 0);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('player cannot see ratings', (select count(*) from player_ratings) = 0);
select t.admin();
-- MVP (match 80..02 finished a moment ago)
select t.service();
select t.check('finished match is stamped', (select completed_at is not null from matches where id = '80000000-0000-0000-0000-000000000002'));
select public.send_mvp_reminders();
select t.check('reminders go to squad players who have not voted', (select count(*) from notifications where kind = 'mvp_vote' and link like '%80000000-0000-0000-0000-000000000002%') = 2);
select public.send_mvp_reminders();
select t.check('no second reminder yet', (select count(*) from notifications where kind = 'mvp_vote' and link like '%80000000-0000-0000-0000-000000000002%') = 2);
update matches set completed_at = now() - interval '13 hours' where id = '80000000-0000-0000-0000-000000000002';
select public.send_mvp_reminders();
select t.check('second reminder after 12 hours', (select count(*) from notifications where kind = 'mvp_vote' and link like '%80000000-0000-0000-0000-000000000002%') = 4);
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('player votes for a teammate', not t.raises($$insert into mvp_votes (match_id,candidate_player_id) values ('80000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002')$$));
select t.check('cannot vote for yourself', t.raises($$insert into mvp_votes (match_id,candidate_player_id) values ('80000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001')$$));
select t.check('one vote per player', t.raises($$insert into mvp_votes (match_id,candidate_player_id) values ('80000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000004')$$));
select t.check('vote can be changed while open', not t.raises($$update mvp_votes set candidate_player_id = '50000000-0000-0000-0000-000000000004' where match_id = '80000000-0000-0000-0000-000000000002'$$));
select t.check('candidate must be in the squad', t.raises($$update mvp_votes set candidate_player_id = '50000000-0000-0000-0000-000000000003' where match_id = '80000000-0000-0000-0000-000000000002'$$));
select t.check('results hidden while voting is open', (select count(*) from public.mvp_result('80000000-0000-0000-0000-000000000002')) = 0);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000012');
select t.check('second player votes', not t.raises($$insert into mvp_votes (match_id,candidate_player_id) values ('80000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000004')$$));
select t.check('players see only their own vote', (select count(*) from mvp_votes) = 1);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000013');
select t.check('player outside the squad cannot vote', t.raises($$insert into mvp_votes (match_id,candidate_player_id) values ('80000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000004')$$));
select t.admin();
select t.anon();
select t.check('no public MVP before 24 hours', (select count(*) from public_mvp) = 0);
select t.admin();
update matches set completed_at = now() - interval '25 hours' where id = '80000000-0000-0000-0000-000000000002';
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('voting closed after 24 hours', t.raises($$update mvp_votes set candidate_player_id = '50000000-0000-0000-0000-000000000002' where match_id = '80000000-0000-0000-0000-000000000002'$$));
select t.check('teammate sees the published result', (select votes from public.mvp_result('80000000-0000-0000-0000-000000000002') where is_winner) = 2);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000004');
select t.check('other coach sees no result', (select count(*) from public.mvp_result('80000000-0000-0000-0000-000000000002')) = 0);
select t.admin();
select t.anon();
select t.check('public MVP appears after 24 hours without leaking private names', (select count(*) from public_mvp where match_id = '80000000-0000-0000-0000-000000000002') = 1 and not exists (select 1 from public_mvp where player_label like 'Late%'));
select t.admin();
-- profile completion
update players set photo_path = null where id = '50000000-0000-0000-0000-000000000004';
select t.check('profile cannot be completed without a picture', t.raises($$update players set profile_completed_at = now() where id = '50000000-0000-0000-0000-000000000004'$$));
select t.check('photo path must be an image in the owner folder', t.raises($$update players set photo_path = '../etc/passwd' where id = '50000000-0000-0000-0000-000000000004'$$));
select t.check('profile cannot be completed without a phone', t.raises($$update players set photo_path = '00000000-0000-0000-0000-000000000099/a.png', date_of_birth = '2000-01-01', position = 'forward', profile_completed_at = now() where id = '50000000-0000-0000-0000-000000000003'$$));
update players set photo_path = '00000000-0000-0000-0000-000000000011/avatar.jpg', date_of_birth = '2001-01-01', position = 'forward' where id = '50000000-0000-0000-0000-000000000001';
select t.check('profile completes with picture, birth date, position and phone', not t.raises($$update players set profile_completed_at = now() where id = '50000000-0000-0000-0000-000000000001'$$));

-- ---------- locations, event types, enrolment ----------
select t.service();
select t.login('00000000-0000-0000-0000-000000000003');
select t.check('coach saves a new location', not t.raises($$insert into locations (name,city,address,latitude,longitude,maps_url,directions,parking,transit) values ('Töölö Pitch','Helsinki','Pitch road 1',60.1875,24.9260,'https://maps.google.com/?q=60.1875,24.9260','Enter by the blue gate','Free street parking','Tram 4, stop Töölö')$$));
select t.check('duplicate location name in a city rejected', t.raises($$insert into locations (name,city) values ('töölö pitch','helsinki')$$));
select t.check('map link must be https', t.raises($$insert into locations (name,maps_url) values ('Bad link','javascript:alert(1)')$$));
select t.check('coordinates come in pairs', t.raises($$insert into locations (name,latitude) values ('Half coords',60.1)$$));
select t.admin();
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('player reads locations (route guide)', (select count(*) from locations where name = 'Töölö Pitch') = 1);
select t.check('player cannot add or change locations', t.raises($$insert into locations (name) values ('Sneaky')$$) and t.rows($$update locations set name = 'x'$$) = 0);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000004');
select t.check('another coach cannot edit it', t.rows($$update locations set name = 'Hijack' where name = 'Töölö Pitch'$$) = 0);
select t.admin();
select t.service();
update training_sessions set location_id = (select id from locations where name = 'Töölö Pitch') where schedule_id = '71000000-0000-0000-0000-000000000001';
update matches set location_id = (select id from locations where name = 'Töölö Pitch') where id = '80000000-0000-0000-0000-000000000002';
select t.check('game requires a division', t.raises($$insert into matches (team_season_id,opponent,kickoff_at) values ('30000000-0000-0000-0000-00000000000a','NoDiv', now() + interval '3 days')$$));
select t.check('friendly needs no division', not t.raises($$insert into matches (team_season_id,opponent,kickoff_at,event_type) values ('30000000-0000-0000-0000-00000000000a','Friendly FC', now() + interval '3 days','friendly')$$));
select t.check('a match cannot be a practice', t.raises($$insert into matches (team_season_id,opponent,kickoff_at,event_type,division) values ('30000000-0000-0000-0000-00000000000a','X', now() + interval '3 days','practice','D')$$));
select t.login('00000000-0000-0000-0000-000000000003');
select t.check('coach calendar mixes practices, games and friendlies', (select count(distinct event_type) from team_schedule) = 3);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000004');
select t.check('other coach sees only own team schedule', (select count(*) from team_schedule where team_season_id = '30000000-0000-0000-0000-00000000000a') = 0);
select t.admin();
select t.anon();
select t.check('public fixtures carry venue address and route link', exists (select 1 from public_fixtures where venue_address = 'Pitch road 1' and venue_maps_url like 'https://%' and event_type = 'game' and division = 'M4 Group A'));
select t.admin();
-- enrolment
select t.service();
update membership_plans set active = false where name = 'Monthly sample';
select t.anon();
select t.check('public plans view lists active plans only', (select count(*) from public_membership_plans) = (select count(*) from public_membership_plans where name <> 'Monthly sample') and not exists (select 1 from public_membership_plans where name = 'Monthly sample') and exists (select 1 from public_membership_plans where name = 'Yearly sample'));
select t.service();
select t.anon();
select t.check('anyone can enrol', not t.raises($$insert into player_enrolments (first_name,last_name,date_of_birth,email,phone,position,terms_accepted,privacy_accepted,payment_method,city) values ('Moh','Diallo','1998-02-02','moh@x.io','+358401234','defender',true,true,'mobilepay','Espoo')$$));
select t.check('terms must be accepted', t.raises($$insert into player_enrolments (first_name,last_name,date_of_birth,email,phone,position,terms_accepted,privacy_accepted) values ('A','B','1998-02-02','a2@x.io','+358401234','defender',false,true)$$));
select t.check('under-18 enrolment needs a guardian', t.raises($$insert into player_enrolments (first_name,last_name,date_of_birth,email,phone,position,terms_accepted,privacy_accepted) values ('Kid','Z', current_date - 365*15,'kz@x.io','+358401234','forward',true,true)$$));
select t.check('duplicate open enrolment rejected', t.raises($$insert into player_enrolments (first_name,last_name,date_of_birth,email,phone,position,terms_accepted,privacy_accepted) values ('Moh','Diallo','1998-02-02','MOH@x.io','+358401234','defender',true,true)$$));
select t.check('anon cannot read enrolments', t.raises('select * from player_enrolments'));
select t.check('applicant cannot self-approve', t.raises($$insert into player_enrolments (first_name,last_name,date_of_birth,email,phone,position,terms_accepted,privacy_accepted,status) values ('S','S','1990-02-02','s2@x.io','+358401234','forward',true,true,'accepted')$$));
select t.admin();
select t.login('00000000-0000-0000-0000-000000000003');
select t.check('coach cannot see or approve enrolments', (select count(*) from player_enrolments) = 0 and t.raises($$select public.approve_enrolment((select id from player_enrolments limit 1))$$) is not null);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000002');
select public.approve_enrolment((select id from player_enrolments where email = 'moh@x.io'));
select t.check('approval creates a prospect player with private contact data', exists (select 1 from players p join player_private pp on pp.player_id = p.id where p.last_name = 'Diallo' and p.status = 'prospect' and pp.phone = '+358401234'));
select t.check('enrolment is marked accepted and linked', exists (select 1 from player_enrolments where email = 'moh@x.io' and status = 'accepted' and player_id is not null));
select t.check('an enrolment cannot be approved twice', t.raises($$select public.approve_enrolment((select id from player_enrolments where email = 'moh@x.io'))$$));
select t.admin();
-- ===== versions & revisions =====
select t.service();
select t.login('00000000-0000-0000-0000-000000000002');
insert into pages (id, slug, title, body_md, status) values ('a0000000-0000-0000-0000-000000000001','about-us','About','First text','published');
select t.check('page creation stores revision 1', (select count(*) from content_revisions where record_id = 'a0000000-0000-0000-0000-000000000001' and revision = 1) = 1);
select set_config('app.change_note','Fix typo', false);
update pages set body_md = 'Second text' where id = 'a0000000-0000-0000-0000-000000000001';
select set_config('app.change_note','', false);
select t.check('edit stores revision 2 with changed field and note', exists (select 1 from content_revisions where record_id = 'a0000000-0000-0000-0000-000000000001' and revision = 2 and changed_fields = array['body_md'] and change_note = 'Fix typo' and changed_by = '00000000-0000-0000-0000-000000000002'));
update pages set body_md = 'Second text' where id = 'a0000000-0000-0000-0000-000000000001';
select t.check('no-op update adds no revision', (select count(*) from content_revisions where record_id = 'a0000000-0000-0000-0000-000000000001') = 2);
select t.check('admin cannot write revisions directly', t.raises($$insert into content_revisions (table_name,record_id,revision,snapshot) values ('pages','a0000000-0000-0000-0000-000000000001',9,'{}')$$));
select public.restore_revision((select id from content_revisions where record_id = 'a0000000-0000-0000-0000-000000000001' and revision = 1));
select t.check('restore writes old text back as draft and adds revision 3', (select body_md = 'First text' and status = 'draft' from pages where id = 'a0000000-0000-0000-0000-000000000001') and exists (select 1 from content_revisions where record_id = 'a0000000-0000-0000-0000-000000000001' and revision = 3 and restored_from is not null));
select t.check('history is never rewritten (3 revisions kept)', (select count(*) from content_revisions where record_id = 'a0000000-0000-0000-0000-000000000001') = 3);
select t.check('club admin cannot add a release', t.raises($$insert into app_releases (version,title) values ('1.0.0','Nope')$$));
select t.check('club admin can read releases', (select count(*) from app_releases) >= 9);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000001');
select t.check('super admin can add a release', not t.raises($$insert into app_releases (version,title,kind,released_at) values ('1.0.0','Launch','feature', now() + interval '1 day')$$));
select t.check('version must be semver', t.raises($$insert into app_releases (version,title) values ('v1','Bad')$$));
select t.admin();
select t.login('00000000-0000-0000-0000-000000000003');
select t.check('coach cannot read revisions or releases', (select count(*) from content_revisions) = 0 and (select count(*) from app_releases) = 0);
select t.check('coach cannot restore', t.raises($$select public.restore_revision((select id from content_revisions limit 1))$$) is not null);
select t.admin();
select t.anon();
select t.check('anon sees only the latest version number', (select version from public_app_version) = '1.0.0' and t.raises('select * from app_releases') and t.raises('select * from content_revisions'));
select t.admin();
-- ===== club fees =====
select t.service();
select t.check('club fees are 20 / 60 / 240 EUR per month / quarter / year', (select count(*) from membership_plans where (name,amount_cents,period::text,currency) in (('Monthly',2000,'month','EUR'),('Quarterly',6000,'quarter','EUR'),('Yearly',24000,'year','EUR'))) = 3);
select t.admin();
-- ===== 0019 fees, invoices, packages =====
select t.service();
select t.check('paytrail is an allowed provider', not t.raises($$insert into payments (player_id, amount_cents, method, provider, provider_ref) values ('50000000-0000-0000-0000-000000000001', 2000, 'bank_transfer', 'paytrail', 'pt-1')$$));
select t.check('unknown provider rejected', t.raises($$insert into payments (player_id, amount_cents, method, provider, provider_ref) values ('50000000-0000-0000-0000-000000000001', 2000, 'bank_transfer', 'evilpay', 'x-1')$$));
select t.admin();
select t.anon();
select t.check('anyone can read active federation fees', (select count(*) from federation_fees where season = 2026 and kind = 'license') = 3);
select t.check('anon cannot change fees', t.raises($$update federation_fees set amount_cents = 1 where kind = 'license'$$));
select t.check('anyone can request an invoice', not t.raises($$insert into invoice_requests (plan_id, full_name, email, address, postal_code, city, consent) select id, 'Ade Okoro', 'ade.inv@x.io', 'Katu 1', '00100', 'Helsinki', true from public_membership_plans where name = 'Quarterly'$$));
select t.check('one open invoice request per email and plan', t.raises($$insert into invoice_requests (plan_id, full_name, email, address, postal_code, city, consent) select id, 'Ade Okoro', 'ADE.INV@x.io', 'Katu 1', '00100', 'Helsinki', true from public_membership_plans where name = 'Quarterly'$$));
select t.check('invoice request needs consent', t.raises($$insert into invoice_requests (plan_id, full_name, email, address, postal_code, city, consent) select id, 'No Consent', 'nc@x.io', 'Katu 1', '00100', 'Helsinki', false from public_membership_plans where name = 'Monthly'$$));
select t.check('anon cannot set an invoice number', t.raises($$insert into invoice_requests (plan_id, full_name, email, address, postal_code, city, consent, invoice_number) select id, 'Sneaky', 'sn@x.io', 'Katu 1', '00100', 'Helsinki', true, 'INV-1' from public_membership_plans where name = 'Yearly'$$));
select t.check('anon cannot read invoice requests', t.raises($$select count(*) from invoice_requests$$));
select t.check('anyone can read sponsor packages', (select count(*) from sponsor_packages) = 4);
select t.check('sponsor enquiry can carry a company', not t.raises($$insert into contact_messages (name,email,topic,message,company) values ('Mari','mari@firma.fi','partnership','We would like to sponsor','Firma Oy')$$));
select t.admin();
select t.login('00000000-0000-0000-0000-000000000003');
select t.check('coach cannot read invoice requests or edit fees', (select count(*) from invoice_requests) = 0 and t.rows($$update federation_fees set amount_cents = 1 returning 1$$) = 0);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000002');
select t.check('admin reads invoice requests and can mark invoiced', (select count(*) from invoice_requests) >= 1 and t.rows($$update invoice_requests set status = 'invoiced', invoice_number = 'AF-2026-001', handled_by = '00000000-0000-0000-0000-000000000002', handled_at = now() where email = 'ade.inv@x.io' returning 1$$) = 1);
select t.check('admin can verify a fee', t.rows($$update federation_fees set verified = true where kind = 'license' and band = 'adult' returning 1$$) = 1);
select t.admin();
-- ===== 0021 insurance prices =====
select t.service();
select t.check('insurance price rows exist and are unverified', (select count(*) from federation_fees where season = 2026 and kind = 'insurance' and amount_cents is not null and not verified) = 7);
select t.check('insurance prices match the 2026 table', (select amount_cents from federation_fees where band = 'born_2015') = 7000 and (select amount_cents from federation_fees where band = 'born_2009_2011') = 23000 and (select amount_cents from federation_fees where band = 'adult_amateur_broad') = 39500);
select t.admin();
-- ===== 0022 payment status and fee-based sign-in block =====
select t.service();
delete from payments where player_id = '50000000-0000-0000-0000-000000000001' and status = 'pending' and due_on is null;
-- player 1 (p1): paid 120 EUR above, now one fee 40 EUR 20 days overdue and one 30 EUR due in 5 days
insert into payments (player_id, amount_cents, status, due_on, method) values
 ('50000000-0000-0000-0000-000000000001', 4000, 'pending', current_date - 20, 'bank_transfer'),
 ('50000000-0000-0000-0000-000000000001', 3000, 'pending', current_date + 5, 'bank_transfer');
select t.check('overdue beyond grace blocks sign-in', app.player_blocked('00000000-0000-0000-0000-000000000011'));
select t.check('auth hook rejects a blocked player with a clear error', public.custom_access_token_hook('{"user_id":"00000000-0000-0000-0000-000000000011","claims":{}}'::jsonb) -> 'error' ->> 'message' = 'membership_fees_overdue');
select t.check('auth hook lets paid-up players in', public.custom_access_token_hook('{"user_id":"00000000-0000-0000-0000-000000000013","claims":{}}'::jsonb) ? 'claims' and not (public.custom_access_token_hook('{"user_id":"00000000-0000-0000-0000-000000000013","claims":{}}'::jsonb) ? 'error'));
select t.check('fees with no due date never block', not app.player_blocked('00000000-0000-0000-0000-000000000012'));
select t.check('coaches and admins are never blocked', not app.player_blocked('00000000-0000-0000-0000-000000000003') and not app.player_blocked('00000000-0000-0000-0000-000000000002'));
select t.check('hook cannot be called by the public', t.raises($$set local role authenticated; select public.custom_access_token_hook('{}'::jsonb)$$));
select t.admin();
-- an already open session of the blocked player loses member reads but keeps its own payments
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('blocked player has no member-level reads', (select count(*) from formations) = 0);
select t.check('blocked player can still see own payments', (select count(*) from my_payments) = 3);
select t.check('summary: paid 120, owed 70, overdue 40, team shown', (select paid_cents = 12000 and owed_cents = 7000 and overdue_cents = 4000 and team_name = 'Afro Foot A' and sign_in_blocked_from = current_date - 20 + 14 from my_payment_summary()));
select t.check('display status marks overdue', (select count(*) from my_payments where display_status = 'overdue') = 1 and (select count(*) from my_payments where display_status = 'paid') = 1);
select t.check('player cannot clear their own exemption or block', t.raises($$update players set fee_exempt_until = current_date + 365 where id = '50000000-0000-0000-0000-000000000001'$$));
select t.check('player cannot disable the policy', t.rows($$update fee_policy set enabled = false returning 1$$) = 0);
select t.check('player cannot see another player''s payments', (select count(*) from my_payments where id in (select id from payments where player_id <> '50000000-0000-0000-0000-000000000001')) = 0);
select t.admin();
select t.login('00000000-0000-0000-0000-000000000013');
select t.check('paid-up player summary shows nothing owed', (select owed_cents = 0 and overdue_cents = 0 from my_payment_summary()));
select t.admin();
select t.login('00000000-0000-0000-0000-000000000002');
select t.check('admin sees the fee overview with the blocked player', exists (select 1 from fee_overview() where player_id = '50000000-0000-0000-0000-000000000001' and blocked and owed_cents = 7000 and days_overdue = 20));
select public.set_fee_exemption('50000000-0000-0000-0000-000000000001', current_date + 30, 'Payment plan agreed');
select t.check('admin exemption unblocks the player', (select not blocked and exempt_until = current_date + 30 from fee_overview() where player_id = '50000000-0000-0000-0000-000000000001'));
select t.check('exemption is audited', exists (select 1 from audit_log where table_name = 'players' and record_id::text = '50000000-0000-0000-0000-000000000001' and action = 'UPDATE'));
select t.admin();
select t.login('00000000-0000-0000-0000-000000000003');
select t.check('coach cannot grant exemptions', t.raises($$select public.set_fee_exemption('50000000-0000-0000-0000-000000000001', current_date + 30, 'x')$$) and t.raises($$select * from public.fee_overview()$$));
select t.admin();
select t.service();
update players set fee_exempt_until = null where id = '50000000-0000-0000-0000-000000000001';
update payments set status = 'paid', paid_at = now() where player_id = '50000000-0000-0000-0000-000000000001' and status = 'pending';
select t.check('paying everything unblocks', not app.player_blocked('00000000-0000-0000-0000-000000000011'));
update fee_policy set enabled = false;
update payments set status = 'pending', paid_at = null where player_id = '50000000-0000-0000-0000-000000000001' and amount_cents = 4000;
select t.check('policy switch off disables blocking', not app.player_blocked('00000000-0000-0000-0000-000000000011'));
update fee_policy set enabled = true, grace_days = 30;
select t.check('longer grace period delays the block', not app.player_blocked('00000000-0000-0000-0000-000000000011'));
select t.admin();

-- ---------- 0023 lineup templates ----------
select t.login('00000000-0000-0000-0000-000000000003');
select t.check('coach A can save a lineup template for own team', not t.raises($$insert into lineup_templates (team_season_id,name,formation,data,coach_notes) values ('30000000-0000-0000-0000-00000000000a','Plan A','4-3-3','{"slots":{"1":1}}','press high')$$));
select t.check('coach A cannot save for another team', t.raises($$insert into lineup_templates (team_season_id,name,formation) values ('30000000-0000-0000-0000-00000000000b','Nope','4-4-2')$$));
select t.check('duplicate name for same team rejected', t.raises($$insert into lineup_templates (team_season_id,name,formation) values ('30000000-0000-0000-0000-00000000000a','Plan A','4-4-2')$$));
select t.check('template data must be an object', t.raises($$insert into lineup_templates (team_season_id,name,formation,data) values ('30000000-0000-0000-0000-00000000000a','Bad','4-4-2','[1]')$$));
select t.check('coach A sees own template', (select count(*) from lineup_templates) = 1);
select t.login('00000000-0000-0000-0000-000000000004');
select t.check('coach B cannot see team A templates', (select count(*) from lineup_templates) = 0);
select t.login('00000000-0000-0000-0000-000000000011');
select t.check('player cannot see templates or private notes', (select count(*) from lineup_templates) = 0);
select t.check('player cannot create templates', t.raises($$insert into lineup_templates (team_season_id,name,formation) values ('30000000-0000-0000-0000-00000000000a','P','4-4-2')$$));
select t.anon();
select t.check('anon has no access to templates', t.raises($$select 1 from lineup_templates$$));
select t.login('00000000-0000-0000-0000-000000000002');
select t.check('club admin sees templates', (select count(*) from lineup_templates) = 1);
select t.admin();
select t.service();
select t.check('template change is audited', exists (select 1 from audit_log where table_name = 'lineup_templates'));
select t.check('release 0.14.0 present', exists (select 1 from app_releases where version = '0.14.0'));

-- ---------- 0024 phone country code ----------
select t.anon();
select t.check('tryout phone without country code rejected', t.raises($$insert into tryout_requests (phone,position,first_name,last_name,date_of_birth,email) values ('0401234567','midfielder','Pho','Ne','2000-01-01','pho1@x.io')$$));
select t.check('tryout phone with country code accepted', not t.raises($$insert into tryout_requests (phone,position,first_name,last_name,date_of_birth,email) values ('+358 40 123 4567','midfielder','Pho','Ne','2000-01-01','pho2@x.io')$$));
select t.admin();
select t.service();
select t.check('release 0.14.1 present', exists (select 1 from app_releases where version = '0.14.1'));

-- ---------- 0025 enrolment nationality code ----------
select t.check('release 0.14.2 present', exists (select 1 from app_releases where version = '0.14.2'));
select t.check('enrolment nationality must be a country code', (select count(*) from pg_constraint where conname = 'player_enrolments_nationality_iso') = 1);
select t.check('release 0.15.0 present', exists (select 1 from app_releases where version = '0.15.0'));
rollback;
