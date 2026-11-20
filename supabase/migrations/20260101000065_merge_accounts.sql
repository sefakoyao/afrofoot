-- 0065 Merge accounts: when one person has two accounts (signed up twice, e.g. once with an email and once with a phone
-- number), an administrator merges them into one. Everything of the removed account moves to the one kept: its player
-- record (teams, games, trainings, invoices and payments, contracts, shirt numbers, tasks, votes…), its coach record,
-- consents, notifications and sign-in log, and every "done by" mark. Where both have a row for the same thing (the same
-- game, training, season…), the kept account's row stays and the other one is dropped; empty fields of the kept
-- account are filled from the other one. Then the removed login is deleted. Each merge is logged (account_merges).
--
-- Only administrators; only a super administrator merges an administrator's account. The two accounts must share an
-- email address or a phone number (account, or the player's contact details), so two different people are not merged
-- by mistake. An administrator cannot merge away their own account.

-- the contact details of an account, in one comparable form: emails in lower case, phones as + and digits
create or replace function app.account_contacts(p_profile uuid) returns setof text language sql stable security definer set search_path = public as $$
  select distinct c from (
    select lower(p.email::text) as c from profiles p where p.id = p_profile
    union all select '+' || regexp_replace(p.phone, '\D', '', 'g') from profiles p where p.id = p_profile
    union all select lower(pp.email::text) from player_private pp join players pl on pl.id = pp.player_id where pl.profile_id = p_profile
    union all select '+' || regexp_replace(pp.phone, '\D', '', 'g') from player_private pp join players pl on pl.id = pp.player_id where pl.profile_id = p_profile
  ) x where c is not null and c not in ('', '+')
$$;
revoke all on function app.account_contacts(uuid) from public;

-- Possible duplicates for Admin → People → Merge accounts: pairs of accounts that share an email or phone (admins only).
create or replace function public.duplicate_accounts() returns table (a uuid, b uuid, shared text) language sql stable security definer set search_path = public as $$
  with c as (select p.id, x.c from profiles p cross join lateral app.account_contacts(p.id) as x(c))
  select c1.id, c2.id, min(c1.c) from c c1 join c c2 on c2.c = c1.c and c2.id > c1.id
  where app.is_admin() group by c1.id, c2.id order by 1, 2
$$;
revoke all on function public.duplicate_accounts() from public, anon;
grant execute on function public.duplicate_accounts() to authenticated;

create table if not exists account_merges (
  id uuid primary key default gen_random_uuid(),
  kept_profile_id uuid references profiles(id) on delete set null,
  removed_profile_id uuid not null,                -- the login no longer exists
  removed_name text not null,
  removed_email text,
  removed_phone text,
  shared text not null,                            -- the email or phone the two had in common
  moved jsonb not null default '{}',               -- rows moved per table
  merged_by uuid references profiles(id) on delete set null default auth.uid(),
  merged_at timestamptz not null default now()
);
alter table account_merges enable row level security;
revoke all on account_merges from anon;
drop policy if exists admin_read on account_merges;
create policy admin_read on account_merges for select to authenticated using (app.is_admin());
-- no insert/update/delete policies: rows are written only by merge_accounts()
drop trigger if exists audit on account_merges;
create trigger audit after insert or update or delete on account_merges for each row execute function app.audit();

create or replace function public.merge_accounts(p_keep uuid, p_remove uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k profiles; r profiles; kp uuid; rp uuid; ks uuid; rs uuid; shared text; moved jsonb := '{}'; n int;
  pk player_private; pr player_private; mk player_medical; mr player_medical;
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
  select min(c) into shared from app.account_contacts(p_keep) c where c in (select app.account_contacts(p_remove));
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
    -- one row per game / training / season / team: keep the kept player's, drop the other's
    delete from team_players x using team_players y where x.player_id = rp and y.player_id = kp and y.team_season_id = x.team_season_id;
    update team_players set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('team_players', n);
    delete from match_availability x using match_availability y where x.player_id = rp and y.player_id = kp and y.match_id = x.match_id;
    update match_availability set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('match_availability', n);
    delete from session_attendance x using session_attendance y where x.player_id = rp and y.player_id = kp and y.session_id = x.session_id;
    update session_attendance set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('session_attendance', n);
    delete from match_squad x using match_squad y where x.player_id = rp and y.player_id = kp and y.match_id = x.match_id;
    update match_squad set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('match_squad', n);
    delete from match_player_stats x using match_player_stats y where x.player_id = rp and y.player_id = kp and y.match_id = x.match_id;
    update match_player_stats set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('match_player_stats', n);
    delete from mvp_votes x using mvp_votes y where x.voter_player_id = rp and y.voter_player_id = kp and y.match_id = x.match_id;
    update mvp_votes set voter_player_id = kp where voter_player_id = rp;
    update mvp_votes set candidate_player_id = kp where candidate_player_id = rp;
    delete from jersey_requests x using jersey_requests y where x.player_id = rp and x.status = 'pending' and y.player_id = kp and y.status = 'pending' and y.team_season_id = x.team_season_id;
    update jersey_requests set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('jersey_requests', n);
    -- a season membership both have: the invoices of the other one move to the kept membership
    update payments pay set membership_id = y.id from memberships x join memberships y on y.player_id = kp and y.season_id = x.season_id
      where x.player_id = rp and pay.membership_id = x.id;
    delete from memberships x using memberships y where x.player_id = rp and y.player_id = kp and y.season_id = x.season_id;
    update memberships set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('memberships', n);
    update payments set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('payments', n);
    update player_contracts set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('player_contracts', n);
    update player_enrolments set player_id = kp where player_id = rp;
    update player_ratings set player_id = kp where player_id = rp;
    update evaluations set player_id = kp where player_id = rp;
    update development_goals set player_id = kp where player_id = rp;
    update event_tasks set player_id = kp where player_id = rp; get diagnostics n = row_count; moved := moved || jsonb_build_object('event_tasks', n);
    update match_events set player_id = kp where player_id = rp;
    update match_events set assist_player_id = kp where assist_player_id = rp;
    update match_events set player_out_id = kp where player_out_id = rp;
    update match_rotation_plan set player_on_id = kp where player_on_id = rp;
    update match_rotation_plan set player_off_id = kp where player_off_id = rp;
    if exists (select 1 from federation_players where player_id = kp) then update federation_players set player_id = null where player_id = rp;
    else update federation_players set player_id = kp where player_id = rp; end if;
    -- contact and medical details: fill the kept player's empty fields
    select * into pk from player_private where player_id = kp; select * into pr from player_private where player_id = rp;
    if pr.id is not null and pk.id is null then update player_private set player_id = kp where id = pr.id;
    elsif pr.id is not null then
      update player_private set phone = coalesce(phone, pr.phone), email = coalesce(email, pr.email), address = coalesce(address, pr.address), city = coalesce(city, pr.city),
        emergency_name = coalesce(emergency_name, pr.emergency_name), emergency_phone = coalesce(emergency_phone, pr.emergency_phone),
        emergency_relation = coalesce(emergency_relation, pr.emergency_relation), updated_at = now() where id = pk.id;
      delete from player_private where id = pr.id;
    end if;
    select * into mk from player_medical where player_id = kp; select * into mr from player_medical where player_id = rp;
    if mr.player_id is not null and mk.player_id is null then update player_medical set player_id = kp where player_id = rp;
    elsif mr.player_id is not null then delete from player_medical where player_id = rp; end if;
    update players k2 set date_of_birth = coalesce(k2.date_of_birth, r2.date_of_birth), nationality = coalesce(k2.nationality, r2.nationality),
      position = coalesce(k2.position, r2.position), secondary_position = coalesce(k2.secondary_position, r2.secondary_position),
      preferred_foot = coalesce(k2.preferred_foot, r2.preferred_foot), height_cm = coalesce(k2.height_cm, r2.height_cm), weight_kg = coalesce(k2.weight_kg, r2.weight_kg),
      bio = coalesce(k2.bio, r2.bio), photo_path = coalesce(k2.photo_path, r2.photo_path), joined_on = least(k2.joined_on, r2.joined_on),
      profile_completed_at = coalesce(k2.profile_completed_at, r2.profile_completed_at), updated_at = now()
      from players r2 where k2.id = kp and r2.id = rp;
    delete from players where id = rp;
    moved := moved || jsonb_build_object('player', 1);
  end if;

  -- ===== the coach record =====
  if rs is not null and ks is null then update staff_members set profile_id = p_keep, updated_at = now() where id = rs;
  elsif rs is not null then
    delete from team_staff x using team_staff y where x.staff_id = rs and y.staff_id = ks and y.team_season_id = x.team_season_id;
    update team_staff set staff_id = ks where staff_id = rs;
    delete from staff_members where id = rs;
  end if;

  -- ===== the account's own rows =====
  delete from conduct_consents x using conduct_consents y where x.profile_id = p_remove and y.profile_id = p_keep and y.version_id = x.version_id;
  update conduct_consents set profile_id = p_keep where profile_id = p_remove;
  if exists (select 1 from content_editors where profile_id = p_keep) then delete from content_editors where profile_id = p_remove;
  else update content_editors set profile_id = p_keep where profile_id = p_remove; end if;
  update notifications set user_id = p_keep where user_id = p_remove;
  update signin_events set profile_id = p_keep where profile_id = p_remove;
  update email_outbox set profile_id = p_keep where profile_id = p_remove;
  -- "done by" marks
  update announcements set created_by = p_keep where created_by = p_remove;
  update app_releases set released_by = p_keep where released_by = p_remove;
  update article_suggestions set decided_by = p_keep where decided_by = p_remove;
  update club_events set created_by = p_keep where created_by = p_remove;
  update contact_messages set handled_by = p_keep where handled_by = p_remove;
  update content_editors set added_by = p_keep where added_by = p_remove;
  update content_revisions set changed_by = p_keep where changed_by = p_remove;
  update development_goals set created_by = p_keep where created_by = p_remove;
  update evaluations set evaluator_id = p_keep where evaluator_id = p_remove;
  update event_tasks set created_by = p_keep where created_by = p_remove;
  update expenses set recorded_by = p_keep where recorded_by = p_remove;
  update invoice_requests set handled_by = p_keep where handled_by = p_remove;
  update jersey_requests set decided_by = p_keep where decided_by = p_remove;
  update join_requests set reviewed_by = p_keep where reviewed_by = p_remove;
  update lineup_templates set created_by = p_keep where created_by = p_remove;
  update locations set created_by = p_keep where created_by = p_remove;
  update match_events set created_by = p_keep where created_by = p_remove;
  update match_events set voided_by = p_keep where voided_by = p_remove;
  update matches set created_by = p_keep where created_by = p_remove;
  update news_posts set author_id = p_keep where author_id = p_remove;
  update opponents set created_by = p_keep where created_by = p_remove;
  update pages set updated_by = p_keep where updated_by = p_remove;
  update payment_receipts set recorded_by = p_keep where recorded_by = p_remove;
  update payments set recorded_by = p_keep where recorded_by = p_remove;
  update player_contracts set club_signed_by = p_keep where club_signed_by = p_remove;
  update player_contracts set created_by = p_keep where created_by = p_remove;
  update player_enrolments set reviewed_by = p_keep where reviewed_by = p_remove;
  update player_ratings set rated_by = p_keep where rated_by = p_remove;
  update session_attendance set marked_by = p_keep where marked_by = p_remove;
  update social_posts set created_by = p_keep where created_by = p_remove;
  update task_types set created_by = p_keep where created_by = p_remove;
  update training_programs set created_by = p_keep where created_by = p_remove;
  update training_schedules set created_by = p_keep where created_by = p_remove;
  update training_sessions set created_by = p_keep where created_by = p_remove;
  update tryout_requests set reviewed_by = p_keep where reviewed_by = p_remove;
  update account_merges set kept_profile_id = p_keep where kept_profile_id = p_remove;
  update account_merges set merged_by = p_keep where merged_by = p_remove;

  -- the kept account's empty fields; an active account stays active when the kept one was still waiting
  update profiles set phone = coalesce(phone, r.phone),
    avatar_path = coalesce(avatar_path, r.avatar_path),
    status = case when status = 'pending' and r.status = 'active' then 'active' else status end, updated_at = now()
    where id = p_keep;

  insert into account_merges (kept_profile_id, removed_profile_id, removed_name, removed_email, removed_phone, shared, moved)
    values (p_keep, p_remove, trim(r.first_name || ' ' || r.last_name), r.email::text, r.phone, shared, moved);
  -- the removed login (its profile goes with it)
  delete from auth.users where id = p_remove;
  return moved || jsonb_build_object('shared', shared);
end $$;
revoke all on function public.merge_accounts(uuid, uuid) from public, anon;
grant execute on function public.merge_accounts(uuid, uuid) to authenticated;
