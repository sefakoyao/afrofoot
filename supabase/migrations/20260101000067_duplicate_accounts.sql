-- 0067 Duplicate accounts: delete a duplicate that has no history, and tell the club when one is created.
-- When a person signs up a second time (once with an email, once with a phone number), 0065 lets an administrator merge
-- the two. This adds:
--  * delete_account(profile): an administrator deletes an account that has no history (no teams, games, trainings,
--    invoices, contracts, shirt numbers or tasks), e.g. a second account made by mistake. An account with history is
--    refused: merge it instead, so nothing is lost. Same rules as merging: admins only, only a super administrator for
--    an administrator's account, never your own. Logged in account_merges (action 'delete') and the audit trail.
--  * an email to the club (the request-alert address) when a new account shares an email or phone number with another,
--    with a link to Admin → People → Merge accounts. The sign-up form itself never says whether an account exists.

alter table account_merges add column if not exists action text not null default 'merge';
alter table account_merges drop constraint if exists account_merges_action_check;
alter table account_merges add constraint account_merges_action_check check (action in ('merge', 'delete'));
alter table account_merges alter column shared drop not null;

-- Works on every installed version of the database: a table or column that is not there (an older install, e.g.
-- without player contracts) is simply skipped. 0065's merge_accounts is replaced the same way below.
create or replace function app.has_column(p_table text, p_col text) returns boolean language sql stable as $$
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = p_col)
$$;

-- true when p_table has a row whose p_col is one of p_ids (and p_where holds); false when the table or column is missing
create or replace function app.has_rows(p_table text, p_col text, p_ids uuid[], p_where text default 'true') returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v boolean;
begin
  if p_ids is null or cardinality(p_ids) = 0 or not app.has_column(p_table, p_col) then return false; end if;
  execute format('select exists (select 1 from %I where %I = any($1) and (%s))', p_table, p_col, p_where) into v using p_ids;
  return v;
end $$;
revoke all on function app.has_rows(text, text, uuid[], text) from public;

-- moves p_table rows from p_from to p_to (column p_col). With p_key, a row of p_from that has the same p_key as a row
-- of p_to (and p_where, written with x = the moved row and y = the kept one) is dropped first: the kept row stays.
-- Returns the rows moved; 0 when the table or column is missing.
create or replace function app.repoint(p_table text, p_col text, p_from uuid, p_to uuid, p_key text default null, p_where text default 'true') returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_from is null or p_to is null or not app.has_column(p_table, p_col) or (p_key is not null and not app.has_column(p_table, p_key)) then return 0; end if;
  if p_key is not null then
    execute format('delete from %I x using %I y where x.%I = $1 and y.%I = $2 and y.%I is not distinct from x.%I and (%s)', p_table, p_table, p_col, p_col, p_key, p_key, p_where) using p_from, p_to;
  end if;
  execute format('update %I set %I = $2 where %I = $1', p_table, p_col, p_col) using p_from, p_to;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app.repoint(text, text, uuid, uuid, text, text) from public;

-- true when the account has anything worth keeping (then it is merged, not deleted)
create or replace function app.account_has_history(p_profile uuid) returns boolean language plpgsql stable security definer set search_path = public as $$
declare pl uuid[] := array(select id from players where profile_id = p_profile); st uuid[] := array(select id from staff_members where profile_id = p_profile);
begin
  return app.has_rows('team_players', 'player_id', pl)
    or app.has_rows('match_availability', 'player_id', pl, 'availability::text <> ''pending''')
    or app.has_rows('session_attendance', 'player_id', pl, 'availability::text <> ''pending'' or attendance is not null')
    or app.has_rows('match_squad', 'player_id', pl) or app.has_rows('match_player_stats', 'player_id', pl)
    or app.has_rows('match_events', 'player_id', pl) or app.has_rows('match_events', 'assist_player_id', pl) or app.has_rows('match_events', 'player_out_id', pl)
    or app.has_rows('payments', 'player_id', pl) or app.has_rows('memberships', 'player_id', pl) or app.has_rows('player_contracts', 'player_id', pl)
    or app.has_rows('jersey_requests', 'player_id', pl) or app.has_rows('event_tasks', 'player_id', pl) or app.has_rows('federation_players', 'player_id', pl)
    or app.has_rows('team_staff', 'staff_id', st);
