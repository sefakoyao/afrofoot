-- 0068 Contracts of players under 18: a parent or guardian signs too.
-- When the player is under 18 on the day they sign (from their birth date; when it is not known, the player says so),
-- the contract asks for a parent or guardian: name, relation, phone (with country code) and email, and the parent or
-- guardian types their own name to sign, on the same screen, together with the player. Admins see "Under 18" on the
-- contract and cannot countersign until a parent or guardian has signed. Needs player contracts (migration 0030).
do $$ begin
  if to_regclass('public.player_contracts') is null then
    raise exception 'Player contracts are not installed in this database (migration 0030): install them first';
  end if;
end $$;

alter table player_contracts
  add column if not exists is_minor boolean not null default false,
  add column if not exists guardian_name text,
  add column if not exists guardian_relation text,
  add column if not exists guardian_phone text,
  add column if not exists guardian_email citext,
  add column if not exists guardian_signed_name text,
  add column if not exists guardian_signed_at timestamptz;
alter table player_contracts drop constraint if exists player_contracts_guardian_check;
alter table player_contracts add constraint player_contracts_guardian_check check (
  (guardian_name is null or char_length(guardian_name) between 2 and 120)
  and (guardian_relation is null or guardian_relation in ('mother', 'father', 'parent', 'guardian'))
  and (guardian_phone is null or regexp_replace(guardian_phone, '[ ()-]', '', 'g') ~ '^\+[1-9][0-9]{6,14}$')
  and (guardian_email is null or (char_length(guardian_email) <= 200 and guardian_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))
  and (guardian_signed_at is null or (guardian_name is not null and guardian_relation is not null and guardian_phone is not null and guardian_signed_name is not null))
  -- a contract signed as a minor carries the parent's or guardian's signature
  and (not is_minor or player_signed_at is null or guardian_signed_at is not null)
);

-- under 18 today (Helsinki), from the birth date; null when the birth date is not known
create or replace function app.is_minor(p_player uuid) returns boolean language sql stable security definer set search_path = public as $$
  select case when date_of_birth is null then null
              else date_of_birth > ((now() at time zone 'Europe/Helsinki')::date - interval '18 years')::date end
  from players where id = p_player
$$;

-- for the player's contract page: is the signed-in player under 18 (true / false / null = birth date unknown)
create or replace function public.my_minor_status() returns boolean language sql stable security definer set search_path = public as $$
  select app.is_minor(app.my_player_id())
$$;
revoke all on function public.my_minor_status() from public, anon;
grant execute on function public.my_minor_status() to authenticated;

-- The player signs. Under 18 (or, without a birth date, when the player says so): the parent or guardian's details
-- and their typed name are required and stored with the signature. The old two-argument form stays for adults.
create or replace function public.sign_contract(p_id uuid, p_name text, p_minor boolean, p_guardian_name text, p_guardian_relation text,
  p_guardian_phone text, p_guardian_email text, p_guardian_sign text) returns void
