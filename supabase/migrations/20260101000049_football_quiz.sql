-- 0049 Football quiz for players (release 0.37.0).
-- The player area has a 5-question quiz: 3 questions on the Laws of the Game from quiz_questions, and club questions made
-- from live data by quiz_club_facts() (top scorer of the last two seasons from Palloliitto, the highest league played,
-- the founding year). Questions are data, editable by admins, in en/fi/fr/ar (English is the fallback). Answers stay
-- in the player's browser: nothing about scores is stored.
-- The rule questions follow the IFAB Laws of the Game 2025/26; review them when the Laws change (each July).

create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  topic text not null default 'rules' check (topic in ('rules', 'club', 'football')),
  question jsonb not null check (jsonb_typeof(question) = 'object' and question ? 'en'),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  answer int not null,
  explain jsonb check (explain is null or (jsonb_typeof(explain) = 'object' and explain ? 'en')),
  source text check (char_length(source) <= 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (answer >= 0 and answer < jsonb_array_length(options))
);
alter table quiz_questions enable row level security;
create policy admin_all on quiz_questions for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy members_read on quiz_questions for select to authenticated using (active and app.is_active());
revoke all on quiz_questions from anon;
create trigger audit after insert or update or delete on quiz_questions for each row execute function app.audit();

-- o(en, fi, fr, ar): one option or text in four languages
create or replace function pg_temp.o(en text, fi text, fr text, ar text) returns jsonb language sql immutable as
$$ select jsonb_build_object('en', en, 'fi', fi, 'fr', fr, 'ar', ar) $$;

insert into quiz_questions (question, options, answer, explain, source) values
(pg_temp.o('When is a goal scored?', 'Milloin maali on syntynyt?', 'Quand un but est-il marqué ?', 'متى يُحتسب الهدف؟'),
 jsonb_build_array(
   pg_temp.o('When the whole ball has crossed the goal line', 'Kun koko pallo on ylittänyt maaliviivan', 'Quand le ballon a entièrement franchi la ligne de but', 'عندما تعبر الكرة بكاملها خط المرمى'),
   pg_temp.o('When most of the ball is over the line', 'Kun suurin osa pallosta on viivan yli', 'Quand la plus grande partie du ballon a franchi la ligne', 'عندما يتجاوز معظم الكرة الخط'),
   pg_temp.o('When the ball touches the goal line', 'Kun pallo koskettaa maaliviivaa', 'Quand le ballon touche la ligne de but', 'عندما تلمس الكرة خط المرمى'),
   pg_temp.o('When the goalkeeper is behind the line with the ball', 'Kun maalivahti on pallon kanssa viivan takana', 'Quand le gardien est derrière la ligne avec le ballon', 'عندما يكون الحارس خلف الخط ومعه الكرة')), 0,
 pg_temp.o('The whole ball must cross the goal line, between the posts and under the crossbar.', 'Koko pallon on ylitettävä maaliviiva tolppien välistä ja yläriman alta.', 'Le ballon doit franchir entièrement la ligne de but, entre les poteaux et sous la barre.', 'يجب أن تعبر الكرة بكاملها خط المرمى بين القائمين وتحت العارضة.'), 'IFAB Laws of the Game, Law 10'),

(pg_temp.o('Can a player be offside directly from a throw-in?', 'Voiko pelaaja olla paitsiossa suoraan rajaheitosta?', 'Un joueur peut-il être hors-jeu directement sur une rentrée de touche ?', 'هل يمكن أن يكون اللاعب متسللًا مباشرة من رمية تماس؟'),
 jsonb_build_array(
   pg_temp.o('No', 'Ei', 'Non', 'لا'),
   pg_temp.o('Yes, like from any pass', 'Kyllä, kuten mistä tahansa syötöstä', 'Oui, comme sur n’importe quelle passe', 'نعم، مثل أي تمريرة'),
   pg_temp.o('Only in the opponents'' half', 'Vain vastustajan kenttäpuoliskolla', 'Seulement dans la moitié adverse', 'فقط في نصف ملعب الخصم'),
   pg_temp.o('Only if the throw goes forward', 'Vain jos heitto menee eteenpäin', 'Seulement si la touche va vers l’avant', 'فقط إذا كانت الرمية إلى الأمام')), 0,
 pg_temp.o('There is no offside directly from a throw-in, a goal kick or a corner kick.', 'Paitsiota ei ole suoraan rajaheitosta, maalipotkusta eikä kulmapotkusta.', 'Il n’y a pas de hors-jeu directement sur une touche, un coup de pied de but ou un corner.', 'لا تسلل مباشرة من رمية التماس أو ضربة المرمى أو الضربة الركنية.'), 'IFAB Laws of the Game, Law 11'),

