-- Removes everything added by seed_staging_sample.sql (staging only).
delete from matches where team_season_id in (select ts.id from team_seasons ts join seasons s on s.id = ts.season_id where s.name = 'Sample season');
delete from competitions where name = 'Sample league';
delete from locations where name = 'Sample pitch';
delete from news_posts where slug like 'sample-%';
delete from team_seasons where season_id in (select id from seasons where name = 'Sample season');
delete from seasons where name = 'Sample season';
delete from teams where slug = 'afro-foot-club' and not exists (select 1 from team_seasons where team_id = teams.id);