language plpgsql security definer set search_path = public as $$
declare c player_contracts; v_expected text; norm text; v_minor boolean; g text;
begin
  select * into c from player_contracts where id = p_id and player_id = app.my_player_id() and status = 'sent' for update;
  if not found or not app.is_active() then raise exception 'No contract to sign' using errcode = 'no_data_found'; end if;
  if c.ends_on < current_date then raise exception 'This contract has expired' using errcode = 'check_violation'; end if;
  if c.body_sha256 is distinct from encode(sha256(convert_to(c.body, 'UTF8')), 'hex') then raise exception 'Contract text changed' using errcode = 'check_violation'; end if;
  norm := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
  select lower(regexp_replace(trim(first_name || ' ' || last_name), '\s+', ' ', 'g')) into v_expected from profiles where id = auth.uid();
  if norm = '' or norm is distinct from v_expected then raise exception 'Type your full name as it appears on your account' using errcode = 'check_violation'; end if;
  -- the birth date decides; without one, the player's own answer
  v_minor := coalesce(app.is_minor(c.player_id), p_minor, false);
  if v_minor then
    g := regexp_replace(trim(coalesce(p_guardian_name, '')), '\s+', ' ', 'g');
    if char_length(g) < 2 or char_length(g) > 120 then raise exception 'guardian: enter the parent or guardian''s full name' using errcode = 'check_violation'; end if;
    if lower(g) = norm then raise exception 'guardian: the parent or guardian is someone else than the player' using errcode = 'check_violation'; end if;
    if coalesce(p_guardian_relation, '') not in ('mother', 'father', 'parent', 'guardian') then raise exception 'guardian: choose the relation' using errcode = 'check_violation'; end if;
    if regexp_replace(coalesce(p_guardian_phone, ''), '[ ()-]', '', 'g') !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'guardian: phone with country code' using errcode = 'check_violation'; end if;
    if nullif(trim(coalesce(p_guardian_email, '')), '') is not null and trim(p_guardian_email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'guardian: email' using errcode = 'check_violation'; end if;
    if lower(regexp_replace(trim(coalesce(p_guardian_sign, '')), '\s+', ' ', 'g')) is distinct from lower(g) then
      raise exception 'guardian: the parent or guardian types their own full name to sign' using errcode = 'check_violation';
    end if;
  end if;
  update player_contracts set status = 'player_signed', player_signed_name = regexp_replace(trim(p_name), '\s+', ' ', 'g'),
    is_minor = v_minor,
    guardian_name = case when v_minor then g end, guardian_relation = case when v_minor then p_guardian_relation end,
    guardian_phone = case when v_minor then trim(p_guardian_phone) end, guardian_email = case when v_minor then nullif(trim(p_guardian_email), '') end,
    guardian_signed_name = case when v_minor then g end, guardian_signed_at = case when v_minor then now() end
  where id = p_id;
end $$;
revoke all on function public.sign_contract(uuid, text, boolean, text, text, text, text, text) from public, anon;
grant execute on function public.sign_contract(uuid, text, boolean, text, text, text, text, text) to authenticated;

-- the old form: adults only (a minor is sent to the form with the parent or guardian)
create or replace function public.sign_contract(p_id uuid, p_name text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.sign_contract(p_id, p_name, false, null, null, null, null, null);
end $$;
revoke all on function public.sign_contract(uuid, text) from public, anon;
grant execute on function public.sign_contract(uuid, text) to authenticated;

-- The parent's or guardian's details change only with the player's signature (in sign_contract), and the club
-- countersigns a minor's contract only once the parent or guardian has signed. Runs after app.guard_contract.
create or replace function app.guard_guardian() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.is_minor, new.guardian_name, new.guardian_relation, new.guardian_phone, new.guardian_email, new.guardian_signed_name, new.guardian_signed_at)
      is distinct from (old.is_minor, old.guardian_name, old.guardian_relation, old.guardian_phone, old.guardian_email, old.guardian_signed_name, old.guardian_signed_at)
     and not (old.status = 'sent' and new.status = 'player_signed') then
    raise exception 'The parent or guardian''s signature cannot be edited' using errcode = 'check_violation';
  end if;
  if new.status = 'active' and old.status = 'player_signed' and new.is_minor and new.guardian_signed_at is null then
    raise exception 'A parent or guardian must sign first' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists guard_guardian on player_contracts;
create trigger guard_guardian before update on player_contracts for each row execute function app.guard_guardian();

-- For Admin → Contracts: the players who are under 18 today (birth date known), to flag their contracts before signing.
create or replace function public.minor_players() returns setof uuid language sql stable security definer set search_path = public as $$
  select id from players where app.is_admin() and app.is_minor(id)
$$;
revoke all on function public.minor_players() from public, anon;
grant execute on function public.minor_players() to authenticated;
