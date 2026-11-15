-- 0032 Lineup board. Release 0.20.0.
-- 1. Formats 5 v 5 to 11 v 11: formations get a size (format) and 18 new shapes for 9, 8, 7 and 5 players.
-- 2. Player photos: players upload their own photo (storage bucket player-photos, own folder, migration 0009);
--    coaches can view the photos of their own players. photo_path must point into the player's own folder.
-- 3. Rotation plan: planned substitutions per match, private to the team's coaches (fair playing time).
-- 4. save_lineup saves the whole board in one step: formation, players, bench, captain, rotation plan, lineup style,
--    team instructions and the plan for the players. Fixes the style not reaching the lineup (it was saved separately
--    and then overwritten by the board's formation).

-- ===== 1. Formats =====
alter table formations drop constraint formations_slots_check;
alter table formations add column format smallint not null default 11;
alter table formations add constraint formations_format check (format in (5, 7, 8, 9, 11) and jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) = format);
insert into formations (code, name, slots, sort_order, format) values
  ('3-3-2','3-3-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":25.0,"y":44.0},{"slot":6,"role":"MF","x":50.0,"y":44.0},{"slot":7,"role":"MF","x":75.0,"y":44.0},{"slot":8,"role":"FW","x":33.3,"y":16.0},{"slot":9,"role":"FW","x":66.7,"y":16.0}]',200,9),
  ('3-2-3','3-2-3','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":33.3,"y":44.0},{"slot":6,"role":"MF","x":66.7,"y":44.0},{"slot":7,"role":"FW","x":25.0,"y":16.0},{"slot":8,"role":"FW","x":50.0,"y":16.0},{"slot":9,"role":"FW","x":75.0,"y":16.0}]',201,9),
  ('2-4-2','2-4-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":20.0,"y":44.0},{"slot":5,"role":"MF","x":40.0,"y":44.0},{"slot":6,"role":"MF","x":60.0,"y":44.0},{"slot":7,"role":"MF","x":80.0,"y":44.0},{"slot":8,"role":"FW","x":33.3,"y":16.0},{"slot":9,"role":"FW","x":66.7,"y":16.0}]',202,9),
  ('3-4-1','3-4-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":20.0,"y":44.0},{"slot":6,"role":"MF","x":40.0,"y":44.0},{"slot":7,"role":"MF","x":60.0,"y":44.0},{"slot":8,"role":"MF","x":80.0,"y":44.0},{"slot":9,"role":"FW","x":50.0,"y":16.0}]',203,9),
  ('4-3-1','4-3-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":20.0,"y":72.0},{"slot":3,"role":"DF","x":40.0,"y":72.0},{"slot":4,"role":"DF","x":60.0,"y":72.0},{"slot":5,"role":"DF","x":80.0,"y":72.0},{"slot":6,"role":"MF","x":25.0,"y":44.0},{"slot":7,"role":"MF","x":50.0,"y":44.0},{"slot":8,"role":"MF","x":75.0,"y":44.0},{"slot":9,"role":"FW","x":50.0,"y":16.0}]',204,9),
  ('3-3-1','3-3-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":25.0,"y":44.0},{"slot":6,"role":"MF","x":50.0,"y":44.0},{"slot":7,"role":"MF","x":75.0,"y":44.0},{"slot":8,"role":"FW","x":50.0,"y":16.0}]',205,8),
  ('2-3-2','2-3-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":25.0,"y":44.0},{"slot":5,"role":"MF","x":50.0,"y":44.0},{"slot":6,"role":"MF","x":75.0,"y":44.0},{"slot":7,"role":"FW","x":33.3,"y":16.0},{"slot":8,"role":"FW","x":66.7,"y":16.0}]',206,8),
  ('3-2-2','3-2-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":33.3,"y":44.0},{"slot":6,"role":"MF","x":66.7,"y":44.0},{"slot":7,"role":"FW","x":33.3,"y":16.0},{"slot":8,"role":"FW","x":66.7,"y":16.0}]',207,8),
  ('4-2-1','4-2-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":20.0,"y":72.0},{"slot":3,"role":"DF","x":40.0,"y":72.0},{"slot":4,"role":"DF","x":60.0,"y":72.0},{"slot":5,"role":"DF","x":80.0,"y":72.0},{"slot":6,"role":"MF","x":33.3,"y":44.0},{"slot":7,"role":"MF","x":66.7,"y":44.0},{"slot":8,"role":"FW","x":50.0,"y":16.0}]',208,8),
  ('2-4-1','2-4-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":20.0,"y":44.0},{"slot":5,"role":"MF","x":40.0,"y":44.0},{"slot":6,"role":"MF","x":60.0,"y":44.0},{"slot":7,"role":"MF","x":80.0,"y":44.0},{"slot":8,"role":"FW","x":50.0,"y":16.0}]',209,8),
  ('2-3-1','2-3-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":25.0,"y":44.0},{"slot":5,"role":"MF","x":50.0,"y":44.0},{"slot":6,"role":"MF","x":75.0,"y":44.0},{"slot":7,"role":"FW","x":50.0,"y":16.0}]',210,7),
  ('3-2-1','3-2-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":25.0,"y":72.0},{"slot":3,"role":"DF","x":50.0,"y":72.0},{"slot":4,"role":"DF","x":75.0,"y":72.0},{"slot":5,"role":"MF","x":33.3,"y":44.0},{"slot":6,"role":"MF","x":66.7,"y":44.0},{"slot":7,"role":"FW","x":50.0,"y":16.0}]',211,7),
  ('2-2-2','2-2-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":33.3,"y":44.0},{"slot":5,"role":"MF","x":66.7,"y":44.0},{"slot":6,"role":"FW","x":33.3,"y":16.0},{"slot":7,"role":"FW","x":66.7,"y":16.0}]',212,7),
  ('2-1-2-1','2-1-2-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":50.0,"y":53.3},{"slot":5,"role":"MF","x":33.3,"y":34.7},{"slot":6,"role":"MF","x":66.7,"y":34.7},{"slot":7,"role":"FW","x":50.0,"y":16.0}]',213,7),
  ('1-2-1','1-2-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":50.0,"y":72.0},{"slot":3,"role":"MF","x":33.3,"y":44.0},{"slot":4,"role":"MF","x":66.7,"y":44.0},{"slot":5,"role":"FW","x":50.0,"y":16.0}]',214,5),
  ('2-1-1','2-1-1','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"MF","x":50.0,"y":44.0},{"slot":5,"role":"FW","x":50.0,"y":16.0}]',215,5),
  ('2-2','2-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":33.3,"y":72.0},{"slot":3,"role":"DF","x":66.7,"y":72.0},{"slot":4,"role":"FW","x":33.3,"y":16.0},{"slot":5,"role":"FW","x":66.7,"y":16.0}]',216,5),
  ('1-1-2','1-1-2','[{"slot":1,"role":"GK","x":50,"y":92},{"slot":2,"role":"DF","x":50.0,"y":72.0},{"slot":3,"role":"MF","x":50.0,"y":44.0},{"slot":4,"role":"FW","x":33.3,"y":16.0},{"slot":5,"role":"FW","x":66.7,"y":16.0}]',217,5)
