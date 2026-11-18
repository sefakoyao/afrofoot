-- 0050 More quiz questions and club facts (release 0.38.0).
-- 21 more Laws of the Game questions (IFAB Laws 2025/26), and quiz_club_facts() gains more live club data for questions:
-- the biggest win of the last two seasons (and other recent opponents), the current league position, the first season in
-- the Palloliitto league results, and the number of Finnish Cup seasons. Admins manage all questions in Admin → Quiz.
-- Lengths of the texts are now checked too (each language).

create or replace function app.quiz_texts_ok(p jsonb, p_max int) returns boolean language sql immutable as
$$ select p is null or (jsonb_typeof(p) = 'object' and not exists (select 1 from jsonb_each_text(p) e where e.key not in ('en', 'fi', 'fr', 'ar') or char_length(e.value) > p_max)) $$;
create or replace function app.quiz_options_ok(p jsonb) returns boolean language sql immutable as
$$ select not exists (select 1 from jsonb_array_elements(p) o where jsonb_typeof(o) <> 'object' or not (o ? 'en') or not app.quiz_texts_ok(o, 150)) $$;
alter table quiz_questions
  add constraint quiz_question_texts check (app.quiz_texts_ok(question, 300) and char_length(question ->> 'en') > 0),
  add constraint quiz_option_texts check (app.quiz_options_ok(options)),
  add constraint quiz_explain_texts check (app.quiz_texts_ok(explain, 600));

create or replace function pg_temp.o(en text, fi text, fr text, ar text) returns jsonb language sql immutable as
$$ select jsonb_build_object('en', en, 'fi', fi, 'fr', fr, 'ar', ar) $$;
create or replace function pg_temp.q(q jsonb, a jsonb, b jsonb, c jsonb, d jsonb, x jsonb, src text) returns void language sql as
$$ insert into quiz_questions (question, options, answer, explain, source) values (q, jsonb_build_array(a, b, c, d), 0, x, src) $$;

select pg_temp.q(pg_temp.o('A throw-in goes straight into the thrower''s own goal. What is the restart?', 'Rajaheitto menee suoraan heittäjän omaan maaliin. Miten peli jatkuu?', 'Une touche entre directement dans le but de l’équipe qui l’effectue. Quelle reprise ?', 'دخلت رمية تماس مباشرة مرمى فريق الرامي. كيف يُستأنف اللعب؟'),
  pg_temp.o('A corner kick to the opponents', 'Kulmapotku vastustajalle', 'Corner pour l’adversaire', 'ضربة ركنية للخصم'),
  pg_temp.o('An own goal', 'Oma maali', 'Un but contre son camp', 'هدف في المرمى الخاص'),
  pg_temp.o('A goal kick', 'Maalipotku', 'Coup de pied de but', 'ضربة مرمى'),
  pg_temp.o('The throw-in is retaken', 'Rajaheitto uusitaan', 'La touche est rejouée', 'تُعاد الرمية'),
  pg_temp.o('A goal cannot be scored directly from a throw-in: if it enters the thrower''s own goal, the opponents get a corner kick.', 'Rajaheitosta ei voi tehdä maalia suoraan: jos pallo menee heittäjän omaan maaliin, vastustaja saa kulmapotkun.', 'On ne peut pas marquer directement sur une touche : si le ballon entre dans le but de l’équipe qui l’effectue, l’adversaire obtient un corner.', 'لا يمكن التسجيل مباشرة من رمية تماس: إذا دخلت الكرة مرمى فريق الرامي يحصل الخصم على ضربة ركنية.'), 'IFAB Laws of the Game, Law 15');

select pg_temp.q(pg_temp.o('A throw-in goes straight into the opponents'' goal. What is the restart?', 'Rajaheitto menee suoraan vastustajan maaliin. Miten peli jatkuu?', 'Une touche entre directement dans le but adverse. Quelle reprise ?', 'دخلت رمية تماس مباشرة مرمى الخصم. كيف يُستأنف اللعب؟'),
  pg_temp.o('A goal kick', 'Maalipotku', 'Coup de pied de but', 'ضربة مرمى'),
  pg_temp.o('A goal', 'Maali', 'Un but', 'هدف'),
  pg_temp.o('A corner kick', 'Kulmapotku', 'Corner', 'ضربة ركنية'),
  pg_temp.o('A dropped ball', 'Pudotuspallo', 'Balle à terre', 'كرة ساقطة'),
  pg_temp.o('A throw-in cannot score directly: if it goes straight into the opponents'' goal, they restart with a goal kick.', 'Rajaheitosta ei voi tehdä maalia suoraan: jos pallo menee suoraan vastustajan maaliin, peli jatkuu maalipotkulla.', 'Une touche ne peut pas marquer directement : si le ballon entre directement dans le but adverse, la reprise est un coup de pied de but.', 'لا يمكن التسجيل مباشرة من رمية تماس: إذا دخلت الكرة مرمى الخصم مباشرة يُستأنف اللعب بضربة مرمى.'), 'IFAB Laws of the Game, Law 15');

