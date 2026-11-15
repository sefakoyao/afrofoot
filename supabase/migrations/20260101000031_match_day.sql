-- 0031 Match day for coaches. Release 0.19.0.
-- 1. Coaches read the contracts of the players in their own teams (sent, signed or ended; never drafts, never the template).
-- 2. Pre-game protocol on each match: meeting time and place, warm-up, strategy briefing (all before kick-off).
-- 3. Game plan: a lineup style (defensive, balanced, midfield domination, high press, counter-attack, wing play) with
--    team instructions, and a short plan for the players. The lineup itself (match_squad, formations) and the live
--    events (match_events with automatic score and statistics) already exist (migration 0012).

-- ===== 1. Contracts for coaches =====
create policy contract_coach_read on player_contracts for select to authenticated
  using (status <> 'draft' and app.coaches_player(player_id));

-- ===== 2 + 3. Protocol and game plan on matches =====
alter table matches
  add column meet_at timestamptz,
  add column meeting_point text check (char_length(meeting_point) <= 120),
  add column warmup_at timestamptz,
  add column briefing_at timestamptz,
  add column tactic_style text check (tactic_style in ('defensive', 'balanced', 'midfield', 'high_press', 'counter', 'wing_play')),
  add column defensive_line text check (defensive_line in ('low', 'mid', 'high')),
  add column pressing text check (pressing in ('low', 'medium', 'high')),
  add column width text check (width in ('narrow', 'balanced', 'wide')),
  add column tempo text check (tempo in ('slow', 'balanced', 'fast')),
  add column game_plan text check (char_length(game_plan) <= 2000),
  -- every protocol step happens on match day before kick-off (at most 6 hours before)
  add constraint matches_protocol_times check (
    (meet_at is null or (meet_at <= kickoff_at and meet_at >= kickoff_at - interval '6 hours')) and
    (warmup_at is null or (warmup_at <= kickoff_at and warmup_at >= kickoff_at - interval '6 hours')) and
    (briefing_at is null or (briefing_at <= kickoff_at and briefing_at >= kickoff_at - interval '6 hours')));

-- Players already read their team's matches (matches_read). The protocol is for them; nothing private is stored here.
comment on column matches.game_plan is 'Shown to the squad once the lineup is published.';

-- ===== Save a whole lineup in one step (runs as the coach: RLS and the squad rules of migration 0012 still apply) =====
-- p_starters: [{"slot": 1..11, "player": uuid}], p_subs: [uuid], p_captain: one of them or null.
create function public.save_lineup(p_match uuid, p_formation text, p_starters jsonb, p_subs jsonb, p_captain uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare slots jsonb; n int;
begin
  if jsonb_typeof(p_starters) <> 'array' or jsonb_typeof(p_subs) <> 'array' then raise exception 'Bad lineup' using errcode = '22023'; end if;
  if jsonb_array_length(p_starters) > 11 or jsonb_array_length(p_subs) > 12 then raise exception 'Too many players' using errcode = '23514'; end if;
  select f.slots into slots from formations f where f.code = p_formation;
  if slots is null then raise exception 'Unknown formation' using errcode = '23503'; end if;
  update matches set formation = p_formation where id = p_match;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Not your match' using errcode = '42501'; end if;
  if (select count(distinct x) from (select e->>'player' x from jsonb_array_elements(p_starters) e union all select s #>> '{}' from jsonb_array_elements(p_subs) s) q)
     <> jsonb_array_length(p_starters) + jsonb_array_length(p_subs) then raise exception 'A player can only be picked once' using errcode = '23514'; end if;
  if (select count(distinct e->>'slot') from jsonb_array_elements(p_starters) e) <> jsonb_array_length(p_starters) then raise exception 'Two players in one position' using errcode = '23514'; end if;
  if p_captain is not null and not (p_captain::text in (select e->>'player' from jsonb_array_elements(p_starters) e union all select s #>> '{}' from jsonb_array_elements(p_subs) s)) then
    raise exception 'The captain must be in the squad' using errcode = '23514'; end if;
  update match_squad set status = 'not_selected', slot = null, captain = false where match_id = p_match;
  insert into match_squad (match_id, player_id, status, slot, position, shirt_number, captain)
  select p_match, (e->>'player')::uuid, 'starter', (e->>'slot')::int,
         (case (select r->>'role' from jsonb_array_elements(slots) r where (r->>'slot')::int = (e->>'slot')::int)
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
end $$;
revoke all on function public.save_lineup(uuid, text, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.save_lineup(uuid, text, jsonb, jsonb, uuid) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.19.0','feature','Match day for coaches',
  'Coaches add matches and friendlies, plan the pre-game protocol (meeting, warm-up, briefing, kick-off), choose a lineup style with team instructions, pick the lineup on a pitch using the players'' replies, and run the live scoreboard. Coaches can read their players'' contracts and the Code of Conduct.','2026-11-15')
on conflict (version) do nothing;
