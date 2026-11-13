-- 0022 Players see what they have paid / owe; players with overdue membership fees cannot sign in. Release 0.13.0.

-- ===== Policy (single row, admin-editable) =====
create table fee_policy (
  id uuid primary key default gen_random_uuid(),
  single boolean not null default true unique check (single),   -- guarantees exactly one row
  enabled boolean not null default true,
  grace_days int not null default 14 check (grace_days between 0 and 120),
  updated_at timestamptz not null default now()
);
insert into fee_policy default values;
create trigger touch before update on fee_policy for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on fee_policy for each row execute function app.audit();
alter table fee_policy enable row level security;
create policy fee_policy_admin on fee_policy for all to authenticated using (app.is_admin()) with check (app.is_admin());
grant select, update on fee_policy to authenticated;

-- ===== Admin override per player (players cannot edit these: not in their allowed-columns list) =====
alter table players
  add column fee_exempt_until date,
  add column fee_exempt_reason text check (char_length(fee_exempt_reason) <= 200);

-- ===== Core rule =====
-- A player is blocked when the policy is on, they have no exemption, and any fee is still unpaid more than grace_days after its due date.
create function app.player_blocked(p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select fp.enabled
       and p.role = 'player' and p.status = 'active'
       and not coalesce(pl.fee_exempt_until >= current_date, false)
       and exists (select 1 from payments pay
                    where pay.player_id = pl.id and pay.status in ('pending','failed')
                      and pay.due_on is not null and pay.due_on + fp.grace_days < current_date)
    from fee_policy fp cross join profiles p left join players pl on pl.profile_id = p.id
    where p.id = p_user
  ), false)
$$;
revoke all on function app.player_blocked(uuid) from public, anon, authenticated;

-- Defence in depth for sessions that are already open: blocked players lose member-level reads (they can still read their own payments).
create or replace function app.is_active() returns boolean language sql stable security definer set search_path = public as
$$ select app.role() is not null and not app.player_blocked(auth.uid()) $$;

-- ===== Sign-in block: Supabase Auth "Custom Access Token" hook. Runs on every sign-in and token refresh. =====
create function public.custom_access_token_hook(event jsonb) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if app.player_blocked((event->>'user_id')::uuid) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'membership_fees_overdue'));
  end if;
  return event;
end $$;
revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
    grant usage on schema app to supabase_auth_admin;
    grant execute on function app.player_blocked(uuid) to supabase_auth_admin;
    grant select on fee_policy, profiles, players, payments to supabase_auth_admin;
  end if;
end $$;

-- ===== What a player sees =====
create view my_payments as
  select p.id, p.amount_cents, p.currency, p.status, p.method, p.due_on, p.paid_at, p.reference, p.invoice_number, p.checkout_url,
         case when p.status = 'paid' then 'paid'
              when p.status in ('pending','failed') and p.due_on is not null and p.due_on < current_date then 'overdue'
              else p.status::text end as display_status
  from payments p where p.player_id = app.my_player_id();
grant select on my_payments to authenticated;

create function public.my_payment_summary() returns table (
  team_name text, paid_cents bigint, owed_cents bigint, overdue_cents bigint,
  next_due_on date, sign_in_blocked_from date, exempt_until date, grace_days int, policy_enabled boolean)
language sql stable security definer set search_path = public as $$
  with me as (select app.my_player_id() as id),
  fp as (select * from fee_policy),
  t as (select tm.name from team_players tp join team_seasons ts on ts.id = tp.team_season_id join teams tm on tm.id = ts.team_id, me
         where tp.player_id = me.id and tp.left_on is null order by ts.created_at desc limit 1)
  select (select name from t),
         coalesce(sum(p.amount_cents) filter (where p.status = 'paid'), 0),
         coalesce(sum(p.amount_cents) filter (where p.status in ('pending','failed')), 0),
         coalesce(sum(p.amount_cents) filter (where p.status in ('pending','failed') and p.due_on < current_date), 0),
         min(p.due_on) filter (where p.status in ('pending','failed')),
         min(p.due_on) filter (where p.status in ('pending','failed') and p.due_on is not null) + (select grace_days from fp),
         (select fee_exempt_until from players where id = (select id from me)),
         (select grace_days from fp), (select enabled from fp)
  from payments p where p.player_id = (select id from me)
$$;
revoke all on function public.my_payment_summary() from public, anon;
grant execute on function public.my_payment_summary() to authenticated;

-- ===== Admin tools =====
create function public.fee_overview() returns table (player_id uuid, player_name text, team_name text, owed_cents bigint, oldest_due date, days_overdue int, blocked boolean, exempt_until date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query
  select pl.id, pl.first_name || ' ' || pl.last_name,
         (select tm.name from team_players tp join team_seasons ts on ts.id = tp.team_season_id join teams tm on tm.id = ts.team_id where tp.player_id = pl.id and tp.left_on is null order by ts.created_at desc limit 1),
         sum(p.amount_cents), min(p.due_on), greatest(0, current_date - min(p.due_on))::int,
         coalesce(pl.profile_id is not null and app.player_blocked(pl.profile_id), false), pl.fee_exempt_until
  from players pl join payments p on p.player_id = pl.id and p.status in ('pending','failed')
  group by pl.id order by min(p.due_on) nulls last;
end $$;
revoke all on function public.fee_overview() from public, anon;
grant execute on function public.fee_overview() to authenticated;

create function public.set_fee_exemption(p_player uuid, p_until date, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update players set fee_exempt_until = p_until, fee_exempt_reason = p_reason where id = p_player;
  if not found then raise exception 'player not found'; end if;
end $$;
revoke all on function public.set_fee_exemption(uuid, date, text) from public, anon;
grant execute on function public.set_fee_exemption(uuid, date, text) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.13.0','feature','Payment status for players, sign-in block for unpaid fees',
  'Players see paid and owed amounts and their team; players with fees overdue beyond the grace period (default 14 days) cannot sign in until paid or exempted by an admin.','2026-11-13')
on conflict (version) do nothing;
