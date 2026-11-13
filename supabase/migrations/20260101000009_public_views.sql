-- 0009 column-limited views. They run with the owner's rights on purpose: only consented / non-sensitive columns are exposed.
create view public_players as
select p.id, (p.first_name || ' ' || p.last_name) as display_name, p.position, p.nationality, p.photo_path, tp.jersey_number, t.name as team_name
from players p
join team_players tp on tp.player_id = p.id and tp.left_on is null
join team_seasons ts on ts.id = tp.team_season_id and ts.is_public
join seasons s on s.id = ts.season_id and s.is_current
join teams t on t.id = ts.team_id
where p.show_publicly and p.status = 'active';

create view public_staff as
select id, (first_name || ' ' || last_name) as display_name, type, title, bio, photo_path, sort_order
from staff_members where is_public and active;

create view public_fixtures as
select m.id, t.name as team_name, c.name as competition, m.opponent, m.home_away, m.kickoff_at, m.status, m.goals_for, m.goals_against, l.name as venue, l.city
from matches m
join team_seasons ts on ts.id = m.team_season_id and ts.is_public
join teams t on t.id = ts.team_id
left join competitions c on c.id = m.competition_id
left join locations l on l.id = m.location_id
where m.status in ('scheduled','played');

create view public_team_records as
select ts.id as team_season_id, t.name as team_name, c.name as competition,
  count(*) as played,
  count(*) filter (where m.goals_for > m.goals_against) as won,
  count(*) filter (where m.goals_for = m.goals_against) as drawn,
  count(*) filter (where m.goals_for < m.goals_against) as lost,
  sum(m.goals_for) as goals_for, sum(m.goals_against) as goals_against,
  count(*) filter (where m.goals_for > m.goals_against) * 3 + count(*) filter (where m.goals_for = m.goals_against) as points
from matches m
join team_seasons ts on ts.id = m.team_season_id and ts.is_public
join teams t on t.id = ts.team_id
join competitions c on c.id = m.competition_id and c.type = 'league'
where m.status = 'played'
group by ts.id, t.name, c.name;

-- Signed-in teammates: names and playing info only, scoped by the caller's own role.
create view team_roster as
select tp.team_season_id, p.id as player_id, (p.first_name || ' ' || p.last_name) as display_name, p.position, p.photo_path, tp.jersey_number, tp.captain
from team_players tp join players p on p.id = tp.player_id
where tp.left_on is null and (app.is_admin() or app.coaches_ts(tp.team_season_id) or app.in_team_ts(tp.team_season_id));

grant select on public_players, public_staff, public_fixtures, public_team_records to anon, authenticated;
grant select on team_roster to authenticated;

-- Financial summary for the admin dashboard (admins only through the function guard).
create function public.finance_summary(p_season uuid) returns table (income_cents bigint, pending_cents bigint, expenses_cents bigint, net_cents bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
  select i.paid, i.pending, e.spent, i.paid - e.spent from
   (select coalesce(sum(amount_cents) filter (where p.status = 'paid'), 0)::bigint paid, coalesce(sum(amount_cents) filter (where p.status = 'pending'), 0)::bigint pending
      from payments p left join memberships m on m.id = p.membership_id where m.season_id = p_season or (p.membership_id is null and p.created_at::date between (select starts_on from seasons where id = p_season) and (select ends_on from seasons where id = p_season))) i,
   (select coalesce(sum(amount_cents), 0)::bigint spent from expenses where season_id = p_season) e;
end $$;
revoke execute on function public.finance_summary(uuid) from anon;

-- Storage buckets (only when running on Supabase).
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('public-media','public-media',true),('player-photos','player-photos',false),('private-docs','private-docs',false) on conflict (id) do nothing;
    execute $p$create policy "public-media read" on storage.objects for select using (bucket_id = 'public-media')$p$;
    execute $p$create policy "public-media admin write" on storage.objects for all to authenticated using (bucket_id = 'public-media' and app.is_admin()) with check (bucket_id = 'public-media' and app.is_admin())$p$;
    execute $p$create policy "player-photos own folder" on storage.objects for all to authenticated using (bucket_id = 'player-photos' and (app.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)) with check (bucket_id = 'player-photos' and (app.is_admin() or (storage.foldername(name))[1] = auth.uid()::text))$p$;
    execute $p$create policy "private-docs admin only" on storage.objects for all to authenticated using (bucket_id = 'private-docs' and app.is_admin()) with check (bucket_id = 'private-docs' and app.is_admin())$p$;
  end if;
end $$;
