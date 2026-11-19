-- 0058 Website robot check: one solved check sends one message (contact_messages.robot_nonce is unique).
begin;
select t.anon();
select t.check('a message with a robot nonce is accepted', t.rows($$insert into contact_messages (name, email, topic, message, locale, robot_nonce) values ('Rc Test', 'rc@example.test', 'general', 'Hello there', 'en', 'nonce-aaaaaaaaaaaa')$$) = 1);
select t.check('the same nonce again is refused (replay)', t.raises($$insert into contact_messages (name, email, topic, message, locale, robot_nonce) values ('Rc Again', 'rc2@example.test', 'general', 'Hello again', 'en', 'nonce-aaaaaaaaaaaa')$$));
select t.check('a different nonce is fine', t.rows($$insert into contact_messages (name, email, topic, message, locale, robot_nonce) values ('Rc Other', 'rc3@example.test', 'general', 'Hello other', 'en', 'nonce-bbbbbbbbbbbb')$$) = 1);
select t.check('a too-long nonce is refused', t.raises(format($$insert into contact_messages (name, email, topic, message, locale, robot_nonce) values ('Rc Long', 'rc4@example.test', 'general', 'Hello long', 'en', %L)$$, repeat('x', 41))));
rollback;