select pg_temp.q(pg_temp.o('How far is the penalty mark from the goal line?', 'Kuinka kaukana rangaistuspotkupiste on maaliviivasta?', 'À quelle distance de la ligne de but se trouve le point de penalty ?', 'كم تبعد علامة الجزاء عن خط المرمى؟'),
  pg_temp.o('11 metres', '11 metriä', '11 mètres', '11 مترًا'), pg_temp.o('9.15 metres', '9,15 metriä', '9,15 mètres', '9.15 مترًا'),
  pg_temp.o('12 metres', '12 metriä', '12 mètres', '12 مترًا'), pg_temp.o('16.5 metres', '16,5 metriä', '16,5 mètres', '16.5 مترًا'),
  pg_temp.o('The penalty mark is 11 m (12 yards) from the middle of the goal line.', 'Rangaistuspotkupiste on 11 metrin päässä maaliviivan keskeltä.', 'Le point de penalty est à 11 m du milieu de la ligne de but.', 'علامة الجزاء على بعد 11 مترًا من منتصف خط المرمى.'), 'IFAB Laws of the Game, Law 1');

select pg_temp.q(pg_temp.o('How wide is a full-size goal, between the inside of the posts?', 'Kuinka leveä täysikokoinen maali on tolppien sisäreunojen välillä?', 'Quelle est la largeur d’un but de taille normale, entre l’intérieur des poteaux ?', 'ما عرض المرمى القانوني بين الجانبين الداخليين للقائمين؟'),
  pg_temp.o('7.32 metres', '7,32 metriä', '7,32 mètres', '7.32 أمتار'), pg_temp.o('7 metres', '7 metriä', '7 mètres', '7 أمتار'),
  pg_temp.o('8 metres', '8 metriä', '8 mètres', '8 أمتار'), pg_temp.o('6.5 metres', '6,5 metriä', '6,5 mètres', '6.5 أمتار'),
  pg_temp.o('The goal is 7.32 m wide and the crossbar 2.44 m high (8 yards by 8 feet).', 'Maali on 7,32 m leveä ja ylärima 2,44 m korkealla.', 'Le but mesure 7,32 m de large et la barre est à 2,44 m de haut.', 'عرض المرمى 7.32 م وارتفاع العارضة 2.44 م.'), 'IFAB Laws of the Game, Law 1');

select pg_temp.q(pg_temp.o('At a free kick (with no wall rule involved), how far must opponents be from the ball?', 'Kuinka kaukana vastustajien on oltava pallosta vapaapotkussa?', 'Sur un coup franc, à quelle distance du ballon les adversaires doivent-ils être ?', 'في الضربة الحرة، على أي بعد يجب أن يكون الخصوم من الكرة؟'),
  pg_temp.o('At least 9.15 metres', 'Vähintään 9,15 metriä', 'Au moins 9,15 mètres', '9.15 مترًا على الأقل'), pg_temp.o('At least 5 metres', 'Vähintään 5 metriä', 'Au moins 5 mètres', '5 أمتار على الأقل'),
  pg_temp.o('At least 11 metres', 'Vähintään 11 metriä', 'Au moins 11 mètres', '11 مترًا على الأقل'), pg_temp.o('There is no distance', 'Etäisyyttä ei ole', 'Aucune distance', 'لا توجد مسافة'),
  pg_temp.o('Opponents must be at least 9.15 m (10 yards) from the ball until it is in play, unless they are on their own goal line between the posts.', 'Vastustajien on oltava vähintään 9,15 m päässä, kunnes pallo on pelissä, ellei heitä ole omalla maaliviivalla tolppien välissä.', 'Les adversaires doivent être à au moins 9,15 m jusqu’à ce que le ballon soit en jeu, sauf s’ils sont sur leur ligne de but entre les poteaux.', 'يجب أن يبتعد الخصوم 9.15 مترًا على الأقل حتى تصبح الكرة في اللعب، إلا إذا كانوا على خط مرماهم بين القائمين.'), 'IFAB Laws of the Game, Law 13');

