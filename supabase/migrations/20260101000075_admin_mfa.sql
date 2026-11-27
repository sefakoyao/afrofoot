-- 0075 Two-step sign-in (MFA) for admins. Release 0.81.0.
-- Admins (club admins and super admins) confirm every sign-in with a 6-digit code from an authenticator app (Supabase
-- Auth TOTP); the app asks for it before the admin pages open. This makes the database agree: admin rights count only on
-- a session confirmed with the code (the token's "aal" is "aal2"). Without the code an admin's session works like a
-- member's own account (their profile, their two-step setup), nothing more.
-- Sessions without token claims (the service role, migrations, database tests) are not affected. Safe to run more than once.
-- Run it after the app with the two-step sign-in screens is live (release 0.81.0), or admins lose their rights until then.

create or replace function app.mfa_ok() returns boolean language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', 'aal2') = 'aal2'
$$;
grant execute on function app.mfa_ok() to authenticated;

create or replace function app.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role() in ('super_admin','club_admin'), false) and app.mfa_ok() $$;
create or replace function app.is_super() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce(app.role() = 'super_admin', false) and app.mfa_ok() $$;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.81.0','security','Two-step sign-in for admins',
  'Admins confirm every sign-in with a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password …). The first time, they scan a QR code. A super admin can reset it for an admin who lost their phone.','2026-11-27')
on conflict (version) do nothing;
