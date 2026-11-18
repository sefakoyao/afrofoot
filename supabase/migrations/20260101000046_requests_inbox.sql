-- 0046 Requests inbox (Admin → Requests). Release 0.34.0.
-- Admins now handle website messages in the app, so changes to them are audited like the other requests (tryouts,
-- enrolments, invoice requests). "redact": the log keeps which columns changed, never the message or the sender's details.
drop trigger if exists audit on contact_messages;
create trigger audit after insert or update or delete on contact_messages for each row execute function app.audit('redact');

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.34.0','feature','Requests inbox',
  'Admin → Requests lists tryout requests, team enrolments, invoice requests and messages from the website, with a count in the menu, a status and an internal note for each.','2026-11-18')
on conflict (version) do nothing;