select pg_temp.q(pg_temp.o('An indirect free kick goes straight into the opponents'' goal without touching anyone. What happens?', 'Epäsuora vapaapotku menee suoraan vastustajan maaliin koskematta ketään. Mitä tapahtuu?', 'Un coup franc indirect entre directement dans le but adverse sans toucher personne. Que se passe-t-il ?', 'دخلت ضربة حرة غير مباشرة مرمى الخصم دون أن تلمس أحدًا. ماذا يحدث؟'),
  pg_temp.o('No goal: a goal kick', 'Ei maalia: maalipotku', 'Pas de but : coup de pied de but', 'لا هدف: ضربة مرمى'), pg_temp.o('The goal counts', 'Maali hyväksytään', 'Le but est accordé', 'يُحتسب الهدف'),
  pg_temp.o('A corner kick', 'Kulmapotku', 'Corner', 'ضربة ركنية'), pg_temp.o('The kick is retaken', 'Potku uusitaan', 'Le coup franc est rejoué', 'تُعاد الضربة'),
  pg_temp.o('From an indirect free kick a goal counts only if the ball touched another player first; straight into the opponents'' goal gives a goal kick.', 'Epäsuorasta vapaapotkusta maali hyväksytään vain, jos pallo koski ensin toista pelaajaa; suoraan vastustajan maaliin tarkoittaa maalipotkua.', 'Sur un coup franc indirect, le but compte seulement si le ballon a touché un autre joueur ; directement dans le but adverse, c’est un coup de pied de but.', 'من الضربة الحرة غير المباشرة يُحتسب الهدف فقط إذا لمست الكرة لاعبًا آخر أولًا؛ وإن دخلت مرمى الخصم مباشرة تُحتسب ضربة مرمى.'), 'IFAB Laws of the Game, Law 13');

select pg_temp.q(pg_temp.o('A foul is committed but the fouled team keeps a good attack going. What can the referee do?', 'Tehdään rike, mutta rikotun joukkueen hyökkäys jatkuu hyvänä. Mitä tuomari voi tehdä?', 'Une faute est commise mais l’équipe fautée garde une bonne attaque. Que peut faire l’arbitre ?', 'تُرتكب مخالفة لكن الفريق المتضرر يواصل هجمة جيدة. ماذا يمكن أن يفعل الحكم؟'),
  pg_temp.o('Play advantage and let the game go on', 'Antaa edun ja antaa pelin jatkua', 'Laisser l’avantage et laisser jouer', 'يطبّق قاعدة الأفضلية ويترك اللعب مستمرًا'), pg_temp.o('The referee must always stop play', 'Hänen on aina pysäytettävä peli', 'L’arbitre doit toujours arrêter le jeu', 'يجب أن يوقف اللعب دائمًا'),
  pg_temp.o('Give a penalty kick', 'Tuomita rangaistuspotkun', 'Accorder un penalty', 'يحتسب ركلة جزاء'), pg_temp.o('Restart with a dropped ball', 'Jatkaa pudotuspallolla', 'Reprendre par une balle à terre', 'يستأنف بكرة ساقطة'),
  pg_temp.o('The referee may let play continue when stopping it would not help the team that was fouled (advantage), and can still caution the player afterwards.', 'Tuomari voi antaa pelin jatkua, kun keskeytys ei hyödyttäisi rikottua joukkuetta (etu), ja voi silti varoittaa pelaajaa myöhemmin.', 'L’arbitre peut laisser jouer quand un arrêt ne profiterait pas à l’équipe fautée (avantage) et peut ensuite avertir le joueur.', 'يمكن للحكم ترك اللعب مستمرًا عندما لا يفيد إيقافه الفريق المتضرر (الأفضلية)، ويمكنه إنذار اللاعب لاحقًا.'), 'IFAB Laws of the Game, Law 5');

select pg_temp.q(pg_temp.o('A defender (not the goalkeeper) stops an obvious goal with a deliberate handball. What is the sanction?', 'Puolustaja (ei maalivahti) estää varman maalin tahallisella käsivirheellä. Mikä on rangaistus?', 'Un défenseur (pas le gardien) empêche un but évident par une main volontaire. Quelle sanction ?', 'مدافع (ليس الحارس) يمنع هدفًا محققًا بلمسة يد متعمدة. ما العقوبة؟'),
  pg_temp.o('Sending-off (red card)', 'Ulosajo (punainen kortti)', 'Exclusion (carton rouge)', 'الطرد (بطاقة حمراء)'), pg_temp.o('Caution (yellow card)', 'Varoitus (keltainen kortti)', 'Avertissement (carton jaune)', 'إنذار (بطاقة صفراء)'),
  pg_temp.o('No card, only the free kick', 'Ei korttia, vain vapaapotku', 'Pas de carton, seulement le coup franc', 'لا بطاقة، فقط الضربة الحرة'), pg_temp.o('A 10-minute time-out', '10 minuutin jäähy', 'Une exclusion de 10 minutes', 'إيقاف 10 دقائق'),
  pg_temp.o('Denying the opponents a goal or an obvious goal-scoring opportunity by a deliberate handball is a sending-off offence.', 'Maalin tai selvän maalintekotilanteen estäminen tahallisella käsivirheellä johtaa ulosajoon.', 'Empêcher un but ou une occasion de but manifeste par une main volontaire est passible d’exclusion.', 'منع هدف أو فرصة تسجيل محققة بلمسة يد متعمدة يستوجب الطرد.'), 'IFAB Laws of the Game, Law 12');