(pg_temp.o('The goalkeeper holds the ball in their hands for more than 8 seconds. What happens?', 'Maalivahti pitää palloa käsissään yli 8 sekuntia. Mitä tapahtuu?', 'Le gardien garde le ballon en main plus de 8 secondes. Que se passe-t-il ?', 'يمسك الحارس الكرة بيديه أكثر من 8 ثوانٍ. ماذا يحدث؟'),
 jsonb_build_array(
   pg_temp.o('A corner kick to the other team', 'Kulmapotku vastustajalle', 'Corner pour l’équipe adverse', 'ضربة ركنية للفريق الآخر'),
   pg_temp.o('An indirect free kick to the other team', 'Epäsuora vapaapotku vastustajalle', 'Coup franc indirect pour l’équipe adverse', 'ضربة حرة غير مباشرة للفريق الآخر'),
   pg_temp.o('A penalty kick', 'Rangaistuspotku', 'Penalty', 'ركلة جزاء'),
   pg_temp.o('Nothing, there is no time limit', 'Ei mitään, aikarajaa ei ole', 'Rien, il n’y a pas de limite', 'لا شيء، لا يوجد حد زمني')), 0,
 pg_temp.o('Since the 2025/26 Laws, holding the ball for more than 8 seconds gives the other team a corner kick; the referee counts the last 5 seconds with a raised hand.', 'Vuoden 2025/26 sääntöjen mukaan yli 8 sekunnin pitämisestä vastustaja saa kulmapotkun; tuomari laskee viimeiset 5 sekuntia käsi ylhäällä.', 'Depuis les Lois 2025/26, garder le ballon plus de 8 secondes donne un corner à l’adversaire ; l’arbitre compte les 5 dernières secondes main levée.', 'منذ قوانين 2025/26، الإمساك بالكرة أكثر من 8 ثوانٍ يمنح الخصم ضربة ركنية؛ ويعدّ الحكم الثواني الخمس الأخيرة بيده المرفوعة.'), 'IFAB Laws of the Game 2025/26, Law 12'),

(pg_temp.o('What is the fewest players a team can have for a match to start or go on?', 'Mikä on pienin pelaajamäärä, jolla ottelu voi alkaa tai jatkua?', 'Quel est le nombre minimum de joueurs pour qu’un match commence ou continue ?', 'ما أقل عدد من اللاعبين يمكن أن يبدأ به الفريق المباراة أو يستمر؟'),
 jsonb_build_array(pg_temp.o('7', '7', '7', '7'), pg_temp.o('6', '6', '6', '6'), pg_temp.o('8', '8', '8', '8'), pg_temp.o('9', '9', '9', '9')), 0,
 pg_temp.o('A match may not start or continue if either team has fewer than seven players.', 'Ottelu ei voi alkaa tai jatkua, jos joukkueella on alle seitsemän pelaajaa.', 'Un match ne peut pas commencer ou continuer si une équipe a moins de sept joueurs.', 'لا يمكن أن تبدأ المباراة أو تستمر إذا كان لدى أي فريق أقل من سبعة لاعبين.'), 'IFAB Laws of the Game, Law 3'),

