-- 0064 Content assistant, step 1 (release 0.55.0). Safe to run again.
-- The app finds topics in the club's own data (match reports, previews, events, new players and sponsors, a monthly
-- recap), Claude drafts the website article (English, Finnish, French, Arabic) and the social media posts (English +
-- Finnish), and an approver checks, edits and approves. Approving publishes the article on the website and queues the
-- Facebook / Instagram / TikTok posts; they wait until the platforms are connected (step 2 and 3).
-- Approvers: admins and the club's communications people (content_editors). They also write news by hand.
-- Only facts from the app go to Claude: names only of players who agreed to be shown publicly (players.show_publicly).

-- ---------- who may publish ----------
create table if not exists content_editors (
  profile_id uuid primary key references profiles(id) on delete cascade,
  added_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table content_editors enable row level security;
revoke all on content_editors from anon;
drop policy if exists admin_all on content_editors;
create policy admin_all on content_editors for all to authenticated using (app.is_admin()) with check (app.is_admin());
drop policy if exists self_read on content_editors;
create policy self_read on content_editors for select to authenticated using (profile_id = auth.uid());
drop trigger if exists audit on content_editors;
create trigger audit after insert or update or delete on content_editors for each row execute function app.audit();

create or replace function app.can_publish() returns boolean language sql stable security definer set search_path = public as $$
  select app.is_admin() or (app.is_active() and exists (select 1 from content_editors where profile_id = auth.uid()))
$$;
grant execute on function app.can_publish() to authenticated;
create or replace function public.can_publish() returns boolean language sql stable security definer set search_path = public as $$ select app.can_publish() $$;
revoke all on function public.can_publish() from public, anon;
grant execute on function public.can_publish() to authenticated;

-- communications people write and publish news too (admins already can: admin_all, 0008)
drop policy if exists editor_all on news_posts;
create policy editor_all on news_posts for all to authenticated using (app.can_publish()) with check (app.can_publish());

-- ---------- suggestions ----------
create table if not exists article_suggestions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('match_report', 'match_preview', 'event', 'new_player', 'new_sponsor', 'monthly_recap')),
  source_key text not null unique check (char_length(source_key) between 3 and 120),   -- e.g. match_report:<match id>: one suggestion per topic
  facts jsonb not null,                                                                -- exactly what Claude was given
  status text not null default 'new' check (status in ('new', 'approved', 'rejected')),
  title text not null check (char_length(title) between 3 and 160),
  excerpt text check (excerpt is null or char_length(excerpt) <= 300),
  body_md text not null check (char_length(body_md) between 20 and 20000),
  translations jsonb not null default '{}' check (app.valid_translations(translations)),
  social jsonb not null default '{}' check (jsonb_typeof(social) = 'object'),        -- {facebook, instagram, tiktok}: bilingual captions
  checks text[] not null default '{}',                                                 -- what the approver should verify
  post_at timestamptz,                                                                 -- suggested time for the social posts
  model text,
  news_post_id uuid references news_posts(id) on delete set null,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists article_suggestions_status on article_suggestions (status, created_at desc);
alter table article_suggestions enable row level security;
revoke all on article_suggestions from anon;
drop policy if exists publishers_all on article_suggestions;
create policy publishers_all on article_suggestions for all to authenticated using (app.can_publish()) with check (app.can_publish());
drop trigger if exists audit on article_suggestions;
create trigger audit after insert or update or delete on article_suggestions for each row execute function app.audit();

-- ---------- social media posts ----------
create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  news_post_id uuid not null references news_posts(id) on delete cascade,
  suggestion_id uuid references article_suggestions(id) on delete set null,
  platform text not null check (platform in ('facebook', 'instagram', 'tiktok')),
  caption text not null check (char_length(caption) between 1 and 2200),
  status text not null default 'waiting' check (status in ('waiting', 'scheduled', 'posted', 'failed', 'cancelled')),
  post_at timestamptz,
  external_url text check (external_url is null or external_url ~ '^https://'),
  error text check (error is null or char_length(error) <= 500),
  attempts int not null default 0,
  posted_at timestamptz,
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists social_posts_one_per_platform on social_posts (news_post_id, platform) where status <> 'cancelled';
alter table social_posts enable row level security;
revoke all on social_posts from anon;
drop policy if exists publishers_all on social_posts;
create policy publishers_all on social_posts for all to authenticated using (app.can_publish()) with check (app.can_publish());
drop trigger if exists audit on social_posts;
create trigger audit after insert or update or delete on social_posts for each row execute function app.audit();

