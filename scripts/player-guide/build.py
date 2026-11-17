"""
Builds the one-page player guide (account, sign-in, Code of Conduct, contract, fees) as HTML in en / fi / fr / ar.
Usage: python3 scripts/player-guide/build.py <work dir>   (see scripts/player-guide/README.md)
The work dir must hold fonts/figtree and fonts/cairo (the "files" folders of @fontsource/figtree and @fontsource/cairo)
and logo.png; the HTML files are written there, then pdf.cjs turns them into PDFs.
"""
import base64, sys
G = sys.argv[1].rstrip('/') + '/'
b64 = lambda p: base64.b64encode(open(p, 'rb').read()).decode()
FIG = G + 'fonts/figtree/'; CAI = G + 'fonts/cairo/'
def faces(fam, path, prefix, subsets):
    out = ''
    for sub, rng in subsets:
        for w in (400, 600, 700, 800, 900):
            out += f"@font-face{{font-family:'{fam}';font-weight:{w};src:url(data:font/woff2;base64,{b64(path + f'{prefix}-{sub}-{w}-normal.woff2')}) format('woff2');unicode-range:{rng}}}"
    return out
LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
ARABIC = 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,U+10E60-10E7E,U+10EC2-10EC4,U+10EFC-10EFF,U+1EE00-1EEFF'
FONTS_LATIN = faces('Figtree', FIG, 'figtree', [('latin', LATIN)])
FONTS_AR = faces('Cairo', CAI, 'cairo', [('arabic', ARABIC), ('latin', LATIN)])
LOGO = 'data:image/png;base64,' + b64(G + 'logo.png')
L = lambda s: f'<span dir="ltr">{s}</span>'   # keeps phone numbers, addresses and e-mails left to right
APP, MAIL, WEB = L('app.afrofoot.club'), L('info@afrofoot.club'), L('www.afrofoot.club')

