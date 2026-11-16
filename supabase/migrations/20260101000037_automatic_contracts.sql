-- 0037 Automatic player contracts. Release 0.25.0.
--  * Each team gets a "Season and objectives" text per season (team_seasons.objectives), written once by an admin.
--  * Club-wide contract settings (site_settings 'contracts', admins only): what happens when a player joins a team
--    (create and send the contract / create a draft / nothing), the contract length, and the fee lines of the contract.
--  * The template's [[…]] blanks for those become {{…}} fields filled in automatically, so a contract can be sent
--    without manual editing. A field with no value yet is left as a [[…]] blank, and the contract then waits as a draft.

alter table team_seasons
  add column objectives text check (char_length(objectives) <= 2000);
comment on column team_seasons.objectives is 'Season and objectives of the team (league, series, goals); printed in the player contracts.';

insert into site_settings (key, value, is_public) values ('contracts', jsonb_build_object(
  'auto', 'send',          -- send | draft | off: when a player is added to a team without a contract for the season
  'years', 1,              -- contract length for automatic contracts (1–3)
  'club_fees', '',         -- "The club pays on behalf of the player: …"
  'max_fee_per_year', '',  -- EUR, later seasons
  'volunteer_amount', ''   -- EUR per year instead of a volunteer event
), false) on conflict (key) do nothing;

-- Template: the four blanks become fields (only the exact original blank texts are replaced, so an edited template keeps its own text).
update contract_templates set body =
  replace(replace(replace(replace(body,
    '[[Describe the team''s league and season, e.g. the series the team plays in and the objective for the season.]]', '{{season_objectives}}'),
    '[[Fee paid by the club, e.g. playing licence, EUR amount]]', '{{club_fees}}'),
    '[[maximum per year]]', '{{max_fee_per_year}}'),
    '[[amount]]', '{{volunteer_amount}}');

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.25.0','feature','Automatic player contracts',
  'When a player is approved into a team or added to one, the contract is created from the template with the team, season, objectives and fees filled in, and sent to the player to sign. Admins set the team''s season objectives on the team page and the fee lines once under Contracts.','2026-11-16')
on conflict (version) do nothing;
