-- 0044 Sign-in help for admins. Release 0.32.0.
-- Admin → Sign-in help shows why a member cannot sign in and what fixes it. The app never sees or sets passwords and
-- admins cannot sign in as a member: the member always sets their own password from an email link.
--  * signin_status(profile): account facts from Supabase Auth that admins cannot read directly (email confirmed, last
--    sign-in, sign-in methods, ban), the profile's status, and the fee block of migration 0022. Admins only.
--  * log_signin_help(profile, action): every link an admin sends is written to the audit log.

create function public.signin_status(p_profile uuid) returns table (
  email text, has_account boolean, email_confirmed boolean, last_sign_in_at timestamptz, providers text[], banned_until timestamptz,
  role text, status text, player_id uuid, fee_blocked boolean, owed_cents bigint, oldest_due date, exempt_until date
) language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query
  select coalesce(u.email, pr.email)::text, u.id is not null, u.email_confirmed_at is not null, u.last_sign_in_at,
         coalesce((select array_agg(distinct i.provider order by i.provider) from auth.identities i where i.user_id = pr.id), '{}')::text[],
         case when u.banned_until > now() then u.banned_until end,
         pr.role::text, pr.status::text, pl.id,
         coalesce(app.player_blocked(pr.id), false),
         (select sum(p.amount_cents) from payments p where p.player_id = pl.id and p.status in ('pending', 'failed'))::bigint,
         (select min(p.due_on) from payments p where p.player_id = pl.id and p.status in ('pending', 'failed')),
         pl.fee_exempt_until
  from profiles pr
  left join auth.users u on u.id = pr.id
  left join players pl on pl.profile_id = pr.id
  where pr.id = p_profile;
end $$;
revoke all on function public.signin_status(uuid) from public, anon;
grant execute on function public.signin_status(uuid) to authenticated;

create function public.log_signin_help(p_profile uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_action not in ('password_link', 'confirmation_link', 'fee_exemption') then raise exception 'unknown action' using errcode = '22023'; end if;
  if not exists (select 1 from profiles where id = p_profile) then raise exception 'unknown member' using errcode = '22023'; end if;
  insert into audit_log (actor_id, action, table_name, record_id, new_data)
  values (auth.uid(), 'SIGNIN_HELP', 'profiles', p_profile, jsonb_build_object('action', p_action));
end $$;
revoke all on function public.log_signin_help(uuid, text) from public, anon;
grant execute on function public.log_signin_help(uuid, text) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.32.0','feature','Sign-in help for admins',
  'Admin → Sign-in help shows why a member cannot sign in (email not confirmed, waiting for approval, overdue fees, Google or Facebook only) and sends the right email link. Passwords are always set by the member.','2026-11-17')
on conflict (version) do nothing;
