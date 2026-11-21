-- 0069 How many teammates said they are in: for the player's home screen ("14 in · 2 out · 4 waiting"). Counts only,
-- never names, and only for trainings and games of a team the caller plays in or coaches (admins: any).
create or replace function public.event_reply_counts(p_ids uuid[])
returns table (event_id uuid, yes int, no int, maybe int, pending int)
language sql stable security definer set search_path = public as $$
  select s.id, count(*) filter (where a.availability = 'yes')::int, count(*) filter (where a.availability = 'no')::int,
         count(*) filter (where a.availability = 'maybe')::int, count(*) filter (where a.availability = 'pending')::int
  from training_sessions s join session_attendance a on a.session_id = s.id
  where s.id = any(p_ids) and (app.is_admin() or app.coaches_ts(s.team_season_id) or app.in_team_ts(s.team_season_id))
  group by s.id
  union all
  select m.id, count(*) filter (where a.availability = 'yes')::int, count(*) filter (where a.availability = 'no')::int,
         count(*) filter (where a.availability = 'maybe')::int, count(*) filter (where a.availability = 'pending')::int
  from matches m join match_availability a on a.match_id = m.id
  where m.id = any(p_ids) and (app.is_admin() or app.coaches_ts(m.team_season_id) or app.in_team_ts(m.team_season_id))
  group by m.id
$$;
revoke all on function public.event_reply_counts(uuid[]) from public, anon;
grant execute on function public.event_reply_counts(uuid[]) to authenticated;