T = {
 'en': dict(title='Afro Foot Club app', kicker='Player guide', open='Open the app', q='Questions?', qt=f'Ask your coach, or write to<br><b>{MAIL}</b>', motto='One team, no borders, pure football',
  intro='Everything is in the club app: trainings and games, your contract, the Code of Conduct and your invoices. Setting it up takes about 10 minutes.',
  steps=[('Create your account', f'''<ol><li>Go to <b>{APP}</b> and tap <b>Create account</b>.</li>
<li>Choose <b>Email</b> or <b>Phone number</b>. Enter your first and last name as on your ID. Phone numbers need the country code, for example {L('+358 40 123 4567')}.</li>
<li>Do the robot check (tap the football), tick the privacy policy box and tap <b>Create account</b>.</li>
<li>Confirm: open the link in the email, or type the 6-digit code from the text message.</li>
<li>Tell your coach you have signed up. The club approves new accounts, usually within a few days.</li></ol><p class="note">You can also tap <b>Continue with Google</b> instead.</p>'''),
   ('Sign in', '<p>Sign in the way you signed up: email and password, <b>Sign in with a phone number</b> (you get a code by text message), or <b>Continue with Google</b>. Forgot your password? Tap <b>Forgot your password?</b></p><p>Then add your phone number and emergency contact under <b>My profile</b>.</p>'),
   ('Agree to the Code of Conduct', '<p><b>Membership</b> tab {A} <b>Read and agree</b> {A} tick the box {A} <b>I agree</b>.</p>'),
   ('Sign your player contract', "<p>When the club adds you to a team, your contract for the season appears in the <b>Membership</b> tab. Players are not paid: your membership fee covers the team's costs. Your player licence (from Palloliitto) and insurance are not included.</p><ol><li>Tap <b>Read and sign</b>.</li><li>Type your full name as on your account, tick the box and tap <b>Sign contract</b>.</li><li>The club countersigns, and the contract becomes <b>Active</b>.</li></ol>"),
   ('Pay your membership fee', "<p>Your first invoice comes once you have signed the contract and agreed to the Code of Conduct. Find it under <b>Membership</b> {A} <b>My payments</b>.</p><ul><li>Pay by bank transfer with the <b>reference number</b>. With a Finnish bank you can paste the bank barcode instead.</li><li>Can't pay on time? Talk to your coach before the due date.</li></ul>")],
  alert=f"<b>Overdue invoice?</b> Sign-in is blocked and you can't join trainings or games until you pay. You can still pay from the sign-in page or the website's Membership page ({L('afrofoot.club/membership')})."),
 'fi': dict(title='Afro Foot Clubin sovellus', kicker='Pelaajan opas', open='Avaa sovellus', q='Kysyttävää?', qt=f'Kysy valmentajaltasi tai kirjoita osoitteeseen<br><b>{MAIL}</b>', motto='Yksi joukkue, ei rajoja, puhdas jalkapallo',
  intro='Kaikki löytyy seuran sovelluksesta: harjoitukset ja ottelut, sopimuksesi, toimintaohjeet ja laskusi. Käyttöönotto vie noin 10 minuuttia.',
  steps=[('Luo tili', f'''<ol><li>Mene osoitteeseen <b>{APP}</b> ja napauta <b>Luo tili</b>.</li>
<li>Valitse <b>Sähköposti</b> tai <b>Puhelinnumero</b>. Kirjoita etu- ja sukunimesi kuten henkilöllisyystodistuksessa. Puhelinnumeroon tarvitaan maatunnus, esimerkiksi {L('+358 40 123 4567')}.</li>
<li>Tee robottitarkistus (napauta jalkapalloa), rastita tietosuojaselosteen ruutu ja napauta <b>Luo tili</b>.</li>
<li>Vahvista: avaa sähköpostin linkki tai kirjoita tekstiviestin 6-numeroinen koodi.</li>
<li>Kerro valmentajallesi, että olet rekisteröitynyt. Seura hyväksyy uudet tilit yleensä muutaman päivän kuluessa.</li></ol><p class="note">Voit myös napauttaa <b>Jatka Googlella</b>.</p>'''),
   ('Kirjaudu sisään', '<p>Kirjaudu samalla tavalla kuin rekisteröidyit: sähköposti ja salasana, <b>Kirjaudu puhelinnumerolla</b> (saat koodin tekstiviestinä) tai <b>Jatka Googlella</b>. Unohtuiko salasana? Napauta <b>Unohditko salasanasi?</b></p><p>Lisää sitten puhelinnumerosi ja hätäyhteyshenkilösi kohtaan <b>Oma profiili</b>.</p>'),
   ('Hyväksy toimintaohjeet', '<p><b>Jäsenyys</b>-välilehti {A} <b>Lue ja hyväksy</b> {A} rastita ruutu {A} <b>Hyväksyn</b>.</p>'),
   ('Allekirjoita pelaajasopimus', '<p>Kun seura lisää sinut joukkueeseen, kauden sopimuksesi ilmestyy <b>Jäsenyys</b>-välilehdelle. Pelaajille ei makseta palkkaa: jäsenmaksusi kattaa joukkueen kuluja. Pelipassi (Palloliitolta) ja vakuutus eivät sisälly maksuun.</p><ol><li>Napauta <b>Lue ja allekirjoita</b>.</li><li>Kirjoita koko nimesi kuten tililläsi, rastita ruutu ja napauta <b>Allekirjoita sopimus</b>.</li><li>Seura allekirjoittaa sopimuksen omalta osaltaan, ja se on <b>Voimassa</b>.</li></ol>'),
   ('Maksa jäsenmaksu', '<p>Ensimmäinen lasku tulee, kun olet allekirjoittanut sopimuksen ja hyväksynyt toimintaohjeet. Löydät sen kohdasta <b>Jäsenyys</b> {A} <b>Omat maksuni</b>.</p><ul><li>Maksa tilisiirtona <b>viitenumerolla</b>. Suomalaisessa pankissa voit liittää virtuaaliviivakoodin.</li><li>Etkö pysty maksamaan ajallaan? Puhu valmentajasi kanssa ennen eräpäivää.</li></ul>')],
  alert=f'<b>Erääntynyt lasku?</b> Kirjautuminen estetään, etkä voi osallistua harjoituksiin tai otteluihin ennen kuin olet maksanut. Voit silti maksaa kirjautumissivulta tai verkkosivujen Jäsenyys-sivulta ({L("afrofoot.club/fi/membership")}).'),
 'fr': dict(title="L'application Afro Foot Club", kicker='Guide du joueur', open="Ouvrir l'application", q='Des questions ?', qt=f'Demandez à votre entraîneur, ou écrivez à<br><b>{MAIL}</b>', motto='Une équipe, sans frontières, football pur',
  intro="Tout se trouve dans l'application du club : entraînements et matchs, votre contrat, le Code de conduite et vos factures. La mise en route prend environ 10 minutes.",
  steps=[('Créez votre compte', f'''<ol><li>Allez sur <b>{APP}</b> et touchez <b>Créer un compte</b>.</li>
<li>Choisissez <b>E-mail</b> ou <b>Numéro de téléphone</b>. Saisissez vos prénom et nom comme sur votre pièce d'identité. Le numéro doit comporter l'indicatif du pays, par exemple {L('+358 40 123 4567')}.</li>
<li>Faites la vérification anti-robot (touchez le ballon), cochez la case de la politique de confidentialité et touchez <b>Créer un compte</b>.</li>
<li>Confirmez : ouvrez le lien reçu par e-mail, ou saisissez le code à 6 chiffres reçu par SMS.</li>
<li>Prévenez votre entraîneur que vous êtes inscrit. Le club valide les nouveaux comptes, en général sous quelques jours.</li></ol><p class="note">Vous pouvez aussi toucher <b>Continuer avec Google</b>.</p>'''),
   ('Connectez-vous', '<p>Connectez-vous comme vous vous êtes inscrit : e-mail et mot de passe, <b>Se connecter avec un numéro de téléphone</b> (vous recevez un code par SMS), ou <b>Continuer avec Google</b>. Mot de passe oublié ? Touchez <b>Mot de passe oublié ?</b></p><p>Ajoutez ensuite votre numéro de téléphone et une personne à contacter en cas d\'urgence dans <b>Mon profil</b>.</p>'),
   ('Acceptez le Code de conduite', "<p>Onglet <b>Adhésion</b> {A} <b>Lire et accepter</b> {A} cochez la case {A} <b>J’accepte</b>.</p>"),
   ('Signez votre contrat de joueur', "<p>Quand le club vous ajoute à une équipe, votre contrat pour la saison apparaît dans l'onglet <b>Adhésion</b>. Les joueurs ne sont pas payés : votre cotisation couvre les frais de l'équipe. Votre licence (auprès de Palloliitto) et l'assurance ne sont pas comprises.</p><ol><li>Touchez <b>Lire et signer</b>.</li><li>Saisissez votre nom complet comme sur votre compte, cochez la case et touchez <b>Signer le contrat</b>.</li><li>Le club contresigne, et le contrat devient <b>Actif</b>.</li></ol>"),
   ('Payez votre cotisation', "<p>Votre première facture arrive une fois le contrat signé et le Code de conduite accepté. Vous la trouvez dans <b>Adhésion</b> {A} <b>Mes paiements</b>.</p><ul><li>Payez par virement avec la <b>référence</b>. Avec une banque finlandaise, vous pouvez coller le code-barres bancaire.</li><li>Vous ne pouvez pas payer à temps ? Parlez-en à votre entraîneur avant l'échéance.</li></ul>")],
  alert=f"<b>Facture en retard ?</b> La connexion est bloquée et vous ne pouvez pas participer aux entraînements ni aux matchs tant que vous n'avez pas payé. Vous pouvez toujours payer depuis la page de connexion ou la page Adhésion du site ({L('afrofoot.club/fr/membership')})."),
 'ar': dict(title='تطبيق أفرو فوت كلوب', kicker='دليل اللاعب', open='افتح التطبيق', q='لديك أسئلة؟', qt=f'اسأل مدربك، أو راسلنا على<br><b>{MAIL}</b>', motto='فريق واحد، بلا حدود، كرة قدم خالصة',
  intro='كل شيء موجود في تطبيق النادي: التدريبات والمباريات وعقدك ومدونة السلوك وفواتيرك. يستغرق الإعداد نحو 10 دقائق.',
  steps=[('أنشئ حسابك', f'''<ol><li>اذهب إلى <b>{APP}</b> واضغط <b>إنشاء حساب</b>.</li>
<li>اختر <b>البريد الإلكتروني</b> أو <b>رقم الهاتف</b>. اكتب اسمك الأول واسم العائلة كما في بطاقة هويتك. يجب أن يتضمن رقم الهاتف رمز البلد، مثل {L('+358 40 123 4567')}.</li>
<li>أكمل التحقق من أنك لست روبوتًا (اضغط على كرة القدم)، وضع علامة على مربع سياسة الخصوصية، ثم اضغط <b>إنشاء حساب</b>.</li>
<li>أكّد الحساب: افتح الرابط في البريد الإلكتروني، أو اكتب الرمز المكوّن من 6 أرقام من الرسالة النصية.</li>
<li>أخبر مدربك بأنك سجّلت. يوافق النادي على الحسابات الجديدة عادةً خلال أيام قليلة.</li></ol><p class="note">يمكنك أيضًا الضغط على <b>المتابعة باستخدام Google</b>.</p>'''),
   ('سجّل الدخول', '<p>سجّل الدخول بالطريقة نفسها التي أنشأت بها حسابك: البريد الإلكتروني وكلمة المرور، أو <b>تسجيل الدخول برقم الهاتف</b> (يصلك رمز برسالة نصية)، أو <b>المتابعة باستخدام Google</b>. نسيت كلمة المرور؟ اضغط <b>نسيت كلمة المرور؟</b></p><p>ثم أضف رقم هاتفك وجهة الاتصال في حالات الطوارئ في <b>ملفي</b>.</p>'),
   ('وافق على مدونة السلوك', '<p>تبويب <b>العضوية</b> {A} <b>اقرأ ووافق</b> {A} ضع علامة على المربع {A} <b>أوافق</b>.</p>'),
   ('وقّع عقد اللاعب', '<p>عندما يضيفك النادي إلى فريق، يظهر عقدك للموسم في تبويب <b>العضوية</b>. اللاعبون لا يتقاضون أجرًا: رسوم عضويتك تغطي تكاليف الفريق. رخصة اللاعب (من الاتحاد الفنلندي Palloliitto) والتأمين غير مشمولين.</p><ol><li>اضغط <b>اقرأ ووقّع</b>.</li><li>اكتب اسمك الكامل كما في حسابك، وضع علامة على المربع، ثم اضغط <b>وقّع العقد</b>.</li><li>يوقّع النادي العقد بدوره، فيصبح <b>ساريًا</b>.</li></ol>'),
   ('ادفع رسوم العضوية', '<p>تصلك فاتورتك الأولى بعد توقيع العقد والموافقة على مدونة السلوك. تجدها في <b>العضوية</b> {A} <b>مدفوعاتي</b>.</p><ul><li>ادفع بتحويل بنكي مع <b>الرقم المرجعي</b>. مع بنك فنلندي يمكنك لصق الرمز الشريطي البنكي بدلًا من ذلك.</li><li>لا تستطيع الدفع في الموعد؟ تحدّث مع مدربك قبل تاريخ الاستحقاق.</li></ul>')],
  alert=f'<b>فاتورة متأخرة؟</b> يُوقَف تسجيل الدخول ولا يمكنك المشاركة في التدريبات أو المباريات حتى تدفع. ما زال بإمكانك الدفع من صفحة تسجيل الدخول أو من صفحة العضوية على الموقع ({L("afrofoot.club/ar/membership")}).'),
}

