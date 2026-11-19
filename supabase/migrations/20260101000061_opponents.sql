-- 0061 Opponents list (release 0.52.0).
-- The teams the club plays against, ready to pick when a game or friendly is booked (Admin → Events, a coach's team
-- page). A name typed as "+ Add a new opponent" is remembered automatically when the game is saved (trigger on matches),
-- so the next booking can pick it. Admins rename or hide names (Admin → Teams & events → Opponents). Games keep the
-- name they were booked with (matches.opponent stays text), so renaming or hiding never changes past games.

create table if not exists opponents (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120 and name = btrim(name)),
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists opponents_name_key on opponents (lower(name));
alter table opponents enable row level security;
revoke all on opponents from anon;
-- read: the people who book games (coaches, admins); write: admins (coaches add names only through their games)
drop policy if exists staff_read on opponents;
create policy staff_read on opponents for select to authenticated using (app.is_admin() or app.is_coach());
drop policy if exists admin_write on opponents;
create policy admin_write on opponents for all to authenticated using (app.is_admin()) with check (app.is_admin());
drop trigger if exists audit on opponents;
create trigger audit after insert or update or delete on opponents for each row execute function app.audit();

-- a game's opponent joins the list (again visible if it had been hidden)
create or replace function app.remember_opponent() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.opponent is not null and btrim(new.opponent) <> '' then
    insert into opponents (name, created_by) values (btrim(new.opponent), auth.uid())
    on conflict ((lower(name))) do update set active = true, updated_at = now() where not opponents.active;
  end if;
  return new;
end $$;
drop trigger if exists remember_opponent on matches;
create trigger remember_opponent after insert or update of opponent on matches for each row execute function app.remember_opponent();

-- the club's list (November 2026) and every opponent already booked
insert into opponents (name) values
  ('5/1'),
  ('6/10'),
  ('AFC EMU'),
  ('AFG united'),
  ('Africa United'),
  ('Akilles'),
  ('Anadolusk'),
  ('Andalus FC'),
  ('Ariana AFG'),
  ('Chicken Wings/2'),
  ('Club Latino Español "CLE"'),
  ('Congo'),
  ('Espa United'),
  ('FC Degis'),
  ('FC Eagles'),
  ('FC Fortuna'),
  ('FC Haxi'),
  ('FC Inter Vuosaari'),
  ('FC KaKe'),
  ('FC Kontu/KoVa'),
  ('FC Mango'),
  ('FC Nile'),
  ('FC Parseh'),
  ('FC Pehmeet ja Märät'),
  ('FC POHU/Futboleros'),
  ('FC Tuusula'),
  ('FC Viikingit'),
  ('FC Viikingit/S.C.P'),
  ('FC Vuosaari (Div. 4)'),
  ('Flamingo FC, Lahti'),
  ('Flamingo United'),
  ('Gambia 🇬🇲'),
  ('HAlku'),
  ('HaPK Edustus/2'),
  ('HDS/Express'),
  ('Helsingin Ponnistus/2 (Div 5)'),
  ('HePuli'),
  ('HJK/Töölön Ihme'),
  ('HyPS'),
  ('JäPS/Akatemia'),
  ('JäPS/U23'),
  ('Jätkäsaaren pallo'),
  ('KeIA'),
  ('KeiKa/United'),
  ('Kenya 🇰🇪'),
  ('Kilo IF/1'),
  ('KoiPS'),
  ('KoiPS/Dynamo'),
  ('KPPK'),
  ('Millbrook FC'),
  ('MK-United'),
  ('MPS/Atletico Akatemia'),
  ('MPS/AtleticoAkatemia'),
  ('Nikinmäki United'),
  ('NJS/Jucola'),
  ('PETO/2'),
  ('PK-35/2'),
  ('Polin Pallo'),
  ('Ponnistajat'),
  ('Ponnistus'),
  ('PPS'),
  ('PPS/OS'),
  ('PuiU/86'),
  ('PuiU/Akatemia'),
  ('Rwanda Team 🇷🇼'),
  ('SAPA/2'),
  ('Sierra Leone 🇸🇱'),
  ('SUMU/sob'),
  ('TAT Oppenent'),
  ('TBD'),
  ('Team Congo'),
  ('Team Gambia 🇬🇲'),
  ('Team Nigeria'),
  ('Team Vietnam'),
  ('Team Zambia'),
  ('ToBK'),
  ('ToTe/Keparoi'),
  ('ToTe/Taiskin Tykit'),
  ('TuPS/Skavaböle'),
  ('United Arabs'),
  ('Valtti/3'),
  ('Veijarit'),
  ('Vietfin FC'),
  ('Wartti/Wild Boars')
on conflict ((lower(name))) do nothing;
insert into opponents (name, created_by) select distinct on (lower(btrim(opponent))) btrim(opponent), null from matches where btrim(opponent) <> ''
on conflict ((lower(name))) do nothing;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.52.0','feature','Opponents list',
  'Booking a game or friendly: pick the opponent from the club''s list, or add a new one (it is remembered). Admins rename or hide names under Teams & events → Opponents.','2026-11-20')
on conflict (version) do nothing;
