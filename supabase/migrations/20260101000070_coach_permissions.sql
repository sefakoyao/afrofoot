-- 0070 Coach permissions: extra rights an administrator grants to a coach (or player-coach), one tick per right, on
-- Admin → People → Coach permissions. Each right only ever reaches the teams the coach coaches this season. Off by default.
--   contracts  see the contracts of their teams' players (read only; replaces 0031's rule that every coach saw them)
--   fees       see their teams' players' invoices and whether they are paid (read only)
--   opponents  add, rename and hide names in the opponents list
--   posters    upload and remove matchday poster photos and sponsor logos (storage: public-media/posters/)
-- Safe to run more than once; parts for tables that are not installed (e.g. player contracts) are skipped.

create table if not exists coach_permissions (
  profile_id uuid not null references profiles(id) on delete cascade,
  permission text not null check (permission in ('contracts', 'fees', 'opponents', 'posters')),
  granted_by uuid references profiles(id) on delete set null default auth.uid(),
  granted_at timestamptz not null default now(),
  primary key (profile_id, permission)
);
alter table coach_permissions enable row level security;
revoke all on coach_permissions from anon;
drop policy if exists admin_all on coach_permissions;
create policy admin_all on coach_permissions for all to authenticated using (app.is_admin()) with check (app.is_admin());
drop policy if exists self_read on coach_permissions;
create policy self_read on coach_permissions for select to authenticated using (profile_id = auth.uid());
drop trigger if exists audit on coach_permissions;
create trigger audit after insert or update or delete on coach_permissions for each row execute function app.audit();

-- only coaches and player-coaches hold a permission
create or replace function app.guard_coach_permission() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = new.profile_id and role in ('coach', 'player_coach')) then
    raise exception 'Permissions are for coaches and player-coaches' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists guard on coach_permissions;
create trigger guard before insert or update on coach_permissions for each row execute function app.guard_coach_permission();

-- true when the signed-in coach (still a coach or player-coach, active) has been granted this right. Uses app.role()
-- (migration 0007) rather than app.is_coach() (0045), so it also works on a database installed before 0045.
create or replace function app.coach_may(p_permission text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app.role()::text in ('coach', 'player_coach'), false)
     and exists (select 1 from coach_permissions where profile_id = auth.uid() and permission = p_permission)
$$;

-- contracts: only with the right (it was every coach of the player's team since 0031)
do $$ begin
  if to_regclass('public.player_contracts') is not null then
    drop policy if exists contract_coach_read on player_contracts;
    create policy contract_coach_read on player_contracts for select to authenticated
      using (status <> 'draft' and app.coach_may('contracts') and app.coaches_player(player_id));
  end if;
end $$;

-- fees: the invoices (and their lines and receipts) of the coach's players
drop policy if exists coach_fees_read on payments;
create policy coach_fees_read on payments for select to authenticated using (app.coach_may('fees') and app.coaches_player(player_id));
drop policy if exists coach_fees_read on memberships;
create policy coach_fees_read on memberships for select to authenticated using (app.coach_may('fees') and app.coaches_player(player_id));

-- opponents: coaches with the right add, rename and hide names (every coach already reads them, 0061; skipped before 0061)
do $$ begin
  if to_regclass('public.opponents') is not null then
    drop policy if exists coach_write on opponents;
    create policy coach_write on opponents for all to authenticated using (app.coach_may('opponents')) with check (app.coach_may('opponents'));
  end if;
end $$;

-- poster photos and logos (only where Supabase Storage is installed)
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "public-media posters by coaches" on storage.objects';
    execute $p$create policy "public-media posters by coaches" on storage.objects for all to authenticated
      using (bucket_id = 'public-media' and name like 'posters/%' and app.coach_may('posters'))
      with check (bucket_id = 'public-media' and name like 'posters/%' and app.coach_may('posters'))$p$;
  end if;
end $$;
