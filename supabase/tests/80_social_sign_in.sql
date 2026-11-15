-- 0033 Names for accounts created through Google or Facebook (auth.users insert → profiles).
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('d1000000-0000-0000-0000-000000000001', 'g-user@example.test', '{"full_name":"Amina  Bello Okafor","given_name":"Amina","family_name":"Bello Okafor","provider_id":"1"}'),
 ('d1000000-0000-0000-0000-000000000002', 'fb-user@example.test', '{"full_name":"Jean-Paul Mbappé","name":"Jean-Paul Mbappé"}'),
 ('d1000000-0000-0000-0000-000000000003', 'one-name@example.test', '{"name":"Zidane"}'),
 ('d1000000-0000-0000-0000-000000000004', 'form@example.test', '{"first_name":"Form","last_name":"Signup","full_name":"Ignored Name"}'),
 ('d1000000-0000-0000-0000-000000000005', 'no-meta@example.test', null);
select t.check('Google: given and family name used', (select first_name || '|' || last_name from profiles where id = 'd1000000-0000-0000-0000-000000000001') = 'Amina|Bello Okafor');
select t.check('Facebook: full name split into first and last', (select first_name || '|' || last_name from profiles where id = 'd1000000-0000-0000-0000-000000000002') = 'Jean-Paul|Mbappé');
select t.check('single name: first name only', (select first_name || '|' || last_name from profiles where id = 'd1000000-0000-0000-0000-000000000003') = 'Zidane|');
select t.check('email sign-up form names still win', (select first_name || '|' || last_name from profiles where id = 'd1000000-0000-0000-0000-000000000004') = 'Form|Signup');
select t.check('no metadata: empty names, account still created', (select first_name || '|' || last_name from profiles where id = 'd1000000-0000-0000-0000-000000000005') = '|');
select t.check('new social accounts are pending players', (select bool_and(status = 'pending' and role = 'player') from profiles where id::text like 'd1000000%'));
select t.check('release 0.21.0 present', exists (select 1 from app_releases where version = '0.21.0'));
rollback;