(pg_temp.o('A player gets a second yellow card in the same match. What happens?', 'Pelaaja saa toisen keltaisen kortin samassa ottelussa. Mitä tapahtuu?', 'Un joueur reçoit un deuxième carton jaune dans le même match. Que se passe-t-il ?', 'يحصل لاعب على بطاقة صفراء ثانية في المباراة نفسها. ماذا يحدث؟'),
 jsonb_build_array(
   pg_temp.o('They are sent off (red card)', 'Hänet ajetaan ulos (punainen kortti)', 'Il est exclu (carton rouge)', 'يُطرد (بطاقة حمراء)'),
   pg_temp.o('They must sit out 10 minutes', 'Hänen on oltava 10 minuuttia vaihdossa', 'Il doit sortir 10 minutes', 'يجب أن يجلس 10 دقائق'),
   pg_temp.o('Nothing more, only a warning', 'Ei muuta, vain varoitus', 'Rien de plus, seulement un avertissement', 'لا شيء أكثر، مجرد إنذار'),
   pg_temp.o('The team must substitute them', 'Joukkueen on vaihdettava hänet', 'L’équipe doit le remplacer', 'يجب على الفريق استبداله')), 0,
 pg_temp.o('Two cautions in the same match mean a sending-off, and the team plays with one player less.', 'Kaksi varoitusta samassa ottelussa tarkoittaa ulosajoa, ja joukkue pelaa yhden pelaajan vajaalla.', 'Deux avertissements dans le même match valent une exclusion, et l’équipe joue à un de moins.', 'إنذاران في المباراة نفسها يعنيان الطرد، ويلعب الفريق بلاعب أقل.'), 'IFAB Laws of the Game, Law 12'),

(pg_temp.o('At a penalty kick, where must the goalkeeper be when the ball is kicked?', 'Missä maalivahdin on oltava, kun rangaistuspotku potkaistaan?', 'Lors d’un penalty, où doit être le gardien quand le ballon est frappé ?', 'عند تنفيذ ركلة الجزاء، أين يجب أن يكون الحارس لحظة ركل الكرة؟'),
 jsonb_build_array(
   pg_temp.o('With at least part of one foot on, or in line with, the goal line', 'Ainakin osa toisesta jalasta maaliviivalla tai sen tasalla', 'Au moins une partie d’un pied sur la ligne de but ou à son niveau', 'جزء من قدم واحدة على الأقل على خط المرمى أو بمحاذاته'),
   pg_temp.o('Anywhere in the goal area', 'Missä tahansa maalialueella', 'N’importe où dans la surface de but', 'في أي مكان داخل منطقة المرمى'),
   pg_temp.o('One step in front of the line', 'Askeleen viivan edessä', 'Un pas devant la ligne', 'خطوة واحدة أمام الخط'),
   pg_temp.o('Behind the goal line', 'Maaliviivan takana', 'Derrière la ligne de but', 'خلف خط المرمى')), 0,
 pg_temp.o('The goalkeeper may move along the line but must have at least part of one foot touching, or in line with, the goal line.', 'Maalivahti saa liikkua viivalla, mutta ainakin osan toisesta jalasta on kosketettava maaliviivaa tai oltava sen tasalla.', 'Le gardien peut se déplacer sur la ligne mais doit avoir au moins une partie d’un pied sur la ligne ou à son niveau.', 'يمكن للحارس التحرك على الخط لكن يجب أن يلمس جزء من قدم واحدة على الأقل خط المرمى أو يكون بمحاذاته.'), 'IFAB Laws of the Game, Law 14'),