select pg_temp.q(pg_temp.o('The penalty taker plays the ball a second time before anyone else touches it. What happens?', 'Rangaistuspotkun laukoja koskettaa palloa toisen kerran ennen muita. Mitä tapahtuu?', 'Le tireur du penalty touche le ballon une deuxième fois avant tout autre joueur. Que se passe-t-il ?', 'يلمس منفذ ركلة الجزاء الكرة مرة ثانية قبل أن يلمسها أحد آخر. ماذا يحدث؟'),
  pg_temp.o('An indirect free kick to the defending team', 'Epäsuora vapaapotku puolustavalle joukkueelle', 'Coup franc indirect pour l’équipe qui défend', 'ضربة حرة غير مباشرة للفريق المدافع'), pg_temp.o('The goal counts if it goes in', 'Maali hyväksytään, jos pallo menee sisään', 'Le but compte s’il entre', 'يُحتسب الهدف إن دخلت الكرة'),
  pg_temp.o('The penalty is retaken', 'Rangaistuspotku uusitaan', 'Le penalty est retiré', 'تُعاد ركلة الجزاء'), pg_temp.o('A corner kick', 'Kulmapotku', 'Corner', 'ضربة ركنية'),
  pg_temp.o('The kicker may not touch the ball again until another player has: the defending team gets an indirect free kick.', 'Potkaisija ei saa koskea palloon uudelleen ennen kuin joku muu on koskenut: puolustava joukkue saa epäsuoran vapaapotkun.', 'Le tireur ne peut pas retoucher le ballon avant un autre joueur : coup franc indirect pour l’équipe qui défend.', 'لا يجوز للمنفذ لمس الكرة مجددًا قبل أن يلمسها لاعب آخر: ضربة حرة غير مباشرة للفريق المدافع.'), 'IFAB Laws of the Game, Law 14');

select pg_temp.q(pg_temp.o('A player leaves the field without the referee''s permission. What does the referee give?', 'Pelaaja poistuu kentältä ilman tuomarin lupaa. Mitä tuomari antaa?', 'Un joueur quitte le terrain sans la permission de l’arbitre. Que donne l’arbitre ?', 'يغادر لاعب الملعب دون إذن الحكم. ماذا يمنح الحكم؟'),
  pg_temp.o('A yellow card', 'Keltaisen kortin', 'Un carton jaune', 'بطاقة صفراء'), pg_temp.o('A red card', 'Punaisen kortin', 'Un carton rouge', 'بطاقة حمراء'),
  pg_temp.o('Nothing', 'Ei mitään', 'Rien', 'لا شيء'), pg_temp.o('A penalty to the other team', 'Rangaistuspotkun vastustajalle', 'Un penalty à l’adversaire', 'ركلة جزاء للفريق الآخر'),
  pg_temp.o('Deliberately leaving the field without the referee''s permission is a cautionable offence.', 'Kentältä poistuminen tarkoituksella ilman tuomarin lupaa on varoitukseen johtava rike.', 'Quitter délibérément le terrain sans la permission de l’arbitre est passible d’un avertissement.', 'مغادرة الملعب عمدًا دون إذن الحكم مخالفة تستوجب الإنذار.'), 'IFAB Laws of the Game, Law 12');