on conflict (code) do nothing;

-- ===== 2. Player photos =====
alter table players add constraint players_photo_path check (photo_path is null or (profile_id is not null and photo_path ~ ('^' || profile_id::text || '/[a-z0-9._-]{1,60}$')));
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute $p$create policy "player-photos coach read" on storage.objects for select to authenticated
      using (bucket_id = 'player-photos' and exists (select 1 from public.players p where p.profile_id::text = (storage.foldername(name))[1] and app.coaches_player(p.id)))$p$;
  end if;
end $$;

-- ===== 3. Rotation plan (coaches only; players never see planned changes) =====
create table match_rotation_plan (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  minute int not null check (minute between 1 and 120),
  player_off_id uuid not null references players(id) on delete cascade,
  player_on_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (player_off_id <> player_on_id),
  unique (match_id, player_on_id)                      -- a substitute comes on once
);
create index on match_rotation_plan (match_id);
alter table match_rotation_plan enable row level security;
create policy rotation_coach on match_rotation_plan for all to authenticated
  using (app.is_admin() or exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)))
  with check (app.is_admin() or exists (select 1 from matches m where m.id = match_id and app.coaches_ts(m.team_season_id)));
revoke all on match_rotation_plan from anon;
create trigger audit after insert or update or delete on match_rotation_plan for each row execute function app.audit();

-- ===== 4. Save the whole board =====
drop function public.save_lineup(uuid, text, jsonb, jsonb, uuid);
-- p_starters: [{"slot", "player"}], p_subs: [uuid], p_rotation: [{"minute", "off", "on"}], p_plan: {"style","line","press","width","tempo","text"}
create function public.save_lineup(p_match uuid, p_formation text, p_starters jsonb, p_subs jsonb, p_captain uuid,
  p_rotation jsonb default '[]'::jsonb, p_plan jsonb default null)
