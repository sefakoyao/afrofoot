-- Reference data only (no fake people, no demo content).
insert into evaluation_criteria (name, category, sort_order) values
 ('First touch','technical',10),('Passing','technical',20),('Shooting','technical',30),('Dribbling','technical',40),
 ('Positioning','tactical',50),('Decision making','tactical',60),('Pressing and recovery','tactical',70),
 ('Speed','physical',80),('Stamina','physical',90),('Strength','physical',100),
 ('Focus','mental',110),('Confidence','mental',120),
 ('Punctuality','attitude',130),('Teamwork','attitude',140),('Respect and fair play','attitude',150)
on conflict (name) do nothing;
insert into site_settings (key, value, is_public) values
 ('club', '{"name":"Afro Foot Club","legal_name":"Afro Foot Club ry","tagline":"Where the world plays as one.","founded":2020,"country":"Finland","fifa_id":"149PZFE"}', true),
 ('contact', '{"email":"info@afrofoot.club","phone":"+358 50 477 3030","contact_person":"Sefako Yao, GM"}', true),
 ('social', '{"facebook":"https://facebook.com/afrofootclub","twitter":"https://twitter.com/AfroFootClub","instagram":"https://instagram.com/afrofootclub"}', true),
 ('locale', '{"timezone":"Europe/Helsinki","currency":"EUR","languages":["en","fi","fr"]}', true)
on conflict (key) do nothing;
