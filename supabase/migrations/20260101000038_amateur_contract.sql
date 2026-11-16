-- 0038 Amateur player agreement. Release 0.26.0.
-- Afro Foot Club is an amateur club: players are not paid; they contribute to the team's costs with the membership fee and
-- buy their own player licence. In line with the club's mission, the board may exceptionally reduce or waive a player's fee
-- for financial reasons, on a proposal from the coach or team manager.
--  * New default template "Player agreement (amateur)". The previous template is kept (not default) for reference.
--  * Contract settings: the membership fee line and the "included / not included" lists (one item per line) replace the
--    old fee fields of 0037. The licence and insurance prices are linked from the website's Membership page.

update contract_templates set is_default = false where is_default;
insert into contract_templates (name, is_default, body) values ('Player agreement (amateur)', true, $body$## {{club}} – {{team}}
This player agreement is made between {{club}} (the club) and {{player}} (the player) for {{years_text}}, from {{starts}} to {{ends}}.
{{club}} is an amateur football club. Players are not paid. Each player contributes to the team's costs with the membership fee, so that the team can train, play and develop together.
## Season and objectives
{{season_objectives}}
## Membership fee
The player pays the club's membership fee for the season: {{team_fee}}.
The membership fee includes:
{{included_list}}
The membership fee does not include:
{{not_included_list}}
The player buys their own player licence from the Football Association of Finland (Palloliitto) before their first official match, and arranges insurance if they wish. Current licence and insurance prices: {{prices_link}}
Fees for later seasons of this agreement are announced before each season.
## Fee exemption
In line with Afro Foot Club's mission, no player should have to stop playing for financial reasons. In exceptional cases, the club's board may reduce or waive a player's membership fee for a season, based on the player's financial situation. The board decides on a proposal from the player's coach or team manager. A player may ask their coach or team manager to make such a proposal. Exemptions are rare, decided case by case, and kept confidential.
## Obligations of the club
- To organise training sessions and matches with qualified coaching.
- To book the training grounds and register the team in its league.
- To give the player access to the Afro Foot Club app and a personal development plan.
- To provide match kits and training equipment (balls, cones, bibs); football boots and shin guards are the player's own.
- To treat all players appropriately and equally.
## Rights of the club
- To select and field players in the manner it considers best to achieve its objectives.
- To move players between the club's teams at the discretion of the head coach.
- To terminate this agreement if the player fails to fulfil their obligations.
## Obligations of the player
- To participate in training sessions and matches whenever possible.
- To report absences in the agreed manner (in the club app).
- To pay the membership fee on time, or agree a payment plan with the club.
- To hold a valid player licence before playing official matches.
- To arrange insurance, if the player deems it necessary.
- To participate at least once per season in a volunteer event organised by the team.
- To follow the club's Code of Conduct and behave appropriately at club and team events, and elsewhere when wearing club apparel.
- Upon transferring to another club or retiring, to pay any unpaid membership fees and to return all match and training equipment received from the club.
## Confidentiality
The parties undertake to keep the contents of this agreement confidential.
## Term and signature
This agreement enters into force on {{starts}} and expires on {{ends}}.
This agreement is signed electronically in the Afro Foot Club app: first by the player, then by a club representative.$body$)
on conflict (name) do update set is_default = true;

-- Settings: membership fee line and the included / not included lists (newline-separated); kept values are not overwritten.
update site_settings set value = jsonb_build_object(
  'team_fee', '',
  'included', E'League fee per player\nTraining and games\nTraining ground booking\nThe Afro Foot Club app\nPersonal development plan',
  'not_included', E'Player insurance\nPlayer licence'
) || value where key = 'contracts';

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.26.0','feature','Amateur player agreement',
  'The player contract now reflects the amateur club: players are not paid, they contribute with the membership fee and buy their own licence; what the fee includes and excludes is listed; the board may exceptionally waive a fee on a coach''s proposal.','2026-11-16')
on conflict (version) do nothing;