returns void language plpgsql security invoker set search_path = public as $$
declare slots jsonb; n int; r jsonb;
begin
  if jsonb_typeof(p_starters) <> 'array' or jsonb_typeof(p_subs) <> 'array' or jsonb_typeof(p_rotation) <> 'array' then raise exception 'Bad lineup' using errcode = '22023'; end if;
  select f.slots into slots from formations f where f.code = p_formation;
  if slots is null then raise exception 'Unknown formation' using errcode = '23503'; end if;
  if jsonb_array_length(p_starters) > jsonb_array_length(slots) or jsonb_array_length(p_subs) > 12 then raise exception 'Too many players' using errcode = '23514'; end if;
  if exists (select 1 from jsonb_array_elements(p_starters) e where (e->>'slot')::int < 1 or (e->>'slot')::int > jsonb_array_length(slots)) then
    raise exception 'Position not in this formation' using errcode = '23514'; end if;
  update matches set formation = p_formation where id = p_match;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Not your match' using errcode = '42501'; end if;
  if p_plan is not null then
    update matches set tactic_style = nullif(p_plan->>'style', ''), defensive_line = nullif(p_plan->>'line', ''), pressing = nullif(p_plan->>'press', ''),
                       width = nullif(p_plan->>'width', ''), tempo = nullif(p_plan->>'tempo', ''), game_plan = nullif(btrim(p_plan->>'text'), '')
     where id = p_match;
  end if;
  if (select count(distinct x) from (select e->>'player' x from jsonb_array_elements(p_starters) e union all select s #>> '{}' from jsonb_array_elements(p_subs) s) q)
     <> jsonb_array_length(p_starters) + jsonb_array_length(p_subs) then raise exception 'A player can only be picked once' using errcode = '23514'; end if;
  if (select count(distinct e->>'slot') from jsonb_array_elements(p_starters) e) <> jsonb_array_length(p_starters) then raise exception 'Two players in one position' using errcode = '23514'; end if;
  if p_captain is not null and not (p_captain::text in (select e->>'player' from jsonb_array_elements(p_starters) e union all select s #>> '{}' from jsonb_array_elements(p_subs) s)) then
    raise exception 'The captain must be in the squad' using errcode = '23514'; end if;
  update match_squad set status = 'not_selected', slot = null, captain = false where match_id = p_match;
  insert into match_squad (match_id, player_id, status, slot, position, shirt_number, captain)
  select p_match, (e->>'player')::uuid, 'starter', (e->>'slot')::int,
         (case (select x->>'role' from jsonb_array_elements(slots) x where (x->>'slot')::int = (e->>'slot')::int)
            when 'GK' then 'goalkeeper' when 'DF' then 'defender' when 'MF' then 'midfielder' else 'forward' end)::player_position,
         (select tp.jersey_number from team_players tp join matches m on m.team_season_id = tp.team_season_id where m.id = p_match and tp.player_id = (e->>'player')::uuid and tp.left_on is null),
         coalesce((e->>'player')::uuid = p_captain, false)
    from jsonb_array_elements(p_starters) e
  on conflict (match_id, player_id) do update set status = excluded.status, slot = excluded.slot, position = excluded.position, shirt_number = excluded.shirt_number, captain = excluded.captain;
  insert into match_squad (match_id, player_id, status, position, shirt_number, captain)
  select p_match, (s #>> '{}')::uuid, 'substitute', pl.position,
         (select tp.jersey_number from team_players tp join matches m on m.team_season_id = tp.team_season_id where m.id = p_match and tp.player_id = pl.id and tp.left_on is null),
         coalesce(pl.id = p_captain, false)
    from jsonb_array_elements(p_subs) s join players pl on pl.id = (s #>> '{}')::uuid
  on conflict (match_id, player_id) do update set status = excluded.status, slot = null, position = excluded.position, shirt_number = excluded.shirt_number, captain = excluded.captain;
  -- rotation plan: on = a substitute, off = a starter or someone who came on earlier in the plan
  delete from match_rotation_plan where match_id = p_match;
  for r in select x from jsonb_array_elements(p_rotation) x order by (x->>'minute')::int loop
    if not ((r->>'on') in (select s #>> '{}' from jsonb_array_elements(p_subs) s)) then raise exception 'Only a substitute can come on' using errcode = '23514'; end if;
    if not ((r->>'off') in (select e->>'player' from jsonb_array_elements(p_starters) e)
            or exists (select 1 from match_rotation_plan p where p.match_id = p_match and p.player_on_id = (r->>'off')::uuid and p.minute < (r->>'minute')::int)) then
      raise exception 'The player going off is not on the pitch then' using errcode = '23514'; end if;
    if exists (select 1 from match_rotation_plan p where p.match_id = p_match and p.player_off_id = (r->>'off')::uuid) then
      raise exception 'A player goes off once' using errcode = '23514'; end if;
    insert into match_rotation_plan (match_id, minute, player_off_id, player_on_id) values (p_match, (r->>'minute')::int, (r->>'off')::uuid, (r->>'on')::uuid);
  end loop;
end $$;
revoke all on function public.save_lineup(uuid, text, jsonb, jsonb, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_lineup(uuid, text, jsonb, jsonb, uuid, jsonb, jsonb) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.20.0','feature','Lineup board',
  'Lineup style drop-down with description beside the pitch; formats 5 v 5 to 11 v 11; drag and drop; player cards with photo, positions, contact, attendance and season minutes; rotation plan with planned minutes; availability summary; PNG, JPG, share and video export. Fixes the lineup style not applying to the formation.','2026-11-15')
on conflict (version) do nothing;
