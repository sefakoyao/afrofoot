-- 0058 Robot check on the website's contact and sponsor forms (release 0.48.0).
-- Each message stores the one-time nonce of the football robot check it passed; the unique index makes one solved
-- check good for one message (a replayed answer is dropped). Older messages have none.
alter table contact_messages add column robot_nonce text check (robot_nonce is null or char_length(robot_nonce) between 8 and 40);
create unique index contact_messages_robot_nonce on contact_messages (robot_nonce) where robot_nonce is not null;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.48.0','feature','Robot check on the contact form, sign-out after inactivity',
  'The website''s contact and sponsor forms carry the football robot check; a solved check sends one message. The member app signs people out after a period without activity (default 60 minutes), with a warning two minutes before.','2026-11-19')
on conflict (version) do nothing;
