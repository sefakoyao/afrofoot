-- 0019 Federation fees (license + insurance by age), invoice requests, Paytrail provider, sponsor packages. Release 0.12.0.

-- ===== Paytrail as a payment provider (bank payment). Provider names are config; secrets stay in env. =====
alter table payments       drop constraint payments_provider_check;
alter table payments       add constraint payments_provider_check check (provider in ('mobilepay','paytrail'));
alter table payment_events drop constraint payment_events_provider_check;
alter table payment_events add constraint payment_events_provider_check check (provider in ('mobilepay','paytrail'));

-- ===== Federation fees (not part of the club membership fee) =====
create table federation_fees (
  id uuid primary key default gen_random_uuid(),
  season int not null check (season between 2024 and 2100),
  kind text not null check (kind in ('license','insurance')),
  band text not null check (band ~ '^[a-z0-9_]+$'),             -- e.g. junior_2015_plus, junior_2007_2014, adult, under_12, age_12_69
  label text not null check (char_length(label) between 2 and 120),
  amount_cents int check (amount_cents is null or amount_cents >= 0),  -- null when the price is chosen at purchase
  currency text not null default 'EUR' check (currency = 'EUR'),
  notes text check (char_length(notes) <= 1000),
  verified boolean not null default false,                       -- true once an admin checked it against palloliitto.fi
  source_url text not null default 'https://www.palloliitto.fi/kilpailut/pelipassit-ja-vakuutukset' check (source_url ~ '^https://'),
  sort_order int not null default 100,
  active boolean not null default true,
  translations jsonb not null default '{}'::jsonb check (app.valid_translations(translations)),
  updated_at timestamptz not null default now(),
  unique (season, kind, band)
);
create trigger touch before update on federation_fees for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on federation_fees for each row execute function app.audit();
alter table federation_fees enable row level security;
create policy fees_public on federation_fees for select to anon, authenticated using (active);
create policy fees_admin  on federation_fees for all to authenticated using (app.is_admin()) with check (app.is_admin());
grant select on federation_fees to anon;
grant select, insert, update, delete on federation_fees to authenticated;

-- Season 2026 as quoted by clubs from Palloliitto's list; NOT verified against the official page yet (verified = false).
insert into federation_fees (season, kind, band, label, amount_cents, notes, sort_order) values
 (2026,'license','junior_2015_plus','Junior, born 2015 or later',2700,'Indicative. Verify on palloliitto.fi before publishing as final.',10),
 (2026,'license','junior_2007_2014','Junior, born 2007–2014',4300,'Indicative. Verify on palloliitto.fi before publishing as final.',20),
 (2026,'license','adult','Adult',5300,'Indicative. Verify on palloliitto.fi before publishing as final.',30),
 (2026,'insurance','under_12','Under 12',null,'Children under 12 with a player pass are covered by the federation group arrangement (per Palloliitto insurance document 2026). Confirm.',10),
 (2026,'insurance','age_12_69','Age 12 – 69',null,'Federation group insurance: broad cover (care compensation 3 000 EUR, deductible 100–300 EUR) or narrow cover (1 500 EUR, deductible 150 EUR). Optional leisure-time accident cover 40 or 80 EUR. Price is shown when buying the pass; annual prices range 10–695 EUR.',20),
 (2026,'insurance','age_70_plus','Age 70 and over',null,'Not covered by the federation group insurance. Arrange your own cover.',30),
 (2026,'insurance','adult_league','Adults in adult competitive leagues',null,'The adult hobby insurance is not valid in Palloliitto adult competitive leagues.',40);

-- ===== Invoice requests =====
create table invoice_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  plan_id uuid not null references membership_plans(id) on delete restrict,
  full_name text not null check (char_length(full_name) between 2 and 120),
  email citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone text check (phone is null or phone ~ '^[+0-9 ()-]{6,25}$'),
  player_name text check (char_length(player_name) <= 120),               -- when a parent pays for a child
  address text not null check (char_length(address) between 3 and 200),
  postal_code text not null check (char_length(postal_code) between 2 and 12),
  city text not null check (char_length(city) between 2 and 80),
  reference_note text check (char_length(reference_note) <= 200),
  locale text not null default 'en' check (locale in ('en','fi','fr','ar')),
  consent boolean not null check (consent),
  status text not null default 'new' check (status in ('new','invoiced','paid','cancelled')),
  invoice_number text,
  handled_by uuid references profiles(id) on delete set null,
  handled_at timestamptz
);
create unique index invoice_requests_one_open on invoice_requests (lower(email::text), plan_id) where status = 'new';
alter table invoice_requests enable row level security;
create policy invreq_insert on invoice_requests for insert to anon, authenticated with check (status = 'new' and handled_by is null and invoice_number is null and handled_at is null);
create policy invreq_admin_read on invoice_requests for select to authenticated using (app.is_admin());
create policy invreq_admin_upd  on invoice_requests for update to authenticated using (app.is_admin()) with check (app.is_admin());
grant insert on invoice_requests to anon, authenticated;
grant select, update on invoice_requests to authenticated;
create trigger audit after insert or update or delete on invoice_requests for each row execute function app.audit('redact');

-- ===== Sponsor packages ("how to sponsor") + sponsor enquiries =====
create table sponsor_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  summary text not null check (char_length(summary) between 5 and 400),
  benefits text[] not null default '{}',
  price_note text not null default 'On request' check (char_length(price_note) <= 80),
  sort_order int not null default 100,
  active boolean not null default true,
  translations jsonb not null default '{}'::jsonb check (app.valid_translations(translations)),
  updated_at timestamptz not null default now()
);
create trigger touch before update on sponsor_packages for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on sponsor_packages for each row execute function app.audit();
alter table sponsor_packages enable row level security;
create policy pkg_public on sponsor_packages for select to anon, authenticated using (active);
create policy pkg_admin  on sponsor_packages for all to authenticated using (app.is_admin()) with check (app.is_admin());
grant select on sponsor_packages to anon;
grant select, insert, update, delete on sponsor_packages to authenticated;
insert into sponsor_packages (name, summary, benefits, sort_order) values
 ('Main partner','Your brand on the match shirt and across the club.', array['Logo on the match shirt','Logo on website and app','Banner at home games','Social media features'], 10),
 ('Partner','Visible support for the club all season.', array['Logo on website','Banner at home games','Mentions in newsletters'], 20),
 ('Supporter','Help young players and the community.', array['Name on the supporters list','Thank-you post'], 30),
 ('In-kind partner','Kit, equipment, venues or services instead of money.', array['Agreed visibility in return'], 40);

alter table contact_messages add column company text check (char_length(company) <= 120);

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.12.0','feature','Membership details, insurance by age, invoice requests, Sponsors page','Federation license and insurance info by age; Paytrail bank payment; invoice request form; sponsor packages and how to sponsor.','2026-11-13')
on conflict (version) do nothing;
