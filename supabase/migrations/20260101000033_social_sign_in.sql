-- 0033 Sign in with Google or Facebook. Release 0.21.0.
-- New accounts still start as pending players (an admin approves them and sets the role); the fee block (0022) applies
-- to every sign-in method. Google and Facebook send the name as full_name / name (Google also given_name, family_name)
-- instead of first_name / last_name, so the profile takes the name from whichever is there.

create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  full_name text := btrim(regexp_replace(coalesce(nullif(m->>'full_name', ''), nullif(m->>'name', ''), ''), '\s+', ' ', 'g'));
  first text := coalesce(nullif(btrim(m->>'first_name'), ''), nullif(btrim(m->>'given_name'), ''),
                         nullif(split_part(full_name, ' ', 1), ''), '');
  last text := coalesce(nullif(btrim(m->>'last_name'), ''), nullif(btrim(m->>'family_name'), ''),
                        nullif(btrim(substr(full_name, length(split_part(full_name, ' ', 1)) + 1)), ''), '');
begin
  insert into profiles (id, email, first_name, last_name) values (new.id, new.email, left(first, 80), left(last, 80));
  return new;
end $$;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.21.0','feature','Sign in with Google or Facebook',
  'Members can sign in with their Google or Facebook account as well as with email and password. New accounts still wait for approval; an existing account with the same email is used.','2026-11-15')
on conflict (version) do nothing;
