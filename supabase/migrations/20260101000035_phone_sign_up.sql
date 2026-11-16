-- 0035 Sign-up in the member app, also with a phone number (SMS code). Release 0.23.0.
-- An account made with a phone number has no email address: profiles.email becomes optional, but every profile still
-- has an email or a phone. The profile takes the phone from Supabase Auth (stored there without "+"), with the country code.
-- New accounts are still pending players until an admin approves them; the fee block (0022) applies to every sign-in method.

alter table profiles alter column email drop not null;
alter table profiles add constraint profiles_email_or_phone check (email is not null or phone is not null);

create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := btrim(regexp_replace(coalesce(nullif(m->>'full_name', ''), nullif(m->>'name', ''), ''), '\s+', ' ', 'g'));
  first text := coalesce(nullif(btrim(m->>'first_name'), ''), nullif(btrim(m->>'given_name'), ''),
                         nullif(split_part(full_name, ' ', 1), ''), '');
  last text := coalesce(nullif(btrim(m->>'last_name'), ''), nullif(btrim(m->>'family_name'), ''),
                        nullif(btrim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), ''), '');
  digits text := nullif(regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g'), '');
begin
  insert into profiles (id, email, phone, first_name, last_name)
  values (new.id, nullif(new.email, ''), case when digits ~ '^[1-9][0-9]{6,14}$' then '+' || digits end, left(first, 80), left(last, 80));
  return new;
end $$;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.23.0','feature','Create an account in the app, also with a phone number',
  'New members can create an account on the sign-in page with their email address or their phone number (a code by text message). A short football check keeps robots out. New accounts wait for approval as before.','2026-11-16')
on conflict (version) do nothing;
