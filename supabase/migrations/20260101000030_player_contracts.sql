-- 0030 Digital player contracts (1, 2 or 3 years) between the club and a player. Release 0.18.0.
-- Flow: an admin drafts a contract from the template → sends it (text locked, fingerprint stored) → the player signs
-- with their name in the app (or declines) → a club admin countersigns → active. Confidential: only the player and
-- admins can read it, never coaches. Every change is audited.

create type contract_status as enum ('draft', 'sent', 'player_signed', 'active', 'declined', 'cancelled', 'terminated');

-- ===== Template (admins edit it; a new draft starts from it) =====
create table contract_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 80),
  body text not null check (char_length(body) between 50 and 40000),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index contract_templates_one_default on contract_templates (is_default) where is_default;
alter table contract_templates enable row level security;
create policy admin_all on contract_templates for all to authenticated using (app.is_admin()) with check (app.is_admin());
revoke all on contract_templates from anon;
create trigger audit after insert or update or delete on contract_templates for each row execute function app.audit();
create trigger touch_updated_at before update on contract_templates for each row execute function app.touch_updated_at();

-- ===== Contracts =====
create table player_contracts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete restrict,
  team_season_id uuid references team_seasons(id) on delete set null,
  title text not null check (char_length(title) between 3 and 160),
  years smallint not null check (years between 1 and 3),
  starts_on date not null,
  ends_on date not null,
  body text not null check (char_length(body) between 50 and 40000),
  body_sha256 text check (body_sha256 ~ '^[0-9a-f]{64}$'),   -- fingerprint of the text the player was sent and signed
  status contract_status not null default 'draft',
  sent_at timestamptz,
  player_signed_at timestamptz,
  player_signed_name text check (char_length(player_signed_name) between 2 and 160),
  club_signed_at timestamptz,
  club_signed_by uuid references profiles(id) on delete set null,
  club_signed_name text check (char_length(club_signed_name) between 2 and 160),
  declined_at timestamptz,
  decline_reason text check (char_length(decline_reason) <= 500),
  cancelled_at timestamptz,
  terminated_on date,
  termination_reason text check (char_length(termination_reason) <= 500),
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on > starts_on),
  check (ends_on <= starts_on + make_interval(years => years::int)),            -- the term fits the chosen 1, 2 or 3 years
  check (status = 'draft' or (sent_at is not null and body_sha256 is not null)),
  check (status not in ('player_signed', 'active', 'terminated') or (player_signed_at is not null and player_signed_name is not null)),
  check (status not in ('active', 'terminated') or (club_signed_at is not null and club_signed_name is not null)),
  check (status <> 'terminated' or terminated_on is not null)
);
create index on player_contracts (player_id);
create index on player_contracts (status);
alter table player_contracts enable row level security;
create policy admin_all on player_contracts for all to authenticated using (app.is_admin()) with check (app.is_admin());
-- The player reads their own contracts once sent (never drafts). Signing goes through sign_contract / decline_contract.
create policy contract_self_read on player_contracts for select to authenticated using (player_id = app.my_player_id() and status <> 'draft');
revoke all on player_contracts from anon;
create trigger audit after insert or update or delete on player_contracts for each row execute function app.audit();
create trigger touch_updated_at before update on player_contracts for each row execute function app.touch_updated_at();

