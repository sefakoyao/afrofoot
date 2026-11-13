-- 0025 Release 0.14.2: enrolment nationality is chosen from a country list and stored as a two-letter ISO country code (e.g. FI, GH).
alter table player_enrolments add constraint player_enrolments_nationality_iso check (nationality is null or nationality ~ '^[A-Z]{2}$') not valid;
insert into app_releases (version, kind, title, notes, released_at) values
  ('0.14.2','feature','Join page: collapsible forms, country list, calendar styling',
   'Tryout and enrolment forms open and close; nationality is picked from a country list; the birth-date calendar has a dark, readable header; membership FAQ updated.', '2026-11-13')
on conflict (version) do nothing;