CSS = '''@page{size:A4;margin:0}*{box-sizing:border-box}
body{margin:0;font-family:Figtree,sans-serif;color:#0b0f0a;font-size:10.1pt;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html[lang=fi] body,html[lang=fr] body{font-size:9.55pt;line-height:1.36}html[lang=fi] .step,html[lang=fr] .step{padding-bottom:3.4mm}html[lang=fi] h1,html[lang=fr] h1{font-size:23pt}
html[dir=rtl] body{font-family:Cairo,sans-serif;font-size:9.6pt;line-height:1.5}
.page{width:210mm;height:297mm;position:relative;overflow:hidden;display:grid;grid-template-columns:62mm 1fr}
span[dir=ltr]{white-space:nowrap;unicode-bidi:isolate}html[dir=rtl] h1{line-height:1.3;font-size:24pt}b{font-weight:800}p{margin:0 0 1.6mm}ol,ul{margin:0 0 1.4mm;padding-inline-start:5mm}li{margin:.6mm 0}
.note{color:#4d5649;font-size:.95em}.ar{color:#3DAF2C;font-weight:900}
aside{background:#0b0f0a;color:#fff;padding:14mm 9mm 12mm;position:relative;display:flex;flex-direction:column}
aside img{width:30mm;position:relative}.kicker{color:#3DAF2C;font-weight:800;letter-spacing:.16em;text-transform:uppercase;font-size:8.5pt;margin-top:9mm;position:relative}
html[dir=rtl] .kicker{letter-spacing:0;font-size:10pt}
h1{margin:2mm 0 4mm;font-size:25pt;font-weight:900;line-height:1.05;position:relative}aside p{color:#c9d3c4;font-size:10.2pt;position:relative}
.url{margin-top:auto;position:relative;background:#3DAF2C;color:#0b0f0a;border-radius:4mm;padding:4mm 4.5mm;font-weight:900;font-size:12.5pt}
.url small{display:block;font-weight:700;font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase}html[dir=rtl] .url small{letter-spacing:0;font-size:9pt}
.contact{position:relative;margin-top:5mm;font-size:8.8pt;color:#c9d3c4}.contact b{color:#fff}
main{padding:13mm 11mm 10mm 13mm;position:relative}
html[dir=rtl] main{padding:13mm 13mm 10mm 11mm}
.step{position:relative;padding-inline-start:13mm;padding-bottom:4.2mm}
.step:before{content:"";position:absolute;inset-inline-start:4.1mm;top:9mm;bottom:0;width:.6mm;background:#cfe9c9}.step:last-of-type:before{display:none}
.num{position:absolute;inset-inline-start:0;top:0;width:8.8mm;height:8.8mm;border-radius:50%;background:#3DAF2C;font-weight:900;font-size:12pt;display:flex;align-items:center;justify-content:center}
h2{margin:1mm 0 1.6mm;font-size:13.5pt;font-weight:900}html[dir=rtl] h2{margin-top:0}
.alert{margin-inline-start:13mm;margin-top:1mm;border-inline-start:1.6mm solid #3DAF2C;background:#f1f6ee;border-start-end-radius:3mm;border-end-end-radius:3mm;padding:3mm 4mm;font-size:.97em}
footer{position:absolute;inset-inline-start:24mm;inset-inline-end:11mm;bottom:8mm;font-size:8.6pt;color:#4d5649}'''
PITCH = '''<svg viewBox="0 0 400 260" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;opacity:.12">
<g fill="none" stroke="#3DAF2C" stroke-width="2"><rect x="10" y="10" width="380" height="240" rx="3"/><line x1="200" y1="10" x2="200" y2="250"/><circle cx="200" cy="130" r="36"/>
<rect x="10" y="70" width="58" height="120"/><rect x="332" y="70" width="58" height="120"/><rect x="10" y="102" width="22" height="56"/><rect x="368" y="102" width="22" height="56"/></g></svg>'''

for lang, t in T.items():
    rtl = lang == 'ar'
    arrow = '<span class="ar">‹</span>' if rtl else '<span class="ar">›</span>'
    steps = ''.join(f'<section class="step"><span class="num">{i + 1}</span><h2>{title}</h2>{body.replace("{A}", arrow)}</section>' for i, (title, body) in enumerate(t['steps']))
    html = f'''<!doctype html><html lang="{lang}" dir="{'rtl' if rtl else 'ltr'}"><head><meta charset="utf-8"><title>{t['title']} – {t['kicker']}</title>
<style>{FONTS_AR if rtl else FONTS_LATIN}{CSS}</style></head><body><div class="page">
<aside>{PITCH}<img src="{LOGO}" alt="Afro Foot Club"><div class="kicker">{t['kicker']}</div><h1>{t['title']}</h1><p>{t['intro']}</p>
<div class="url"><small>{t['open']}</small>{APP}</div><div class="contact"><b>{t['q']}</b><br>{t['qt']}</div></aside>
<main>{steps}<div class="alert">{t['alert']}</div><footer><b>{WEB}</b> · {t['motto']}</footer></main></div></body></html>'''
    open(G + f'guide-B-{lang}.html', 'w').write(html)