(pg_temp.o('At a throw-in, what must the thrower do with their feet?', 'Mitä heittäjän on tehtävä jaloillaan rajaheitossa?', 'Sur une rentrée de touche, que doit faire le joueur avec ses pieds ?', 'عند رمية التماس، ماذا يجب أن يفعل الرامي بقدميه؟'),
 jsonb_build_array(
   pg_temp.o('Have part of each foot on the touchline or on the ground outside the field', 'Osan kummastakin jalasta on oltava sivurajalla tai maassa kentän ulkopuolella', 'Avoir une partie de chaque pied sur la ligne de touche ou au sol hors du terrain', 'أن يكون جزء من كل قدم على خط التماس أو على الأرض خارج الملعب'),
   pg_temp.o('Keep one foot in the air', 'Pitää toista jalkaa ilmassa', 'Garder un pied en l’air', 'أن يرفع قدمًا في الهواء'),
   pg_temp.o('Stand inside the field', 'Seistä kentän sisällä', 'Se tenir dans le terrain', 'أن يقف داخل الملعب'),
   pg_temp.o('Anything, feet do not matter', 'Mitä tahansa, jaloilla ei ole väliä', 'Peu importe, les pieds ne comptent pas', 'أي شيء، القدمان لا تهمّان')), 0,
 pg_temp.o('Both feet stay on the ground, with part of each foot on the touchline or outside it, and the ball is thrown with both hands from behind and over the head.', 'Molemmat jalat pysyvät maassa sivurajalla tai sen ulkopuolella, ja pallo heitetään molemmin käsin pään takaa ja yli.', 'Les deux pieds restent au sol, sur la ligne ou à l’extérieur, et le ballon est lancé à deux mains, de derrière et par-dessus la tête.', 'تبقى القدمان على الأرض على خط التماس أو خارجه، وتُرمى الكرة باليدين من خلف الرأس وفوقه.'), 'IFAB Laws of the Game, Law 15'),

(pg_temp.o('At a goal kick, when is the ball in play?', 'Milloin pallo on pelissä maalipotkussa?', 'Sur un coup de pied de but, quand le ballon est-il en jeu ?', 'في ضربة المرمى، متى تكون الكرة في اللعب؟'),
 jsonb_build_array(
   pg_temp.o('When it is kicked and clearly moves', 'Kun siihen potkaistaan ja se selvästi liikkuu', 'Dès qu’il est frappé et bouge nettement', 'عندما تُركل وتتحرك بوضوح'),
   pg_temp.o('Only when it leaves the penalty area', 'Vasta kun se on poistunut rangaistusalueelta', 'Seulement quand il sort de la surface de réparation', 'فقط عندما تخرج من منطقة الجزاء'),
   pg_temp.o('When it crosses the halfway line', 'Kun se ylittää keskiviivan', 'Quand il franchit la ligne médiane', 'عندما تعبر خط المنتصف'),
   pg_temp.o('When a second player touches it', 'Kun toinen pelaaja koskettaa sitä', 'Quand un deuxième joueur le touche', 'عندما يلمسها لاعب ثانٍ')), 0,
 pg_temp.o('The ball no longer has to leave the penalty area: it is in play as soon as it is kicked and clearly moves.', 'Pallon ei enää tarvitse poistua rangaistusalueelta: se on pelissä heti, kun siihen potkaistaan ja se selvästi liikkuu.', 'Le ballon n’a plus besoin de sortir de la surface : il est en jeu dès qu’il est frappé et bouge nettement.', 'لم يعد على الكرة أن تخرج من منطقة الجزاء: تكون في اللعب بمجرد ركلها وتحركها بوضوح.'), 'IFAB Laws of the Game, Law 16'),

(pg_temp.o('The defending team makes a wall of three or more players at a free kick. How close may attackers stand to it?', 'Puolustava joukkue tekee vapaapotkuun vähintään kolmen pelaajan muurin. Kuinka lähellä hyökkääjät saavat olla?', 'L’équipe qui défend forme un mur de trois joueurs ou plus sur un coup franc. À quelle distance les attaquants peuvent-ils se placer ?', 'يشكّل الفريق المدافع حائطًا من ثلاثة لاعبين أو أكثر في ضربة حرة. كم يمكن أن يقترب المهاجمون منه؟'),
 jsonb_build_array(
   pg_temp.o('No closer than 1 metre', 'Vähintään 1 metrin päässä', 'Pas à moins de 1 mètre', 'ليس أقرب من متر واحد'),
   pg_temp.o('Anywhere, even inside the wall', 'Missä tahansa, myös muurissa', 'N’importe où, même dans le mur', 'في أي مكان، حتى داخل الحائط'),
   pg_temp.o('At least 9.15 metres', 'Vähintään 9,15 metrin päässä', 'Au moins 9,15 mètres', '9.15 مترًا على الأقل'),
   pg_temp.o('At least 5 metres', 'Vähintään 5 metrin päässä', 'Au moins 5 mètres', '5 أمتار على الأقل')), 0,
 pg_temp.o('Attackers must stay at least 1 metre from a wall of three or more defenders until the ball is in play.', 'Hyökkääjien on pysyttävä vähintään metrin päässä vähintään kolmen puolustajan muurista, kunnes pallo on pelissä.', 'Les attaquants doivent rester à au moins 1 mètre d’un mur de trois défenseurs ou plus jusqu’à ce que le ballon soit en jeu.', 'يجب أن يبقى المهاجمون على بعد متر واحد على الأقل من حائط من ثلاثة مدافعين أو أكثر حتى تصبح الكرة في اللعب.'), 'IFAB Laws of the Game, Law 13'),

