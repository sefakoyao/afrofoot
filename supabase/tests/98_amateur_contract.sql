-- 0038 Amateur player agreement: default template, settings lists. Uses the t.* helpers of 10_rls.sql.
begin;
select t.check('one default template: the amateur agreement', (select count(*) from contract_templates where is_default) = 1
  and (select name from contract_templates where is_default) = 'Player agreement (amateur)');
select t.check('previous template kept, not default', exists (select 1 from contract_templates where name = 'Player contract' and not is_default));
select t.check('amateur text: players not paid, membership fee, own licence, prices link', (select body like '%Players are not paid%' and body like '%{{team_fee}}%'
  and body like '%{{included_list}}%' and body like '%{{not_included_list}}%' and body like '%buys their own player licence%' and body like '%{{prices_link}}%' from contract_templates where is_default));
select t.check('fee exemption: board decides, on the coach''s or team manager''s proposal, rare and confidential', (select body like '%## Fee exemption%'
  and body like '%board may reduce or waive%' and body like '%proposal from the player''s coach or team manager%' and body like '%rare%' and body like '%confidential%' from contract_templates where is_default));
select t.check('no paid-player clauses left (club pays fees for the player)', (select body not like '%pays the following fees on behalf of the player%' from contract_templates where is_default));
select t.check('default template has no [[…]] blanks of its own', (select position('[[' in body) = 0 from contract_templates where is_default));
select t.check('settings: included list with the five items', (select value->>'included' = E'League fee per player\nTraining and games\nTraining ground booking\nThe Afro Foot Club app\nPersonal development plan' from site_settings where key = 'contracts'));
select t.check('settings: not included list', (select value->>'not_included' = E'Player insurance\nPlayer licence' from site_settings where key = 'contracts'));
select t.check('settings: membership fee line empty until the club writes it, and still private', (select value->>'team_fee' = '' and not is_public from site_settings where key = 'contracts'));
select t.check('earlier settings kept (mode, length)', (select value->>'auto' = 'send' and (value->>'years')::int = 1 from site_settings where key = 'contracts'));
select t.check('release 0.26.0 present', exists (select 1 from app_releases where version = '0.26.0'));
rollback;
