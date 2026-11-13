-- 0024 Release 0.14.1: phone numbers must include the country code (e.g. +358 40 123 4567).
-- NOT VALID = checked for every new or changed row; old rows are left alone until they are edited (then run VALIDATE CONSTRAINT after cleaning data).
alter table profiles add constraint profiles_phone_e164 check (phone is null or regexp_replace(phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table player_private add constraint player_private_phone_e164 check (phone is null or regexp_replace(phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table player_private add constraint player_private_emergency_phone_e164 check (emergency_phone is null or regexp_replace(emergency_phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table join_requests add constraint join_requests_phone_e164 check (phone is null or regexp_replace(phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table tryout_requests add constraint tryout_requests_phone_e164 check (phone is null or regexp_replace(phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table tryout_requests add constraint tryout_requests_guardian_phone_e164 check (guardian_phone is null or regexp_replace(guardian_phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table player_enrolments add constraint player_enrolments_phone_e164 check (phone is null or regexp_replace(phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table player_enrolments add constraint player_enrolments_guardian_phone_e164 check (guardian_phone is null or regexp_replace(guardian_phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;
alter table invoice_requests add constraint invoice_requests_phone_e164 check (phone is null or regexp_replace(phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$') not valid;

insert into app_releases (version, kind, title, notes, released_at) values
  ('0.14.1','feature','Lineup photos and calendar, phone country code',
   'Lineup: grass field with player photos on team-coloured shirts. Profile and forms: selectable birth-date calendar. Phone numbers must start with the country code, for example +358.', '2026-11-13')
on conflict (version) do nothing;