(pg_temp.o('The ball hits the referee and goes straight into the goal. What happens?', 'Pallo osuu tuomariin ja menee suoraan maaliin. Mitä tapahtuu?', 'Le ballon touche l’arbitre et entre directement dans le but. Que se passe-t-il ?', 'تصطدم الكرة بالحكم وتدخل المرمى مباشرة. ماذا يحدث؟'),
 jsonb_build_array(
   pg_temp.o('No goal: the game restarts with a dropped ball', 'Ei maalia: peli jatkuu pudotuspallolla', 'Pas de but : reprise par une balle à terre', 'لا هدف: يُستأنف اللعب بكرة ساقطة'),
   pg_temp.o('The goal counts', 'Maali hyväksytään', 'Le but est accordé', 'يُحتسب الهدف'),
   pg_temp.o('A goal kick', 'Maalipotku', 'Coup de pied de but', 'ضربة مرمى'),
   pg_temp.o('The kick is taken again', 'Potku uusitaan', 'On rejoue l’action', 'تُعاد الركلة')), 0,
 pg_temp.o('If the ball touches a match official and goes into the goal, the game restarts with a dropped ball.', 'Jos pallo koskettaa tuomaria ja menee maaliin, peli jatkuu pudotuspallolla.', 'Si le ballon touche un arbitre et entre dans le but, le jeu reprend par une balle à terre.', 'إذا لمست الكرة أحد الحكام ودخلت المرمى، يُستأنف اللعب بكرة ساقطة.'), 'IFAB Laws of the Game, Law 9'),

(pg_temp.o('An attacker scores right after the ball touched their arm by accident. Does the goal count?', 'Hyökkääjä tekee maalin heti, kun pallo osui vahingossa hänen käteensä. Hyväksytäänkö maali?', 'Un attaquant marque juste après que le ballon a touché son bras par accident. Le but compte-t-il ?', 'يسجّل مهاجم مباشرة بعد أن لمست الكرة ذراعه دون قصد. هل يُحتسب الهدف؟'),
 jsonb_build_array(
   pg_temp.o('No, the goal does not count', 'Ei, maalia ei hyväksytä', 'Non, le but n’est pas accordé', 'لا، لا يُحتسب الهدف'),
   pg_temp.o('Yes, because it was an accident', 'Kyllä, koska se oli vahinko', 'Oui, car c’était accidentel', 'نعم، لأنه كان دون قصد'),
   pg_temp.o('Yes, if the referee did not see it', 'Kyllä, jos tuomari ei nähnyt', 'Oui, si l’arbitre ne l’a pas vu', 'نعم، إذا لم يرَه الحكم'),
   pg_temp.o('Only if it was inside the goal area', 'Vain jos se tapahtui maalialueella', 'Seulement si c’était dans la surface de but', 'فقط إذا حدث داخل منطقة المرمى')), 0,
 pg_temp.o('A goal does not count if the scorer handled the ball, even by accident, immediately before scoring.', 'Maalia ei hyväksytä, jos maalintekijä koski palloa kädellä juuri ennen maalia, vaikka vahingossa.', 'Le but n’est pas accordé si le buteur a touché le ballon de la main, même accidentellement, juste avant de marquer.', 'لا يُحتسب الهدف إذا لمس المسجّل الكرة بيده، ولو دون قصد، مباشرة قبل التسجيل.'), 'IFAB Laws of the Game, Law 12'),