select pg_temp.q(pg_temp.o('A teammate deliberately kicks the ball back to the goalkeeper, who picks it up. What happens?', 'Joukkuetoveri potkaisee pallon tarkoituksella maalivahdille, joka ottaa sen käsiinsä. Mitä tapahtuu?', 'Un coéquipier passe volontairement le ballon au pied à son gardien, qui le prend à la main. Que se passe-t-il ?', 'يمرّر زميل الكرة عمدًا بقدمه إلى الحارس فيمسكها بيديه. ماذا يحدث؟'),
  pg_temp.o('An indirect free kick to the opponents', 'Epäsuora vapaapotku vastustajalle', 'Coup franc indirect pour l’adversaire', 'ضربة حرة غير مباشرة للخصم'), pg_temp.o('A penalty kick', 'Rangaistuspotku', 'Penalty', 'ركلة جزاء'),
  pg_temp.o('Nothing, it is allowed', 'Ei mitään, se on sallittua', 'Rien, c’est permis', 'لا شيء، هذا مسموح'), pg_temp.o('A direct free kick to the opponents', 'Suora vapaapotku vastustajalle', 'Coup franc direct pour l’adversaire', 'ضربة حرة مباشرة للخصم'),
  pg_temp.o('The goalkeeper may not handle a ball deliberately kicked to them by a teammate: indirect free kick to the opponents.', 'Maalivahti ei saa ottaa käsiinsä palloa, jonka joukkuetoveri on tarkoituksella potkaissut hänelle: epäsuora vapaapotku vastustajalle.', 'Le gardien ne peut pas prendre à la main un ballon que lui a volontairement passé un coéquipier au pied : coup franc indirect pour l’adversaire.', 'لا يجوز للحارس لمس كرة مرّرها له زميله عمدًا بالقدم: ضربة حرة غير مباشرة للخصم.'), 'IFAB Laws of the Game, Law 12');

select pg_temp.q(pg_temp.o('An attacker is level with the second-last defender when the ball is passed. Offside?', 'Hyökkääjä on samalla tasolla toiseksi viimeisen puolustajan kanssa, kun pallo syötetään. Paitsio?', 'Un attaquant est à la même hauteur que l’avant-dernier défenseur au moment de la passe. Hors-jeu ?', 'المهاجم على مستوى المدافع قبل الأخير لحظة التمرير. هل هو متسلل؟'),
  pg_temp.o('No, level is onside', 'Ei, samalla tasolla ei ole paitsiota', 'Non, à la même hauteur n’est pas hors-jeu', 'لا، المستوى نفسه ليس تسللًا'), pg_temp.o('Yes, always', 'Kyllä, aina', 'Oui, toujours', 'نعم، دائمًا'),
  pg_temp.o('Only in the penalty area', 'Vain rangaistusalueella', 'Seulement dans la surface', 'فقط في منطقة الجزاء'), pg_temp.o('The referee decides freely', 'Tuomari päättää vapaasti', 'L’arbitre décide librement', 'الحكم يقرر بحرية'),
  pg_temp.o('A player level with the second-last opponent (or the last two) is not in an offside position.', 'Pelaaja, joka on samalla tasolla toiseksi viimeisen vastustajan kanssa, ei ole paitsioasemassa.', 'Un joueur à la même hauteur que l’avant-dernier adversaire n’est pas en position de hors-jeu.', 'اللاعب الذي يكون على مستوى الخصم قبل الأخير ليس في موقف تسلل.'), 'IFAB Laws of the Game, Law 11');

select pg_temp.q(pg_temp.o('A player is in their own half when the ball is played to them. Can they be offside?', 'Pelaaja on omalla kenttäpuoliskollaan, kun hänelle syötetään. Voiko hän olla paitsiossa?', 'Un joueur est dans sa propre moitié quand on lui passe le ballon. Peut-il être hors-jeu ?', 'اللاعب في نصف ملعبه لحظة تمرير الكرة إليه. هل يمكن أن يكون متسللًا؟'),
  pg_temp.o('No', 'Ei', 'Non', 'لا'), pg_temp.o('Yes', 'Kyllä', 'Oui', 'نعم'),
  pg_temp.o('Only if behind all defenders', 'Vain jos hän on kaikkien puolustajien takana', 'Seulement derrière tous les défenseurs', 'فقط إذا كان خلف كل المدافعين'), pg_temp.o('Only from a free kick', 'Vain vapaapotkusta', 'Seulement sur coup franc', 'فقط من ضربة حرة'),
  pg_temp.o('A player cannot be in an offside position in their own half of the field.', 'Pelaaja ei voi olla paitsioasemassa omalla kenttäpuoliskollaan.', 'Un joueur ne peut pas être en position de hors-jeu dans sa propre moitié de terrain.', 'لا يمكن أن يكون اللاعب في موقف تسلل في نصف ملعبه.'), 'IFAB Laws of the Game, Law 11');

