-- 0073 Players set their own birth date; it guards the contract. Release 0.77.0.
-- The birth date decides whether a contract needs a parent or guardian (migration 0068), so:
--  * A player (or player-coach) enters their own birth date once, when none is saved: from 1940 to 5 years ago
--    (Helsinki). After that only an admin can change it (to correct a mistake); every change is in the audit trail.
--  * A contract can only be signed by the player once a birth date is saved (no more "are you under 18?" answer).
-- Safe to run more than once. Works without the contracts (0030) and the minor contracts (0068) features: the contract
-- rule is added only where player contracts are installed.

-- the range the registration forms and the admin form accept: 1940-01-01 .. 5 years ago (Helsinki)
create or replace function app.birth_date_ok(d date) returns boolean language sql stable set search_path = public as $$
  select d is not null and d >= date '1940-01-01' and d <= ((now() at time zone 'Europe/Helsinki')::date - interval '5 years')::date
$$;

-- who may change a birth date: admins (and the service role) always; anyone else only from "not saved" to a valid date
create or replace function app.guard_birth_date() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or app.is_admin() or new.date_of_birth is not distinct from old.date_of_birth then return new; end if;
  if old.date_of_birth is not null then
    raise exception 'Your birth date is already saved: ask an admin to correct it' using errcode = '42501';
  end if;
  if not app.birth_date_ok(new.date_of_birth) then
    raise exception 'birth date: from 1940 to 5 years ago' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function app.guard_birth_date() from public, anon, authenticated;
drop trigger if exists guard_birth_date on players;
create trigger guard_birth_date before update of date_of_birth on players for each row execute function app.guard_birth_date();

-- players may now change date_of_birth on their own row (RLS players_self_update); the guard above limits how.
-- Same list as 0042 (website_hidden) plus date_of_birth; a name missing from an older database is simply ignored.
drop trigger if exists restrict_cols on players;
create trigger restrict_cols before update on players for each row
  execute function app.restrict_columns('preferred_foot','height_cm','weight_kg','bio','photo_path','show_publicly','website_hidden','date_of_birth','updated_at');

-- the contract: the player signs only once their birth date is saved
create or replace function app.contract_needs_birth_date() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'player_signed' and old.status is distinct from 'player_signed'
     and (select date_of_birth from players where id = new.player_id) is null then
    raise exception 'birth date: save your birth date before you sign the contract' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function app.contract_needs_birth_date() from public, anon, authenticated;
do $$ begin
  if to_regclass('public.player_contracts') is not null then
    drop trigger if exists needs_birth_date on player_contracts;
    create trigger needs_birth_date before update of status on player_contracts for each row execute function app.contract_needs_birth_date();
  end if;
end $$;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.77.0','feature','Players enter their birth date',
  'Players without a saved birth date are asked for it when they sign in; it decides whether their contract needs a parent or guardian, and a contract can only be signed once it is saved. Players enter it once; after that an admin corrects it if needed (Admin → Members → ⋯ → Birth date). New contracts run for one year from 1 December by default.','2026-11-27')
on conflict (version) do nothing;
