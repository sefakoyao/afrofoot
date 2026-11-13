-- 0018 Release 0.11.0: Team page; tryout and player enrolment live on the Join page; membership contents updated.
insert into app_releases (version, kind, title, notes, released_at) values
  ('0.11.0','feature','Team page, Join page with enrolment and tryout',
   'Included in membership: training, jersey and training bibs (without personal name), the app. Not included: player license, training ball, other training kits, shoes, socks, warm-up suits, drinking bottle. Tryout form removed from the front page.', '2026-11-13')
on conflict (version) do nothing;