end $$;
revoke all on function app.account_has_history(uuid) from public;

-- 0065's merge, rewritten with the helpers so that it also runs where some tables are missing
create or replace function public.merge_accounts(p_keep uuid, p_remove uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k profiles; r profiles; kp uuid; rp uuid; ks uuid; rs uuid; shared text; moved jsonb := '{}'; c text; fk record;
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_keep is null or p_remove is null or p_keep = p_remove then raise exception 'choose two different accounts' using errcode = '22023'; end if;
  if p_remove = auth.uid() then raise exception 'you cannot merge away your own account' using errcode = '42501'; end if;
  select * into k from profiles where id = p_keep for update;
  select * into r from profiles where id = p_remove for update;
  if k.id is null or r.id is null then raise exception 'account not found' using errcode = 'P0002'; end if;
  if (k.role in ('super_admin', 'club_admin') or r.role in ('super_admin', 'club_admin')) and not app.is_super() then
    raise exception 'only a super administrator merges an administrator''s account' using errcode = '42501';
  end if;
  select min(x) into shared from app.account_contacts(p_keep) x where x in (select app.account_contacts(p_remove));
  if shared is null then raise exception 'the accounts share no email or phone number' using errcode = '22023'; end if;

  select id into kp from players where profile_id = p_keep;
  select id into rp from players where profile_id = p_remove;
  select id into ks from staff_members where profile_id = p_keep;
  select id into rs from staff_members where profile_id = p_remove;

  -- ===== the player record =====
  if rp is not null and kp is null then
    update players set profile_id = p_keep, updated_at = now() where id = rp;
    moved := moved || jsonb_build_object('player', 1);
  elsif rp is not null then
    -- one row per team / game / training / season: the kept player's stays
    moved := moved || jsonb_build_object('team_players', app.repoint('team_players', 'player_id', rp, kp, 'team_season_id'));
    moved := moved || jsonb_build_object('match_availability', app.repoint('match_availability', 'player_id', rp, kp, 'match_id'));
    moved := moved || jsonb_build_object('session_attendance', app.repoint('session_attendance', 'player_id', rp, kp, 'session_id'));
    moved := moved || jsonb_build_object('match_squad', app.repoint('match_squad', 'player_id', rp, kp, 'match_id'));
    moved := moved || jsonb_build_object('match_player_stats', app.repoint('match_player_stats', 'player_id', rp, kp, 'match_id'));
    perform app.repoint('mvp_votes', 'voter_player_id', rp, kp, 'match_id');
    perform app.repoint('mvp_votes', 'candidate_player_id', rp, kp);
    moved := moved || jsonb_build_object('jersey_requests', app.repoint('jersey_requests', 'player_id', rp, kp, 'team_season_id', 'x.status = ''pending'' and y.status = ''pending'''));
    -- a season membership both have: the invoices of the other one move to the kept membership
    if app.has_column('payments', 'membership_id') then
      update payments pay set membership_id = y.id from memberships x join memberships y on y.player_id = kp and y.season_id = x.season_id
        where x.player_id = rp and pay.membership_id = x.id;
    end if;
    moved := moved || jsonb_build_object('memberships', app.repoint('memberships', 'player_id', rp, kp, 'season_id'));
    moved := moved || jsonb_build_object('payments', app.repoint('payments', 'player_id', rp, kp));
    moved := moved || jsonb_build_object('player_contracts', app.repoint('player_contracts', 'player_id', rp, kp));
    moved := moved || jsonb_build_object('event_tasks', app.repoint('event_tasks', 'player_id', rp, kp));
    foreach c in array array['player_enrolments.player_id', 'player_ratings.player_id', 'evaluations.player_id', 'development_goals.player_id',
      'match_events.player_id', 'match_events.assist_player_id', 'match_events.player_out_id', 'match_rotation_plan.player_on_id', 'match_rotation_plan.player_off_id'] loop
      perform app.repoint(split_part(c, '.', 1), split_part(c, '.', 2), rp, kp);
    end loop;
    -- the Palloliitto link: at most one per player
    if app.has_column('federation_players', 'player_id') then
      if app.has_rows('federation_players', 'player_id', array[kp]) then execute 'update federation_players set player_id = null where player_id = $1' using rp;
      else perform app.repoint('federation_players', 'player_id', rp, kp); end if;
    end if;
    -- contact details: fill the kept player's empty fields, then drop the other row
    if exists (select 1 from player_private where player_id = kp) then
      update player_private k2 set phone = coalesce(k2.phone, r2.phone), email = coalesce(k2.email, r2.email), address = coalesce(k2.address, r2.address),
        city = coalesce(k2.city, r2.city), emergency_name = coalesce(k2.emergency_name, r2.emergency_name), emergency_phone = coalesce(k2.emergency_phone, r2.emergency_phone),
        emergency_relation = coalesce(k2.emergency_relation, r2.emergency_relation), updated_at = now()
        from player_private r2 where k2.player_id = kp and r2.player_id = rp;
      delete from player_private where player_id = rp;
    else update player_private set player_id = kp where player_id = rp; end if;
    if app.has_column('player_medical', 'player_id') then
      if app.has_rows('player_medical', 'player_id', array[kp]) then execute 'delete from player_medical where player_id = $1' using rp;
      else execute 'update player_medical set player_id = $2 where player_id = $1' using rp, kp; end if;
    end if;
    -- the kept player's empty details, from the other record (only columns this database has)
    foreach c in array array['date_of_birth', 'nationality', 'position', 'secondary_position', 'preferred_foot', 'height_cm', 'weight_kg', 'bio', 'photo_path', 'profile_completed_at', 'joined_on'] loop
      if app.has_column('players', c) then
        execute format('update players k2 set %I = coalesce(k2.%I, r2.%I) from players r2 where k2.id = $1 and r2.id = $2', c, c, c) using kp, rp;
      end if;
    end loop;
    delete from players where id = rp;
    moved := moved || jsonb_build_object('player', 1);
  end if;

  -- ===== the coach record =====
  if rs is not null and ks is null then update staff_members set profile_id = p_keep, updated_at = now() where id = rs;
  elsif rs is not null then
    perform app.repoint('team_staff', 'staff_id', rs, ks, 'team_season_id');
    delete from staff_members where id = rs;
  end if;

  -- ===== the account's own rows =====
  perform app.repoint('conduct_consents', 'profile_id', p_remove, p_keep, 'version_id');
  if app.has_rows('content_editors', 'profile_id', array[p_keep]) then execute 'delete from content_editors where profile_id = $1' using p_remove;
  else perform app.repoint('content_editors', 'profile_id', p_remove, p_keep); end if;
  perform app.repoint('notifications', 'user_id', p_remove, p_keep);
  perform app.repoint('signin_events', 'profile_id', p_remove, p_keep);
  perform app.repoint('email_outbox', 'profile_id', p_remove, p_keep);
  -- every "done by" mark: each column of this database that points to an account and is emptied when the account goes
  for fk in select cl.relname::text as tbl, a.attname::text as col from pg_constraint co join pg_class cl on cl.oid = co.conrelid join pg_namespace ns on ns.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = co.conrelid and a.attnum = any(co.conkey)
      where co.contype = 'f' and co.confrelid = 'public.profiles'::regclass and co.confdeltype = 'n' and ns.nspname = 'public'
        and (cl.relname::text, a.attname::text) not in (('players', 'profile_id'), ('staff_members', 'profile_id')) loop
    perform app.repoint(fk.tbl, fk.col, p_remove, p_keep);
  end loop;

  -- the kept account's empty fields; an active account stays active when the kept one was still waiting
  update profiles set phone = coalesce(phone, r.phone), avatar_path = coalesce(avatar_path, r.avatar_path),
    status = case when status = 'pending' and r.status = 'active' then 'active' else status end, updated_at = now()
    where id = p_keep;

  insert into account_merges (kept_profile_id, removed_profile_id, removed_name, removed_email, removed_phone, shared, moved)
    values (p_keep, p_remove, trim(r.first_name || ' ' || r.last_name), r.email::text, r.phone, shared, moved);
  delete from auth.users where id = p_remove;   -- the removed login (its profile goes with it)
  return moved || jsonb_build_object('shared', shared);
end $$;
revoke all on function public.merge_accounts(uuid, uuid) from public, anon;
grant execute on function public.merge_accounts(uuid, uuid) to authenticated;

-- for the admin page: which accounts can be deleted (no history)
create or replace function public.account_deletable(p_profile uuid) returns boolean language sql stable security definer set search_path = public as $$
  select app.is_admin() and not app.account_has_history(p_profile)
$$;
revoke all on function public.account_deletable(uuid) from public, anon;
grant execute on function public.account_deletable(uuid) to authenticated;

create or replace function public.delete_account(p_profile uuid) returns void language plpgsql security definer set search_path = public as $$
declare r profiles; shared text;
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_profile = auth.uid() then raise exception 'you cannot delete your own account' using errcode = '42501'; end if;
  select * into r from profiles where id = p_profile for update;
  if r.id is null then raise exception 'account not found' using errcode = 'P0002'; end if;
  if r.role in ('super_admin', 'club_admin') and not app.is_super() then
    raise exception 'only a super administrator deletes an administrator''s account' using errcode = '42501';
  end if;
  if app.account_has_history(p_profile) then raise exception 'the account has history: merge it instead' using errcode = '23503'; end if;
  select min(c) into shared from app.account_contacts(p_profile) c
    where exists (select 1 from profiles o where o.id <> p_profile and c in (select app.account_contacts(o.id)));
  insert into account_merges (action, kept_profile_id, removed_profile_id, removed_name, removed_email, removed_phone, shared)
    values ('delete', null, p_profile, trim(r.first_name || ' ' || r.last_name), r.email::text, r.phone, shared);
  -- the empty player and coach records go too (their private and medical rows, replies still pending, follow by cascade)
  delete from match_availability where player_id in (select id from players where profile_id = p_profile);
  delete from session_attendance where player_id in (select id from players where profile_id = p_profile);
  delete from players where profile_id = p_profile;
  delete from staff_members where profile_id = p_profile;
  delete from auth.users where id = p_profile;
end $$;
revoke all on function public.delete_account(uuid) from public, anon;
grant execute on function public.delete_account(uuid) to authenticated;

-- ---------- tell the club about a new duplicate ----------
-- Only where the email outbox (migration 0048) is installed; elsewhere this part is skipped and the duplicates simply
-- show on Admin → People → Merge accounts (with a count in the menu).
do $do$
begin
  if to_regclass('public.email_templates') is null or to_regclass('public.email_outbox') is null
     or to_regprocedure('app.queue_email(text,text,text,jsonb,uuid,uuid,text)') is null or to_regprocedure('app.email_setting(text)') is null then
    raise notice 'email outbox (0048) not installed: no duplicate alert email';
    return;
  end if;
  alter table email_templates drop constraint if exists email_templates_kind_check;
  alter table email_templates add constraint email_templates_kind_check check (kind in ('reminder_3d', 'reminder_last', 'approved', 'request_alert', 'label_game', 'duplicate_alert'));
  alter table email_outbox drop constraint if exists email_outbox_kind_check;
  alter table email_outbox add constraint email_outbox_kind_check check (kind in ('reminder_3d', 'reminder_last', 'approved', 'request_alert', 'duplicate_alert'));
  insert into email_templates (kind, locale, subject, body, cta) values
   ('duplicate_alert', 'en', 'Possible duplicate account: {name}', E'A new account was created with an email or phone number that another account already uses ({shared}): {name}.\n\nCompare the two and merge them (or delete the empty one) in Admin → People → Merge accounts.', 'Open Merge accounts')
  on conflict (kind, locale) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

  create or replace function app.email_on_duplicate() returns trigger language plpgsql security definer set search_path = public as $fn$
  declare v_shared text; v_to text := coalesce(app.email_setting('alert_to'), 'info@afrofoot.club');
  begin
    select min(c) into v_shared from app.account_contacts(new.id) c
      where exists (select 1 from profiles o where o.id <> new.id and c in (select app.account_contacts(o.id)));
    if v_shared is not null then
      perform app.queue_email('duplicate_alert', v_to, 'en', jsonb_build_object('name', trim(new.first_name || ' ' || new.last_name), 'shared', v_shared), new.id, null,
        coalesce(app.email_setting('app_url'), 'https://app.afrofoot.club') || '/admin/members/merge');
    end if;
    return new;
  end $fn$;
  drop trigger if exists email_on_duplicate on profiles;
  create trigger email_on_duplicate after insert or update of phone on profiles for each row execute function app.email_on_duplicate();
end $do$;
