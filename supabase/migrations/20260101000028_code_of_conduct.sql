-- 0028 Code of Conduct: versions of the club's code and each member's consent to the current one. Release 0.17.0.
-- A new version (is_current) asks everyone again: consent is recorded per version and never edited (append-only, audited).

create table conduct_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (version ~ '^[0-9A-Za-z._-]{1,20}$'),
  title text not null check (char_length(title) between 3 and 160),
  published_label text check (char_length(published_label) <= 80),       -- as printed on the document, e.g. "Updated November 2027"
  body text not null check (char_length(body) between 10 and 40000),      -- "## Heading", "- bullet" and paragraphs; shown in the app
  pdf_path text check (pdf_path ~ '^/documents/[a-z0-9._-]+\.pdf$'),     -- the signed original, served by the app
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index conduct_versions_one_current on conduct_versions (is_current) where is_current;
alter table conduct_versions enable row level security;
create policy admin_all on conduct_versions for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy member_read on conduct_versions for select to authenticated using (app.is_active());
create trigger audit after insert or update or delete on conduct_versions for each row execute function app.audit();
revoke all on conduct_versions from anon;

create table conduct_consents (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references conduct_versions(id) on delete restrict,
  profile_id uuid not null references profiles(id) on delete cascade,
  consented_at timestamptz not null default now(),
  unique (version_id, profile_id)
);
create index on conduct_consents (profile_id);
alter table conduct_consents enable row level security;
-- Members agree for themselves, to the current version only, and can read their own consents.
create policy consent_self_insert on conduct_consents for insert to authenticated
  with check (profile_id = auth.uid() and app.is_active() and exists (select 1 from conduct_versions v where v.id = version_id and v.is_current));
create policy consent_self_read on conduct_consents for select to authenticated using (profile_id = auth.uid());
-- Admins see everyone's; coaches see the players of their own teams (to know who still has to agree).
create policy consent_admin_read on conduct_consents for select to authenticated using (app.is_admin());
create policy consent_coach_read on conduct_consents for select to authenticated
  using (exists (select 1 from players pl where pl.profile_id = conduct_consents.profile_id and app.coaches_player(pl.id)));
create trigger audit after insert or update or delete on conduct_consents for each row execute function app.audit();
revoke all on conduct_consents from anon;
revoke update, delete on conduct_consents from authenticated;   -- a consent is never changed or withdrawn silently