(pg_temp.o('Can a goal be scored directly from a kick-off?', 'Voiko maalin tehdä suoraan aloituspotkusta?', 'Peut-on marquer directement sur le coup d’envoi ?', 'هل يمكن تسجيل هدف مباشرة من ضربة البداية؟'),
 jsonb_build_array(
   pg_temp.o('Yes, against the opponents', 'Kyllä, vastustajan maaliin', 'Oui, contre l’adversaire', 'نعم، في مرمى الخصم'),
   pg_temp.o('No, never', 'Ei koskaan', 'Non, jamais', 'لا، أبدًا'),
   pg_temp.o('Only after the ball touches another player', 'Vasta kun pallo koskettaa toista pelaajaa', 'Seulement après une touche d’un autre joueur', 'فقط بعد أن تلمس الكرة لاعبًا آخر'),
   pg_temp.o('Only in the second half', 'Vain toisella puoliajalla', 'Seulement en deuxième mi-temps', 'فقط في الشوط الثاني')), 0,
 pg_temp.o('A goal may be scored directly against the opponents from the kick-off.', 'Aloituspotkusta voi tehdä maalin suoraan vastustajan maaliin.', 'Un but peut être marqué directement contre l’adversaire sur le coup d’envoi.', 'يمكن تسجيل هدف مباشرة في مرمى الخصم من ضربة البداية.'), 'IFAB Laws of the Game, Law 8');

-- ---------- club questions from live data ----------
-- Finnish men's leagues from the top: used to tell which league played was the highest.
-- Only for active members; names respect the website opt-out and the club's hide (0042).
create or replace function public.quiz_club_facts() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_latest int; v_scorers jsonb; v_leagues jsonb; v_founded int;
        ladder text[] := array['Veikkausliiga', 'Ykkösliiga', 'Ykkönen', 'Kakkonen', 'Kolmonen', 'Nelonen', 'Vitonen', 'Kutonen', 'Seiska'];
begin
  if not app.is_active() then raise exception 'members only' using errcode = '42501'; end if;
  select max(c.season) into v_latest from federation_competitions c join federation_player_stats s on s.competition_external_id = c.external_id
   where c.kind in ('league', 'cup') and c.show_publicly;
  select coalesce(jsonb_agg(jsonb_build_object('name', x.display_name, 'goals', x.goals) order by x.goals desc, x.display_name), '[]') into v_scorers from (
    select fp.display_name, sum(s.goals)::int as goals
    from federation_player_stats s
    join federation_competitions c on c.external_id = s.competition_external_id and c.kind in ('league', 'cup') and c.show_publicly and c.season >= v_latest - 1
    join federation_players fp on fp.external_id = s.player_external_id
    join federation_teams t on t.external_id = fp.team_external_id and t.is_club
    left join players p on p.id = fp.player_id
    where not fp.hidden and not coalesce(p.website_hidden, false)
    group by fp.external_id, fp.display_name having sum(s.goals) > 0
    order by goals desc, fp.display_name limit 6) x;
  select coalesce(jsonb_agg(distinct l.name), '[]') into v_leagues from (
    select n as name from federation_competitions c, unnest(ladder) n
    where c.kind = 'league' and c.category ilike '%' || n || '%') l;
  select (value ->> 'founded')::int into v_founded from site_settings where key = 'club';
  return jsonb_build_object('scorers', v_scorers, 'seasons', case when v_latest is null then null else jsonb_build_array(v_latest - 1, v_latest) end,
    'leagues', v_leagues, 'ladder', to_jsonb(ladder), 'founded', v_founded);
end $$;
revoke all on function public.quiz_club_facts() from public, anon;
grant execute on function public.quiz_club_facts() to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.37.0','feature','Football quiz',
  'Players find a 5-question football quiz in their area: the Laws of the Game, and questions about the club from live data (top scorer of the last two seasons, highest league, founding year).','2026-11-18')
on conflict (version) do nothing;