-- Allowed status changes, the text locked once sent, signatures only by the right person, no overlapping contracts.
create function app.guard_contract() returns trigger language plpgsql security definer set search_path = public as $$
declare v_player_profile uuid;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'Only drafts can be deleted' using errcode = 'check_violation'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then raise exception 'A contract starts as a draft' using errcode = 'check_violation'; end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and (new.body, new.player_id, new.starts_on, new.ends_on, new.years, new.title, new.body_sha256, new.sent_at)
        is distinct from (old.body, old.player_id, old.starts_on, old.ends_on, old.years, old.title, old.body_sha256, old.sent_at) then
      raise exception 'A sent contract cannot be changed' using errcode = 'check_violation';
    end if;
    if new.status is distinct from old.status then
      if not ((old.status = 'draft' and new.status in ('sent', 'cancelled'))
           or (old.status = 'sent' and new.status in ('player_signed', 'declined', 'cancelled'))
           or (old.status = 'player_signed' and new.status in ('active', 'cancelled'))
           or (old.status = 'active' and new.status = 'terminated')) then
        raise exception 'Contract cannot go from % to %', old.status, new.status using errcode = 'check_violation';
      end if;
      select profile_id into v_player_profile from players where id = new.player_id;
      if new.status = 'sent' then
        if position('[[' in new.body) > 0 then raise exception 'Fill in every [[…]] blank before sending' using errcode = 'check_violation'; end if;
        new.sent_at := now();
        new.body_sha256 := encode(sha256(convert_to(new.body, 'UTF8')), 'hex');
      elsif new.status in ('player_signed', 'declined') then
        if auth.uid() is distinct from v_player_profile then raise exception 'Only the player can sign or decline' using errcode = '42501'; end if;
        if new.status = 'player_signed' then new.player_signed_at := now(); else new.declined_at := now(); end if;
      elsif new.status = 'active' then
        if not app.is_admin() or auth.uid() is not distinct from v_player_profile then
          raise exception 'A club admin countersigns' using errcode = '42501';
        end if;
        new.club_signed_at := now();
        new.club_signed_by := auth.uid();
        new.club_signed_name := coalesce(nullif(trim((select first_name || ' ' || last_name from profiles where id = auth.uid())), ''), 'Club representative');
      elsif new.status = 'cancelled' then
        new.cancelled_at := now();
      end if;
    end if;
    -- signature fields only change together with the matching status change above
    if new.status = old.status and (new.player_signed_at, new.player_signed_name, new.club_signed_at, new.club_signed_by, new.club_signed_name)
        is distinct from (old.player_signed_at, old.player_signed_name, old.club_signed_at, old.club_signed_by, old.club_signed_name) then
      raise exception 'Signatures cannot be edited' using errcode = 'check_violation';
    end if;
  end if;
  -- one live contract at a time for the same dates
  if new.status in ('sent', 'player_signed', 'active') and exists (
      select 1 from player_contracts c where c.player_id = new.player_id and c.id <> new.id
        and c.status in ('sent', 'player_signed', 'active') and daterange(c.starts_on, c.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')) then
    raise exception 'This player already has a contract for these dates' using errcode = 'unique_violation';
  end if;
  return new;
end $$;
create trigger guard before insert or update or delete on player_contracts for each row execute function app.guard_contract();

-- ===== Player actions (security definer: players have no update right on the table) =====
create function public.sign_contract(p_id uuid, p_name text) returns void language plpgsql security definer set search_path = public as $$
declare c player_contracts; v_expected text; norm text;
begin
  select * into c from player_contracts where id = p_id and player_id = app.my_player_id() and status = 'sent' for update;
  if not found or not app.is_active() then raise exception 'No contract to sign' using errcode = 'no_data_found'; end if;
  if c.ends_on < current_date then raise exception 'This contract has expired' using errcode = 'check_violation'; end if;
  if c.body_sha256 is distinct from encode(sha256(convert_to(c.body, 'UTF8')), 'hex') then raise exception 'Contract text changed' using errcode = 'check_violation'; end if;
  norm := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
  select lower(regexp_replace(trim(first_name || ' ' || last_name), '\s+', ' ', 'g')) into v_expected from profiles where id = auth.uid();
  if norm = '' or norm is distinct from v_expected then raise exception 'Type your full name as it appears on your account' using errcode = 'check_violation'; end if;
  update player_contracts set status = 'player_signed', player_signed_name = regexp_replace(trim(p_name), '\s+', ' ', 'g') where id = p_id;
end $$;

create function public.decline_contract(p_id uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(coalesce(p_reason, '')) > 500 then raise exception 'Reason too long' using errcode = 'check_violation'; end if;
  update player_contracts set status = 'declined', decline_reason = nullif(trim(p_reason), '')
   where id = p_id and player_id = app.my_player_id() and status = 'sent' and app.is_active();
  if not found then raise exception 'No contract to decline' using errcode = 'no_data_found'; end if;
end $$;
revoke all on function public.sign_contract(uuid, text) from public, anon;
revoke all on function public.decline_contract(uuid, text) from public, anon;
grant execute on function public.sign_contract(uuid, text) to authenticated;
grant execute on function public.decline_contract(uuid, text) to authenticated;

-- ===== Default template =====
-- {{…}} is filled in when a draft is created; [[…]] must be completed by the admin before the contract can be sent.
insert into contract_templates (name, is_default, body) values ('Player contract', true, $body$## {{club}} – {{team}}
This player contract is made between {{club}} (the club) and {{player}} (the player) for {{years_text}}, from {{starts}} to {{ends}}.
With this agreement, the club and the player agree on their mutual rights and obligations.
## Season and objectives
[[Describe the team's league and season, e.g. the series the team plays in and the objective for the season.]]
## Obligations of the club
- To provide high-quality and sufficient training facilities.
- To provide high-quality coaching.
- To provide the team and players with the necessary match and training equipment: balls, match kits and training equipment (excluding football boots and shin guards).
- To cover the costs related to playing and training, excluding players' playing licences and club membership fees.
- To treat all players appropriately and equally.
## Fees
The club pays the following fees on behalf of the player:
- [[Fee paid by the club, e.g. playing licence, EUR amount]]
If the player transfers to another club during the contract period, the player or the player's new club reimburses the club for the fees above, unless otherwise agreed between the player and the club. The player may also reimburse these fees during the contract period, in which case they will not be charged again later.
Fees for later seasons of this contract (playing licence, team fee) are agreed separately before each season and amount to at most EUR [[maximum per year]] per year.
## Rights of the club
- To select and field players in the manner it considers best to achieve its objectives.
- To move players between the club's teams at the discretion of the head coach.
- To terminate this agreement if the player fails to fulfil their obligations.
## Obligations of the player
- To participate in training sessions and matches whenever possible.
- To report absences in the agreed manner (in the club app).
- To pay the club membership fee according to their membership plan.
- To obtain insurance, if the player deems it necessary.
- To participate at least once per season in a volunteer event organised by the team, or otherwise pay EUR [[amount]] per year to the team.
- To follow the club's Code of Conduct and behave appropriately at club and team events, and elsewhere when wearing club apparel.
- Upon transferring to another club or retiring, to pay any unpaid fees under this agreement and to return all match and training equipment received from the club.
## Confidentiality
The parties undertake to keep the contents of this agreement confidential.
## Term and signature
This agreement enters into force on {{starts}} and expires on {{ends}}.
This agreement is signed electronically in the Afro Foot Club app: first by the player, then by a club representative.$body$)
on conflict (name) do nothing;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.18.0','feature','Digital player contracts, event sign-in and out, how to pay',
  'Admins draft 1-, 2- or 3-year player contracts from a template; players sign in the app and a club admin countersigns (PDF for both). Players sign in or out of trainings and matches from their calendar until the start; coaches see the replies. The Membership tab shows how to pay each open invoice.','2026-11-15')
on conflict (version) do nothing;