select pg_temp.q(pg_temp.o('Can a goal be scored directly from a corner kick?', 'Voiko kulmapotkusta tehdä maalin suoraan?', 'Peut-on marquer directement sur corner ?', 'هل يمكن تسجيل هدف مباشرة من ضربة ركنية؟'),
  pg_temp.o('Yes, against the opponents', 'Kyllä, vastustajan maaliin', 'Oui, contre l’adversaire', 'نعم، في مرمى الخصم'), pg_temp.o('No, never', 'Ei koskaan', 'Non, jamais', 'لا، أبدًا'),
  pg_temp.o('Only with a header', 'Vain puskulla', 'Seulement de la tête', 'فقط بضربة رأس'), pg_temp.o('Only if the goalkeeper touches it', 'Vain jos maalivahti koskettaa', 'Seulement si le gardien le touche', 'فقط إذا لمسها الحارس'),
  pg_temp.o('A goal may be scored directly from a corner kick, but only against the opponents.', 'Kulmapotkusta voi tehdä maalin suoraan, mutta vain vastustajan maaliin.', 'On peut marquer directement sur corner, mais seulement contre l’adversaire.', 'يمكن التسجيل مباشرة من ضربة ركنية، لكن في مرمى الخصم فقط.'), 'IFAB Laws of the Game, Law 17');

select pg_temp.q(pg_temp.o('A goal kick goes straight into the kicker''s own goal. What is the restart?', 'Maalipotku menee suoraan potkaisijan omaan maaliin. Miten peli jatkuu?', 'Un coup de pied de but entre directement dans le but de l’équipe qui le joue. Quelle reprise ?', 'دخلت ضربة المرمى مباشرة مرمى الفريق المنفذ. كيف يُستأنف اللعب؟'),
  pg_temp.o('A corner kick to the opponents', 'Kulmapotku vastustajalle', 'Corner pour l’adversaire', 'ضربة ركنية للخصم'), pg_temp.o('An own goal', 'Oma maali', 'But contre son camp', 'هدف في المرمى الخاص'),
  pg_temp.o('The goal kick is retaken', 'Maalipotku uusitaan', 'Le coup de pied de but est rejoué', 'تُعاد ضربة المرمى'), pg_temp.o('A penalty kick', 'Rangaistuspotku', 'Penalty', 'ركلة جزاء'),
  pg_temp.o('No own goal can be scored directly from a goal kick: if it enters the kicker''s goal, the opponents get a corner kick.', 'Maalipotkusta ei voi syntyä omaa maalia suoraan: jos pallo menee potkaisijan maaliin, vastustaja saa kulmapotkun.', 'Pas de but contre son camp directement sur un coup de pied de but : l’adversaire obtient un corner.', 'لا يُحتسب هدف في المرمى الخاص مباشرة من ضربة المرمى: يحصل الخصم على ضربة ركنية.'), 'IFAB Laws of the Game, Law 16');

select pg_temp.q(pg_temp.o('Play is stopped for an injury while the ball is in the defending team''s penalty area. Who gets the dropped ball?', 'Peli keskeytetään loukkaantumisen takia pallon ollessa puolustavan joukkueen rangaistusalueella. Kuka saa pudotuspallon?', 'Le jeu est arrêté pour une blessure alors que le ballon est dans la surface de l’équipe qui défend. Qui reçoit la balle à terre ?', 'أوقف اللعب لإصابة والكرة داخل منطقة جزاء الفريق المدافع. لمن تكون الكرة الساقطة؟'),
  pg_temp.o('The defending goalkeeper', 'Puolustavan joukkueen maalivahti', 'Le gardien de l’équipe qui défend', 'حارس الفريق المدافع'), pg_temp.o('The attacking team', 'Hyökkäävä joukkue', 'L’équipe qui attaque', 'الفريق المهاجم'),
  pg_temp.o('Both teams contest it', 'Molemmat joukkueet kamppailevat', 'Les deux équipes se la disputent', 'يتنافس عليها الفريقان'), pg_temp.o('The team that is behind in the score', 'Tappiolla oleva joukkue', 'L’équipe menée au score', 'الفريق المتأخر في النتيجة'),
  pg_temp.o('In the penalty area the ball is dropped for the defending goalkeeper; elsewhere for the team that last touched it.', 'Rangaistusalueella pallo pudotetaan puolustavan joukkueen maalivahdille, muualla joukkueelle, joka viimeksi kosketti palloa.', 'Dans la surface, la balle est donnée au gardien qui défend ; ailleurs, à l’équipe qui l’a touchée en dernier.', 'داخل منطقة الجزاء تُسقط الكرة لحارس الفريق المدافع، وفي غيرها للفريق الذي لمسها آخر مرة.'), 'IFAB Laws of the Game, Law 8');

