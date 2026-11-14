-- SAMPLE DATA FOR THE STAGING DATABASE ONLY. Never run this in production.
-- Purpose: lets the public pages show a next match, a latest result, standings and news while the real data is entered.
-- Dates are relative to "now", so the sample always looks current. Every row is marked "sample" so it can be removed.
-- Remove it all: run supabase/remove_staging_sample.sql

do $$
declare
  v_season uuid; v_team uuid; v_ts uuid; v_loc uuid; v_comp uuid;
begin
  insert into seasons (name, starts_on, ends_on, is_current)
  values ('Sample season', current_date - 200, current_date + 160, not exists (select 1 from seasons where is_current))
  on conflict (name) do nothing;
  select id into v_season from seasons where name = 'Sample season';

  insert into teams (name, slug, category) values ('Afro Foot Club', 'afro-foot-club', 'senior')
  on conflict (slug) do nothing;
  select id into v_team from teams where slug = 'afro-foot-club';

  insert into team_seasons (team_id, season_id, division, is_public) values (v_team, v_season, 'Sample division', true)
  on conflict (team_id, season_id) do nothing;
  select id into v_ts from team_seasons where team_id = v_team and season_id = v_season;

  insert into locations (name, city, notes) values ('Sample pitch', 'Helsinki', 'sample') returning id into v_loc;
  insert into competitions (season_id, name, type, organizer) values (v_season, 'Sample league', 'league', 'sample')
  on conflict (season_id, name) do nothing;
  select id into v_comp from competitions where season_id = v_season and name = 'Sample league';

  insert into matches (team_season_id, competition_id, location_id, opponent, home_away, kickoff_at, status, goals_for, goals_against, division) values
    (v_ts, v_comp, v_loc, 'Sample FC Alpha',   'home', date_trunc('day', now()) + interval '6 days 18 hours', 'scheduled', null, null, 'Sample division'),
    (v_ts, v_comp, v_loc, 'Sample United',     'away', date_trunc('day', now()) + interval '13 days 18 hours', 'scheduled', null, null, 'Sample division'),
    (v_ts, v_comp, v_loc, 'Sample Rovers',     'home', now() - interval '6 days',  'played', 3, 1, 'Sample division'),
    (v_ts, v_comp, v_loc, 'Sample City',       'away', now() - interval '13 days', 'played', 2, 2, 'Sample division'),
    (v_ts, v_comp, v_loc, 'Sample Athletic',   'home', now() - interval '20 days', 'played', 4, 0, 'Sample division'),
    (v_ts, v_comp, v_loc, 'Sample Wanderers',  'away', now() - interval '27 days', 'played', 0, 1, 'Sample division');

  insert into news_posts (slug, title, excerpt, body_md, status, published_at) values
    ('sample-win-at-home', 'Sample: a home win', 'Sample news item. Replace it with real club news.', 'Sample text.', 'published', now() - interval '5 days'),
    ('sample-new-kit', 'Sample: our new kit', 'Sample news item about the kit.', 'Sample text.', 'published', now() - interval '12 days'),
    ('sample-open-training', 'Sample: open training day', 'Sample news item about an open training day.', 'Sample text.', 'published', now() - interval '19 days')
  on conflict (slug) do nothing;
end $$;