-- The club's Code of Ethics as published (PDF "Afro Foot Club Code of Conduct 2027").
insert into conduct_versions (version, title, published_label, pdf_path, is_current, body) values ('2027', 'Code of Ethics', 'Updated November 2027',
 '/documents/afro-foot-club-code-of-ethics-2027.pdf', true, $body$## I. Preamble
Officially registered with the Finnish Patent and Registration Office (PRH) on 24th July, 2020 as "Afro Foot Club ry," domiciled in Helsinki, Finland. The AFRO FOOT Club ry is for sports and recreation. It is a community that operates on the principle of equality, encouraging participation based on trust and respect.
All those involved with the game at every level, whether as a player, spectator, match official, coach, founder, or administrator, have a responsibility, above and beyond compliance with the law, to act according to the highest standards of integrity and ensure that the game's reputation is and remains high.
This Code of Conduct applies to all those involved in football under the auspices of The AFRO FOOT Club.
This is designed to ensure that all team members refrain from actions that could breach, violate, threaten, upset, insult, demean, or discriminate against anyone based on their gender, race, nationality, beliefs, caste, disability, age, religious or political views, sexual orientation, social status, ethnic background, language, marital or civil partnerships, and color.
All club stakeholders share responsibility for fostering a clean, healthy environment. They are tasked with maintaining the premises in a clean, tidy condition to enhance the club's positive image.
## II. Respect
Respect is the AFRO FOOT Club's response to a clear message from throughout the game.
Football's health depends upon high standards of behavior on and off the pitch.
- It is a behavioral code for the AFRO FOOT Club.
- It is about recognizing that the integrity of the game is more important than the match result.
- It is for ALL and plays a key part in uniting the game.
- Respect involves establishing clear guidelines on acceptable and unacceptable conduct within the AFRO FOOT Club and throughout SUOMEN PALLOLIITTO.
- It is about those involved taking responsibility for the consequences of their actions.
- It is about supporting match officials in doing their jobs effectively and efficiently.
- Respect is not a slogan. Football players are collectively responsible for creating a safe, fun, and inclusive environment where the game can take place.
The Respect Codes of Conduct specify expectations for all participants in a game, including players, coaches, match officials, and spectators, to ensure a safe, enjoyable, and inclusive environment. They also list various sanctions for those who break these codes.
Our collective duty is to uphold high standards of conduct during every game, both on and off the field. Please do your part and adhere to the Club's Respect Code of Conduct for Players/Members, Spectators, Coaches, Team Managers, and Club Officials below.
## III. Code of conduct for members/players
As a team member/player, I will:
- Adhere to the laws of the game by promoting its reputation and taking all possible steps to ensure that it is not brought into disrepute.
- Consistently display and promote high standards of behavior and fair play.
- Ensure the game is played and conducted in accordance with the principles of disciplined sporting behavior. Acknowledge that relying solely on match officials to maintain these principles is insufficient.
- Arrive for training and matches in good time to prepare thoroughly and with appropriate kit for the activity.
- Always respect, observe, and acknowledge the match officials' and other disciplinary bodies' decisions, and, should the need arise, respectfully seek the audience's attention.
- Never engage in undue public criticism of the match officials.
- Never engage in bullying, intimidation, or harassment towards any team player.
- I always speak about my teammates, the opponents, and the coach or manager. I shall not commit any doping offenses under the World Anti-Doping Agency (WADA) Code.
- Do not engage in, support, tolerate, or promote offensive, insulting, or abusive language, gestures, anti-social behavior, lewd acts, excessive drinking, prohibited substances, rule violations, rough play, or force any club member to participate in such activities towards any players, match officials, or spectators.
- Cooperate with coaches, managers, match officials, teammates, and opponents, and endeavor never to forget that we all make mistakes.
- Win or lose with dignity. Thank you, and shake hands with the opposing team and the referee at the end of every game.
I understand that if I do not follow this Code of Conduct, any or all of the following actions may be taken by SUOMEN PALLOLIITTO or The AFRO FOOT Club against me: I may be:
- Be required to apologize to teammates, the opposing team, the referee, or the team manager.
- Receive a warning from the coach.
- Receive a written warning from the club committee.
- Be dropped or substituted.
- Be suspended from training.
- Not selected for the upcoming team.
- Be required to serve a suspension.
- Be fined.
- In extreme circumstances, I may be required to leave the club indefinitely.
## IV. Code of conduct for spectators
As a Spectator, I will:
- Remember that children watch and play for FUN; let us set a good example for them and extend the same respect to them as we do to adults.
- I appreciate the effort, good play, and success of both teams.
- Respect the Referee's decisions even when I disagree with them.
- Remain behind the touchline and within the Designated Spectators' Area (where provided).
- Support positively: Let the coach and players do their jobs, and refrain from ridiculing or scolding them for mistakes, or from confusing players by telling them what to do.
- Respect and encourage the players to respect the opponents, coaches, referees, and match officials.
- I endeavor to understand the laws and rules of the game so I can better observe and comment on what I see.
- Never engage in or tolerate profane, offensive, insulting, or abusive language or behavior, or harass physically or verbally any players, managers, coaches, match officials, or other spectators.
I understand that if I do not follow this Code of Conduct, any or all of the following actions may be taken by SUOMEN PALLOLIITTO or The AFRO FOOT Club against me: I may be:
- Issued with a verbal warning from a club or league official.
- Required to meet with the club committee.
- Obligated to leave the match venue by the club.
- Requested by the club not to attend future games.
- I have had my club membership suspended or revoked.
- Required to leave the club.
## V. Code of conduct for coaches, team managers and club officials
As a Coach, Team Manager, and Club Official, I will:
- I will always use my position to set a positive example for the people I am responsible for and always consider their well-being and safety.
- Show respect to others involved in the game, including match officials, opponents' players, coaches, managers, officials, and spectators. Ensure that all activities are appropriate to the age, experience, and ability of those participating.
- Adhere to the laws and spirit of the game by consistently displaying high standards of behavior and by developing an appropriate working relationship with participants based on mutual respect and trust.
- Promote positive aspects of the sport, such as Fair Play and high standards of behavior.
- Respect the match official's decision and encourage participants to do the same. They should take responsibility for their performance and behavior and value overall performance rather than just results.
- Never enter the field of play without the referee's permission, and never exert undue influence over performers to obtain personal benefit or reward.
- Never engage in, condone, tolerate, or promote offensive, insulting, or abusive language, gestures, antisocial behavior, lewd acts, or excessive drinking, the use of prohibited substances, rule violations, or rough play, or force any club member to participate in such activities toward any or all players, match officials, or spectators.
- Be gracious in victory and defeat.
I understand that if I do not follow this Code of Conduct, any or all of the following actions may be taken by SUOMEN PALLOLIITTO or The AFRO FOOT Club against me: I may be:
- Suspended by the club from attending or officiating in any matches.
- Stripped of any decision-making abilities.
- Receive a written warning from the Club Committee.
- Suspended or fined by the SUOMEN PALLOLIITTO.
- In extreme circumstances, they may be required to leave the match venue or be sacked by the club.
## Afro Foot members' playbook
- Stay disciplined on the bench — only designated players handle changes and coaching.
- Take warm-ups seriously from the start.
- Always respect the referee, regardless of the result.
- Win, lose, or draw — we stand together.
- Maintain team image — everyone must behave appropriately at all times.
- Represent Afrofoot with pride on and off the pitch.
I hereby agree to these terms.$body$)
on conflict (version) do nothing;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.17.0','feature','Code of Conduct consent, player calendar and membership tabs',
  'Players read and agree to the club''s Code of Conduct in the app (per version); admins and coaches see who has not agreed. The player page has Calendar and Membership tabs.','2026-11-15')
on conflict (version) do nothing;