select pg_temp.q(pg_temp.o('A player spits at an opponent. What is the sanction?', 'Pelaaja sylkee vastustajaa kohti. Mikä on rangaistus?', 'Un joueur crache sur un adversaire. Quelle sanction ?', 'لاعب يبصق على خصم. ما العقوبة؟'),
  pg_temp.o('Sending-off (red card)', 'Ulosajo (punainen kortti)', 'Exclusion (carton rouge)', 'الطرد (بطاقة حمراء)'), pg_temp.o('Caution (yellow card)', 'Varoitus (keltainen kortti)', 'Avertissement (carton jaune)', 'إنذار (بطاقة صفراء)'),
  pg_temp.o('Only a free kick', 'Vain vapaapotku', 'Seulement un coup franc', 'ضربة حرة فقط'), pg_temp.o('A warning without a card', 'Huomautus ilman korttia', 'Un rappel à l’ordre sans carton', 'تنبيه دون بطاقة'),
  pg_temp.o('Spitting at someone is a sending-off offence.', 'Sylkeminen toista kohti johtaa ulosajoon.', 'Cracher sur quelqu’un est passible d’exclusion.', 'البصق على أي شخص مخالفة تستوجب الطرد.'), 'IFAB Laws of the Game, Law 12');

select pg_temp.q(pg_temp.o('Who decides how much time is added at the end of each half?', 'Kuka päättää, kuinka paljon lisäaikaa kummankin puoliajan lopussa pelataan?', 'Qui décide du temps additionnel à la fin de chaque mi-temps ?', 'من يقرر الوقت المضاف في نهاية كل شوط؟'),
  pg_temp.o('The referee', 'Päätuomari', 'L’arbitre', 'الحكم'), pg_temp.o('The two captains', 'Joukkueiden kapteenit', 'Les deux capitaines', 'القائدان'),
  pg_temp.o('The home team', 'Kotijoukkue', 'L’équipe qui reçoit', 'الفريق المضيف'), pg_temp.o('It is always 3 minutes', 'Se on aina 3 minuuttia', 'C’est toujours 3 minutes', 'دائمًا 3 دقائق'),
  pg_temp.o('The referee adds time for substitutions, injuries, time-wasting and other stoppages.', 'Tuomari lisää aikaa vaihdoista, loukkaantumisista, ajan haaskaamisesta ja muista keskeytyksistä.', 'L’arbitre ajoute le temps perdu : remplacements, blessures, gain de temps et autres arrêts.', 'يضيف الحكم الوقت الضائع بسبب التبديلات والإصابات وإضاعة الوقت وغيرها.'), 'IFAB Laws of the Game, Law 7');

select pg_temp.q(pg_temp.o('A player takes off their shirt to celebrate a goal. What happens?', 'Pelaaja riisuu paitansa maalia juhliessaan. Mitä tapahtuu?', 'Un joueur enlève son maillot pour célébrer un but. Que se passe-t-il ?', 'يخلع لاعب قميصه احتفالًا بهدف. ماذا يحدث؟'),
  pg_temp.o('A yellow card', 'Keltainen kortti', 'Un carton jaune', 'بطاقة صفراء'), pg_temp.o('The goal is cancelled', 'Maali hylätään', 'Le but est annulé', 'يُلغى الهدف'),
  pg_temp.o('A red card', 'Punainen kortti', 'Un carton rouge', 'بطاقة حمراء'), pg_temp.o('Nothing', 'Ei mitään', 'Rien', 'لا شيء'),
  pg_temp.o('Removing the shirt (or covering the head with it) when celebrating is a cautionable offence; the goal still counts.', 'Paidan riisuminen tai pään peittäminen sillä juhlinnassa johtaa varoitukseen; maali kuitenkin hyväksytään.', 'Enlever son maillot (ou s’en couvrir la tête) pour célébrer vaut un avertissement ; le but reste valable.', 'خلع القميص (أو تغطية الرأس به) عند الاحتفال يستوجب الإنذار؛ ويبقى الهدف صحيحًا.'), 'IFAB Laws of the Game, Law 12');

select pg_temp.q(pg_temp.o('How long is a normal adult match?', 'Kuinka pitkä on tavallinen aikuisten ottelu?', 'Quelle est la durée d’un match normal chez les adultes ?', 'كم مدة المباراة العادية للكبار؟'),
  pg_temp.o('Two halves of 45 minutes', 'Kaksi 45 minuutin puoliaikaa', 'Deux mi-temps de 45 minutes', 'شوطان مدة كل منهما 45 دقيقة'), pg_temp.o('Two halves of 40 minutes', 'Kaksi 40 minuutin puoliaikaa', 'Deux mi-temps de 40 minutes', 'شوطان مدة كل منهما 40 دقيقة'),
  pg_temp.o('Four quarters of 20 minutes', 'Neljä 20 minuutin neljännestä', 'Quatre quarts-temps de 20 minutes', 'أربعة أرباع مدة كل منها 20 دقيقة'), pg_temp.o('Two halves of 50 minutes', 'Kaksi 50 minuutin puoliaikaa', 'Deux mi-temps de 50 minutes', 'شوطان مدة كل منهما 50 دقيقة'),
  pg_temp.o('A match lasts two equal halves of 45 minutes, unless the competition rules agree otherwise.', 'Ottelu kestää kaksi 45 minuutin puoliaikaa, ellei kilpailumääräyksissä sovita toisin.', 'Un match dure deux mi-temps de 45 minutes, sauf accord différent du règlement de la compétition.', 'تتكون المباراة من شوطين متساويين مدة كل منهما 45 دقيقة، ما لم تنص لوائح المسابقة على غير ذلك.'), 'IFAB Laws of the Game, Law 7');