-- ---------- topics found in the club's data ----------
-- A player's name only if they agreed to be shown publicly; otherwise null (the article says "a player").
create or replace function app.public_name(p uuid) returns text language sql stable security definer set search_path = public as $$
  select case when show_publicly then first_name || ' ' || last_name end from players where id = p
$$;

-- Topics not suggested yet, each with its facts. For approvers (the "Find new topics" button) and the server job.
create or replace function public.content_candidates(p_now timestamptz default now())
returns table (kind text, source_key text, facts jsonb)
language plpgsql stable security definer set search_path = public as $$
declare v_today date := (p_now at time zone 'Europe/Helsinki')::date; v_month date := date_trunc('month', (p_now at time zone 'Europe/Helsinki')::date - interval '1 month')::date;
begin
  if not (app.can_publish() or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role') then raise exception 'publishers only' using errcode = '42501'; end if;
  return query
  with games as (
    select m.*, t.name as team, l.name as venue, l.city
    from matches m join team_seasons ts on ts.id = m.team_season_id join teams t on t.id = ts.team_id left join locations l on l.id = m.location_id
  )
  -- match reports: games finished in the last 3 days
  select 'match_report'::text, 'match_report:' || g.id, jsonb_build_object(
      'team', g.team, 'opponent', g.opponent, 'home_away', g.home_away, 'type', g.event_type, 'division', g.division,
      'kickoff', to_char(g.kickoff_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD HH24:MI'), 'venue', g.venue, 'city', g.city,
      'goals_for', g.goals_for, 'goals_against', g.goals_against,
      'our_goals', coalesce((select jsonb_agg(jsonb_build_object('minute', e.minute, 'scorer', app.public_name(e.player_id), 'assist', app.public_name(e.assist_player_id), 'type', e.type) order by e.minute)
                    from match_events e where e.match_id = g.id and not e.voided and e.side = 'us' and e.type in ('goal', 'penalty_scored')), '[]'),
      'opponent_goal_minutes', coalesce((select jsonb_agg(e.minute order by e.minute) from match_events e where e.match_id = g.id and not e.voided and e.side = 'opponent' and e.type in ('goal', 'penalty_scored', 'own_goal')), '[]'))
  from games g
  where (g.status = 'played' or g.live_state = 'full_time') and g.goals_for is not null and g.kickoff_at between p_now - interval '3 days' and p_now
    and not exists (select 1 from article_suggestions s where s.source_key = 'match_report:' || g.id)
  union all
  -- previews: games in the next 4 days
  select 'match_preview', 'match_preview:' || g.id, jsonb_build_object(
      'team', g.team, 'opponent', g.opponent, 'home_away', g.home_away, 'type', g.event_type, 'division', g.division,
      'kickoff', to_char(g.kickoff_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD HH24:MI'), 'weekday', trim(to_char(g.kickoff_at at time zone 'Europe/Helsinki', 'Day')),
      'venue', g.venue, 'city', g.city,
      'last_results', coalesce((select jsonb_agg(jsonb_build_object('opponent', p.opponent, 'score', p.goals_for || '-' || p.goals_against) order by p.kickoff_at desc)
                       from (select * from matches p where p.team_season_id = g.team_season_id and p.status = 'played' and p.kickoff_at < g.kickoff_at order by p.kickoff_at desc limit 3) p), '[]'))
  from games g
  where g.status = 'scheduled' and g.kickoff_at between p_now and p_now + interval '4 days'
    and not exists (select 1 from article_suggestions s where s.source_key = 'match_preview:' || g.id)
  union all
  -- new public club events still to come
  select 'event', 'event:' || e.id, jsonb_build_object('title', e.title, 'kind', e.kind, 'description', e.description,
      'starts', to_char(e.starts_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD HH24:MI'), 'ends', to_char(e.ends_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD HH24:MI'),
      'place', l.name, 'city', l.city, 'for', coalesce(t.name, 'the whole club'))
  from club_events e left join locations l on l.id = e.location_id left join team_seasons ts on ts.id = e.team_season_id left join teams t on t.id = ts.team_id
  where e.public and e.status = 'scheduled' and e.created_at > p_now - interval '7 days' and e.starts_at > p_now
    and not exists (select 1 from article_suggestions s where s.source_key = 'event:' || e.id)
  union all
  -- new players: contracts countersigned in the last 14 days, players shown publicly only
  select 'new_player', 'new_player:' || k.id, jsonb_build_object('name', pl.first_name || ' ' || pl.last_name, 'position', pl.position, 'contract_years', k.years,
      'contract_starts', k.starts_on, 'team', (select t.name from team_players tp join team_seasons ts on ts.id = tp.team_season_id join teams t on t.id = ts.team_id
                                               where tp.player_id = pl.id and tp.left_on is null order by tp.created_at desc limit 1))
  from player_contracts k join players pl on pl.id = k.player_id
  where k.status = 'active' and k.club_signed_at > p_now - interval '14 days' and pl.show_publicly
    and not exists (select 1 from article_suggestions s where s.source_key = 'new_player:' || k.id)
  union all
  -- new sponsors (last 30 days)
  select 'new_sponsor', 'new_sponsor:' || sp.id, jsonb_build_object('name', sp.name, 'tier', sp.tier, 'description', sp.description, 'website', sp.website_url)
  from sponsors sp
  where sp.active and sp.created_at > p_now - interval '30 days'
    and not exists (select 1 from article_suggestions s where s.source_key = 'new_sponsor:' || sp.id)
  union all
  -- monthly recap of last month, offered on the 1st–5th
  select 'monthly_recap', 'monthly_recap:' || to_char(v_month, 'YYYY-MM'), jsonb_build_object(
      'month', to_char(v_month, 'YYYY-MM'),
      'games', coalesce((select jsonb_agg(jsonb_build_object('date', to_char(m.kickoff_at at time zone 'Europe/Helsinki', 'YYYY-MM-DD'), 'team', t.name, 'opponent', m.opponent,
                          'home_away', m.home_away, 'score', m.goals_for || '-' || m.goals_against) order by m.kickoff_at)
                 from matches m join team_seasons ts on ts.id = m.team_season_id join teams t on t.id = ts.team_id
                 where m.status = 'played' and (m.kickoff_at at time zone 'Europe/Helsinki')::date >= v_month and (m.kickoff_at at time zone 'Europe/Helsinki')::date < (v_month + interval '1 month')::date), '[]'),
      'events', coalesce((select jsonb_agg(e.title order by e.starts_at) from club_events e where e.public and e.status = 'scheduled'
                 and (e.starts_at at time zone 'Europe/Helsinki')::date >= v_month and (e.starts_at at time zone 'Europe/Helsinki')::date < (v_month + interval '1 month')::date), '[]'),
      'new_players', (select count(*) from player_contracts k where k.status = 'active' and (k.club_signed_at at time zone 'Europe/Helsinki')::date >= v_month
                 and (k.club_signed_at at time zone 'Europe/Helsinki')::date < (v_month + interval '1 month')::date))
  where extract(day from v_today) <= 5
    and exists (select 1 from matches m where m.status = 'played' and (m.kickoff_at at time zone 'Europe/Helsinki')::date >= v_month and (m.kickoff_at at time zone 'Europe/Helsinki')::date < (v_month + interval '1 month')::date)
    and not exists (select 1 from article_suggestions s where s.source_key = 'monthly_recap:' || to_char(v_month, 'YYYY-MM'));
end $$;
revoke all on function public.content_candidates(timestamptz) from public, anon;
grant execute on function public.content_candidates(timestamptz) to authenticated, service_role;

-- ---------- approve: publish the article and queue the social posts ----------
create or replace function app.slugify(p text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(translate(coalesce(p, ''), 'ÄÖÅäöåÉÈÊéèêÇçÜüÏïÔô', 'AOAaoaEEEeeeCcUuIiOo')), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.approve_suggestion(p_id uuid, p_post_at timestamptz, p_platforms text[], p_captions jsonb default null, p_site_url text default 'https://www.afrofoot.club') returns uuid
language plpgsql security definer set search_path = public as $$
declare s article_suggestions; v_slug text; v_base text; v_post uuid; v_p text; v_cap text; n int := 1;
begin
  if not app.can_publish() then raise exception 'publishers only' using errcode = '42501'; end if;
  select * into s from article_suggestions where id = p_id for update;
  if s.id is null or s.status <> 'new' then raise exception 'not an open suggestion' using errcode = '22023'; end if;
  if p_post_at is not null and (p_post_at < now() - interval '1 hour' or p_post_at > now() + interval '60 days') then raise exception 'posting time: from now to 60 days ahead' using errcode = '22023'; end if;
  if p_platforms is null or not (p_platforms <@ array['facebook', 'instagram', 'tiktok']) then raise exception 'unknown platform' using errcode = '22023'; end if;
  v_base := left(coalesce(nullif(app.slugify(s.title), ''), 'news'), 70);
  v_slug := v_base;
  while exists (select 1 from news_posts where slug = v_slug) loop n := n + 1; v_slug := v_base || '-' || n; end loop;
  insert into news_posts (slug, title, excerpt, body_md, status, published_at, author_id, translations)
  values (v_slug, s.title, s.excerpt, s.body_md, 'published', now(), auth.uid(), s.translations)
  returning id into v_post;
  foreach v_p in array (select array_agg(distinct x) from unnest(p_platforms) x where x is not null) loop
    v_cap := coalesce(nullif(btrim(p_captions ->> v_p), ''), nullif(btrim(s.social ->> v_p), ''));
    if v_cap is null then raise exception 'caption missing for %', v_p using errcode = '22023'; end if;
    -- the article's address replaces {link} (Instagram and TikTok captions say "link in bio" instead)
    v_cap := replace(v_cap, '{link}', rtrim(coalesce(nullif(p_site_url, ''), 'https://www.afrofoot.club'), '/') || '/news/' || v_slug);
    insert into social_posts (news_post_id, suggestion_id, platform, caption, status, post_at)
    values (v_post, s.id, v_p, left(v_cap, 2200), 'waiting', coalesce(p_post_at, now()));
  end loop;
  update article_suggestions set status = 'approved', news_post_id = v_post, decided_by = auth.uid(), decided_at = now(), post_at = coalesce(p_post_at, post_at), updated_at = now() where id = s.id;
  return v_post;
end $$;
drop function if exists public.approve_suggestion(uuid, timestamptz, text[], jsonb);
revoke all on function public.approve_suggestion(uuid, timestamptz, text[], jsonb, text) from public, anon;
grant execute on function public.approve_suggestion(uuid, timestamptz, text[], jsonb, text) to authenticated;

-- default posting time: the best time for each kind of post (the app works it out); or a fixed time, e.g. "18:00"
insert into site_settings (key, value, is_public) values ('content', '{"post_time": "best"}', true) on conflict (key) do nothing;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.55.0','feature','Content assistant (step 1): suggested articles',
  'The app finds topics in the club''s data (match reports, previews, events, new players and sponsors, a monthly recap) and drafts the article in four languages and the social media posts in English and Finnish. Admins and the communications people check, edit and approve: the article is published on the website and the Facebook, Instagram and TikTok posts wait for the platform connections. News can also be written by hand.','2026-11-20')
on conflict (version) do nothing;
