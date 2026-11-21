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

-- true when the account has anything worth keeping (then it is merged, not deleted)
create or replace function app.account_has_history(p_profile uuid) returns boolean language sql stable security definer set search_path = public as $$
  with pl as (select id from players where profile_id = p_profile), st as (select id from staff_members where profile_id = p_profile)
  select exists (select 1 from team_players where player_id in (select id from pl))
    or exists (select 1 from match_availability where player_id in (select id from pl) and availability <> 'pending')
    or exists (select 1 from session_attendance where player_id in (select id from pl) and (availability <> 'pending' or attendance is not null))
    or exists (select 1 from match_squad where player_id in (select id from pl))
    or exists (select 1 from match_player_stats where player_id in (select id from pl))
    or exists (select 1 from match_events where player_id in (select id from pl) or assist_player_id in (select id from pl) or player_out_id in (select id from pl))
    or exists (select 1 from payments where player_id in (select id from pl))
    or exists (select 1 from memberships where player_id in (select id from pl))
    or exists (select 1 from player_contracts where player_id in (select id from pl))
    or exists (select 1 from jersey_requests where player_id in (select id from pl))
    or exists (select 1 from event_tasks where player_id in (select id from pl))
    or exists (select 1 from federation_players where player_id in (select id from pl))
    or exists (select 1 from team_staff where staff_id in (select id from st))
$$;
revoke all on function app.account_has_history(uuid) from public;

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
alter table email_templates drop constraint if exists email_templates_kind_check;
alter table email_templates add constraint email_templates_kind_check check (kind in ('reminder_3d', 'reminder_last', 'approved', 'request_alert', 'label_game', 'duplicate_alert'));
alter table email_outbox drop constraint if exists email_outbox_kind_check;
alter table email_outbox add constraint email_outbox_kind_check check (kind in ('reminder_3d', 'reminder_last', 'approved', 'request_alert', 'duplicate_alert'));
insert into email_templates (kind, locale, subject, body, cta) values
 ('duplicate_alert', 'en', 'Possible duplicate account: {name}', E'A new account was created with an email or phone number that another account already uses ({shared}): {name}.\n\nCompare the two and merge them (or delete the empty one) in Admin → People → Merge accounts.', 'Open Merge accounts')
on conflict (kind, locale) do update set subject = excluded.subject, body = excluded.body, cta = excluded.cta;

create or replace function app.email_on_duplicate() returns trigger language plpgsql security definer set search_path = public as $$
declare v_shared text; v_to text := coalesce(app.email_setting('alert_to'), 'info@afrofoot.club');
begin
  select min(c) into v_shared from app.account_contacts(new.id) c
    where exists (select 1 from profiles o where o.id <> new.id and c in (select app.account_contacts(o.id)));
  if v_shared is not null then
    perform app.queue_email('duplicate_alert', v_to, 'en', jsonb_build_object('name', trim(new.first_name || ' ' || new.last_name), 'shared', v_shared), new.id, null,
      coalesce(app.email_setting('app_url'), 'https://app.afrofoot.club') || '/admin/members/merge');
  end if;
  return new;
end $$;
drop trigger if exists email_on_duplicate on profiles;
create trigger email_on_duplicate after insert or update of phone on profiles for each row execute function app.email_on_duplicate();
