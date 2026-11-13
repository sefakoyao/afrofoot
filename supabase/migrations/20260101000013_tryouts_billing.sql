-- 0013 Player tryout requests + membership billing (monthly / quarterly / yearly; MobilePay, wire transfer, invoice).

-- ===== Billing =====
alter type plan_period add value if not exists 'quarter' before 'season';
alter type payment_method add value if not exists 'invoice';

alter table memberships
  add column auto_renew boolean not null default false,
  add column next_due_on date;
alter table payments
  add column invoice_number text unique,
  add column invoice_sent_at timestamptz,
  add column provider text check (provider in ('mobilepay')),
  add column provider_ref text,
  add column checkout_url text;
create unique index payments_provider_ref on payments (provider, provider_ref) where provider_ref is not null;

-- Finnish reference number (viitenumero): base digits + check digit, weights 7-3-1 from the right.
create function app.finnish_reference(base bigint) returns text language sql immutable as $$
  with d as (select regexp_split_to_table(reverse(base::text), '') :: int as v, generate_series(0, length(base::text) - 1) as i)
  select base::text || ((10 - coalesce(sum(v * (array[7,3,1])[i % 3 + 1]), 0) % 10) % 10)::text from d
$$;
create sequence payment_ref_seq start 1000;
create function app.payment_defaults() returns trigger language plpgsql as $$
begin
  if new.method in ('bank_transfer','invoice') and new.reference is null then new.reference := app.finnish_reference(nextval('payment_ref_seq')); end if;
  if new.method = 'invoice' and new.invoice_number is null then new.invoice_number := to_char(now(), 'YYYY') || '-' || lpad(currval('payment_ref_seq')::text, 5, '0'); end if;
  return new;
end $$;
create trigger payment_defaults before insert on payments for each row execute function app.payment_defaults();

-- Webhook log for MobilePay (written only by the server with the service role; idempotent by event id). No policies: nobody else can read it.
create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('mobilepay')),
  event_id text not null,
  payment_id uuid references payments(id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);
alter table payment_events enable row level security;
revoke all on payment_events from anon, authenticated;

-- ===== Player tryouts =====
create table tryout_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name  text not null check (char_length(last_name)  between 1 and 80),
  date_of_birth date not null check (date_of_birth between date '1960-01-01' and current_date - 5 * 365),
  email citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone text not null check (char_length(phone) between 5 and 40),
  position player_position not null,
  previous_team text check (char_length(previous_team) <= 120),
  palloliitto_url text check (palloliitto_url ~ '^https://tulospalvelu\.palloliitto\.fi(/[^\s]*)?$' and char_length(palloliitto_url) <= 300),
  guardian_name text check (char_length(guardian_name) <= 120),
  guardian_phone text check (char_length(guardian_phone) <= 40),
  message text check (char_length(message) <= 2000),
  locale text not null default 'en' check (locale in ('en','fi','fr','ar')),
  status request_status not null default 'new',
  tryout_on date,
  internal_note text check (char_length(internal_note) <= 2000),
  reviewed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tryout_one_open on tryout_requests (lower(email::text), date_of_birth) where status in ('new','in_review');
create trigger touch before update on tryout_requests for each row execute function app.touch_updated_at();

-- Under-18s need a guardian. Applicants cannot set review fields.
create function app.check_tryout() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and not coalesce(app.is_admin(), false) then
    if new.status <> 'new' or new.reviewed_by is not null or new.tryout_on is not null or new.internal_note is not null then
      raise exception 'Review fields are set by the club' using errcode = '42501'; end if;
  end if;
  if age(current_date, new.date_of_birth) < interval '18 years' and (coalesce(trim(new.guardian_name), '') = '' or coalesce(trim(new.guardian_phone), '') = '') then
    raise exception 'A parent or guardian name and phone are required for players under 18' using errcode = '23514'; end if;
  return new;
end $$;
create trigger check_tryout before insert or update on tryout_requests for each row execute function app.check_tryout();

alter table tryout_requests enable row level security;
create policy admin_all on tryout_requests for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy tryout_public_insert on tryout_requests for insert to anon, authenticated with check (status = 'new' and reviewed_by is null);
grant insert on tryout_requests to anon;
revoke select, update, delete on tryout_requests from anon;
create trigger audit after insert or update or delete on tryout_requests for each row execute function app.audit('redact');

-- Admin list with the applicant's age.
create view tryout_requests_admin with (security_invoker = true) as
select t.*, date_part('year', age(current_date, t.date_of_birth))::int as age from tryout_requests t;
grant select on tryout_requests_admin to authenticated;
