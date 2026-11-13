-- 0017 Club membership fees: 20 EUR / month, 60 EUR / quarter, 240 EUR / year. Release 0.10.0.
insert into membership_plans (name, description, amount_cents, currency, period, active) values
  ('Monthly',   'Membership billed every month',    2000,  'EUR', 'month',   true),
  ('Quarterly', 'Membership billed every 3 months', 6000,  'EUR', 'quarter', true),
  ('Yearly',    'Membership billed once a year',    24000, 'EUR', 'year',    true)
on conflict (name) do update set amount_cents = excluded.amount_cents, period = excluded.period, description = excluded.description, active = true;

insert into app_releases (version, kind, title, notes, released_at) values
  ('0.10.0','feature','Enrolment, Membership, Join and Contact pages','Separate public pages with their own menu items; fees 20 / 60 / 240 EUR; enrolment page no longer renders under the front page.', '2026-11-13')
on conflict (version) do nothing;
