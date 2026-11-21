-- 0039 Saved places page. Release 0.27.0.
-- Coaches and admins manage the club's saved places (pitches, halls, gyms) on their own page: add a place, and edit its
-- name, type, address, map link and the directions players see. Before, a place could only be added inside an event form,
-- and a coach could only fix the places they had added themselves.
--  * Coaches may edit every saved place (the audit trail records who changed what). Admins keep full access (admin_all).
--  * Only admins hide or show a place (active). Nobody changes who added it (created_by), except the database itself when
--    that account is deleted (on delete set null).
--  * A place used by a training, a weekly schedule, a game or an event cannot be deleted: hide it instead, so no event
--    loses its place without anyone noticing.
--  * Length checks for the text fields, mirroring the form (lib/places.ts). Added as NOT VALID: they apply to every new
--    or changed row, and older rows that do not meet them are left as they are.

-- Safe to run more than once. Coaches and player-coaches (role::text: works before the player-coach role, 0045, exists).
drop policy if exists coach_update on locations;
create policy coach_update on locations for update to authenticated
  using (app.role()::text in ('coach', 'player_coach') and app.is_active()) with check (app.role()::text in ('coach', 'player_coach') and app.is_active());

create or replace function app.guard_locations() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by and new.created_by is not null then
      raise exception 'Who added a place cannot be changed.' using errcode = '42501';
    end if;
    if new.active is distinct from old.active and auth.uid() is not null and not app.is_admin() then
      raise exception 'Only club admins hide or show a place.' using errcode = '42501';
    end if;
    return new;
  end if;
  if exists (select 1 from training_sessions where location_id = old.id)
     or exists (select 1 from training_schedules where location_id = old.id)
     or exists (select 1 from matches where location_id = old.id)
     or exists (select 1 from club_events where location_id = old.id) then
    raise exception 'This place is used by a training, game or event. Hide it instead of deleting it.' using errcode = '23503';
  end if;
  return old;
end $$;
revoke all on function app.guard_locations() from public;

drop trigger if exists guard_locations on locations;
create trigger guard_locations before update or delete on locations for each row execute function app.guard_locations();

alter table locations drop constraint if exists locations_name_len, drop constraint if exists locations_address_len,
  drop constraint if exists locations_city_len, drop constraint if exists locations_notes_len;
alter table locations
  add constraint locations_name_len check (char_length(btrim(name)) between 2 and 120) not valid,
  add constraint locations_address_len check (address is null or char_length(address) <= 200) not valid,
  add constraint locations_city_len check (city is null or char_length(city) <= 80) not valid,
  add constraint locations_notes_len check (notes is null or char_length(notes) <= 500) not valid;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.27.0','feature','Saved places',
  'Coaches and admins have a Places page: add pitches, halls and gyms, and edit their address, map link and directions for players. Admins can hide a place, or delete one that no event uses.','2026-11-17')
on conflict (version) do nothing;
