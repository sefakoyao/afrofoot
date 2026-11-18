-- 0052 Who signs contracts for the club (release 0.41.0).
-- Admin → Contracts → settings get the club's signatory: a name and a title (e.g. "General Manager"), kept in
-- site_settings 'contracts' as signatory_name / signatory_title. When an admin countersigns, the contract records that
-- name and title as the club's signature (the admin who clicked stays in club_signed_by and the audit log). Without a
-- signatory the admin's own name is used, as before. Signatures stay frozen once made.

alter table player_contracts add column club_signed_title text check (char_length(club_signed_title) between 1 and 80);

-- Runs after app.guard_contract (triggers on the same event fire in name order: guard, guard_signatory).
create function app.contract_signatory() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_title text;
begin
  if tg_op = 'INSERT' then new.club_signed_title := null; return new; end if;
  if new.status = 'active' and old.status is distinct from 'active' then
    select nullif(trim(value ->> 'signatory_name'), ''), nullif(trim(value ->> 'signatory_title'), '')
      into v_name, v_title from site_settings where key = 'contracts';
    if char_length(v_name) between 2 and 160 then new.club_signed_name := v_name; end if;
    new.club_signed_title := left(v_title, 80);
  elsif new.club_signed_title is distinct from old.club_signed_title then
    raise exception 'Signatures cannot be edited' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger guard_signatory before insert or update on player_contracts for each row execute function app.contract_signatory();

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.41.0','feature','Club signatory and contract footer',
  'Admin → Contracts → settings: the name and title of the person who signs contracts for the club, used when an admin countersigns. Contract PDFs have a footer with the club''s details on every page.','2026-11-18')
on conflict (version) do nothing;