select pg_temp.q(pg_temp.o('What is the circumference of a size-5 match ball?', 'Mikä on koon 5 ottelupallon ympärysmitta?', 'Quelle est la circonférence d’un ballon de taille 5 ?', 'ما محيط كرة المباراة مقاس 5؟'),
  pg_temp.o('68–70 cm', '68–70 cm', '68–70 cm', '68–70 سم'), pg_temp.o('60–62 cm', '60–62 cm', '60–62 cm', '60–62 سم'),
  pg_temp.o('74–76 cm', '74–76 cm', '74–76 cm', '74–76 سم'), pg_temp.o('80–82 cm', '80–82 cm', '80–82 cm', '80–82 سم'),
  pg_temp.o('The ball is spherical, with a circumference of 68–70 cm (27–28 in).', 'Pallo on pyöreä ja sen ympärysmitta on 68–70 cm.', 'Le ballon est sphérique, d’une circonférence de 68 à 70 cm.', 'الكرة كروية ومحيطها بين 68 و70 سم.'), 'IFAB Laws of the Game, Law 2');

-- ---------- more club facts ----------
create or replace function public.quiz_club_facts() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_latest int; v_scorers jsonb; v_leagues jsonb; v_founded int; v_win jsonb; v_opponents jsonb; v_position jsonb; v_first int; v_cups int;
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
    select n as name from federation_competitions c, unnest(ladder) n where c.kind = 'league' and c.category ilike '%' || n || '%') l;
  select (value ->> 'founded')::int into v_founded from site_settings where key = 'club';
  -- the club's games of the last two seasons (league and cup), from the club's side
  with g as (
    select c.season, case when h.is_club then m.away_name else m.home_name end as opponent,
           case when h.is_club then m.home_goals else m.away_goals end as gf, case when h.is_club then m.away_goals else m.home_goals end as ga, m.kickoff_at
    from federation_matches m
    join federation_competitions c on c.external_id = m.competition_external_id and c.kind in ('league', 'cup') and c.show_publicly
    left join federation_teams h on h.external_id = m.home_external_id
    left join federation_teams a on a.external_id = m.away_external_id
    where m.status = 'played' and m.home_goals is not null and (coalesce(h.is_club, false) <> coalesce(a.is_club, false))
      and c.season >= (select max(season) from federation_competitions where kind = 'league') - 1
  )
  select (select to_jsonb(w) from (select opponent, gf, ga, season from g where gf > ga order by gf - ga desc, gf desc, kickoff_at desc limit 1) w
           where (select count(*) from g where gf - ga = w.gf - w.ga and gf = w.gf) = 1),
         (select coalesce(jsonb_agg(distinct opponent), '[]') from g)
    into v_win, v_opponents;
  select to_jsonb(s) into v_position from (
    select st.position, (select count(*) from public_standings x where x.competition_external_id = st.competition_external_id) as teams, st.category, st.season, st.played
    from public_standings st where st.is_club and st.played > 0 order by st.season desc, st.played desc limit 1) s;
  select min(c.season) into v_first from federation_competitions c where c.kind = 'league' and c.season is not null;
  select count(distinct c.season) into v_cups from federation_competitions c where c.kind = 'cup' and c.season is not null;
  return jsonb_build_object('scorers', v_scorers, 'seasons', case when v_latest is null then null else jsonb_build_array(v_latest - 1, v_latest) end,
    'leagues', v_leagues, 'ladder', to_jsonb(ladder), 'founded', v_founded, 'biggest_win', v_win, 'opponents', v_opponents,
    'position', v_position, 'first_league_season', v_first, 'cup_seasons', v_cups);
end $$;
revoke all on function public.quiz_club_facts() from public, anon;
grant execute on function public.quiz_club_facts() to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.38.0','feature','More quiz questions, quiz editor',
  'Admins manage the quiz in Admin → Quiz (add, edit and translate questions, switch them on or off). 21 more Laws of the Game questions and new club questions: biggest win, league position, first Palloliitto season, Finnish Cup seasons.','2026-11-18')
on conflict (version) do nothing;
