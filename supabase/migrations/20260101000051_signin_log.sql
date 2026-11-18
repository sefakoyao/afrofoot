-- 0051 Sign-in log (release 0.39.0).
-- Admin → Sign-in help gets a summary of sign-ins: successes, failures and why (wrong password, email not confirmed,
-- waiting for approval, suspended, overdue fees, too many attempts), password-reset requests and whether Supabase could
-- send the email. The app's sign-in pages report each attempt through public.log_signin(); nobody can read the log
-- except admins. Kept 90 days. Passwords are never logged.
--  * A success can only be logged for one's own account (the signed-in user).
--  * Failures and reset requests come from the public sign-in pages, so they are accepted without a session; each email
--    address is capped at 20 entries per 10 minutes and the whole log at 300 per minute, so a flood cannot fill it.
--  * The email typed is kept, so an admin also sees attempts with a mistyped address (no account).

create table signin_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  profile_id uuid references profiles(id) on delete cascade,
  email text check (char_length(email) <= 254),
  method text not null check (method in ('password', 'google', 'facebook', 'link', 'reset')),
  outcome text not null check (outcome in ('ok', 'wrong_password', 'not_confirmed', 'pending', 'suspended', 'fee_blocked',
                                           'rate_limited', 'error', 'reset_sent', 'reset_failed', 'reset_rate_limited')),
  detail text check (char_length(detail) <= 120),
  check (profile_id is not null or email is not null)
);
create index on signin_events (created_at desc);
create index on signin_events (profile_id, created_at desc);
create index on signin_events (email, created_at desc);
alter table signin_events enable row level security;
create policy admin_read on signin_events for select to authenticated using (app.is_admin());
revoke all on signin_events from anon;

create or replace function public.log_signin(p_email text, p_method text, p_outcome text, p_detail text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := nullif(lower(trim(p_email)), ''); v_profile uuid;
begin
  if p_method not in ('password', 'google', 'facebook', 'link', 'reset') then raise exception 'unknown method' using errcode = '22023'; end if;
  if p_outcome = 'ok' then
    -- only for oneself
    if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
    select id, email into v_profile, v_email from profiles where id = auth.uid();
    if v_profile is null then return; end if;
  else
    if p_outcome not in ('wrong_password', 'not_confirmed', 'pending', 'suspended', 'fee_blocked', 'rate_limited', 'error',
                         'reset_sent', 'reset_failed', 'reset_rate_limited') then raise exception 'unknown outcome' using errcode = '22023'; end if;
    if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+$' then raise exception 'email needed' using errcode = '22023'; end if;
    if (select count(*) from signin_events where email = v_email and created_at > now() - interval '10 minutes') >= 20
       or (select count(*) from signin_events where created_at > now() - interval '1 minute') >= 300 then return; end if;
    select id into v_profile from profiles where lower(email) = v_email limit 1;
  end if;
  insert into signin_events (profile_id, email, method, outcome, detail)
  values (v_profile, v_email, p_method, p_outcome, left(nullif(trim(p_detail), ''), 120));
end $$;
revoke all on function public.log_signin(text, text, text, text) from public;
grant execute on function public.log_signin(text, text, text, text) to anon, authenticated;

-- What Supabase Auth itself recorded for a member (sign-ins, reset and confirmation emails requested, password changes),
-- when the project keeps its Auth audit log in the database. Admins only; an empty list when the log is not available.
create or replace function public.signin_auth_log(p_profile uuid, p_limit int default 20)
returns table (created_at timestamptz, action text, provider text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if to_regclass('auth.audit_log_entries') is null then return; end if;
  begin
  return query execute
    'select e.created_at, e.payload ->> ''action'', e.payload -> ''traits'' ->> ''provider''
       from auth.audit_log_entries e
      where e.payload ->> ''actor_id'' = $1::text
        and e.payload ->> ''action'' in (''login'', ''user_recovery_requested'', ''user_confirmation_requested'', ''user_signedup'',
                                         ''user_updated_password'', ''user_modified'', ''logout'', ''user_reauthenticate_requested'')
      order by e.created_at desc limit $2'
    using p_profile, least(greatest(p_limit, 1), 100);
  exception when insufficient_privilege or undefined_table then return;  -- the Auth log is not readable here
  end;
end $$;
revoke all on function public.signin_auth_log(uuid, int) from public, anon;
grant execute on function public.signin_auth_log(uuid, int) to authenticated;

-- 90 days, then removed
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('afrofoot-signin-log-cleanup', '23 3 * * *', $c$delete from public.signin_events where created_at < now() - interval '90 days'$c$);
  end if;
exception when others then raise notice 'Could not schedule the sign-in log clean-up (%). Enable pg_cron under Database > Extensions and run this file again.', sqlerrm;
end $$;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.39.0','feature','Sign-in log',
  'Admin → Sign-in help shows a summary of sign-ins over 1–90 days: successes, failures and their reasons, password-reset emails and whether they could be sent, members having trouble, and each member''s recent attempts. Kept 90 days.','2026-11-18')
on conflict (version) do nothing;
