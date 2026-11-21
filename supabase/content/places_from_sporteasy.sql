-- Saved places from the SportEasy export ("Manage registered locations"), one row per real place: spelling variants
-- merged, the city in its own field, "Montel Office" and "N/A" left out. SportEasy's export had only one street address
-- (Kartano 2 TN); the others get a Google Maps search link (TN = tekonurmi, N = nurmi, UK = urheilukenttä,
-- PK = pallokenttä) and a note for coaches to add the address on the Places page.
-- Paste into Supabase > SQL Editor (the live project) and click Run. Safe to run more than once: a place with the same name
-- and city is skipped.
insert into locations (name, kind, address, postal_code, city, latitude, longitude, maps_url, notes) values
  ('Ala-Malmin liikuntapuisto', 'field', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Ala-Malmin%20liikuntapuisto%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Espoon jalkapallohalli', 'hall', null, null, 'Espoo', null, null, 'https://www.google.com/maps/search/?api=1&query=Espoon%20jalkapallohalli%2C%20Espoo', 'From SportEasy: add the street address when you know it.'),
  ('Hartwall Sport Areena TN (Puotila)', 'pitch', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Hartwall%20Sport%20Areena%20tekonurmi%20Puotila%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Helsingin NMKY', 'gym', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Helsingin%20NMKY%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Herttoniemi TN', 'pitch', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Herttoniemi%20tekonurmi%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Hyrylä UK 1 N', 'field', null, null, 'Tuusula', null, null, 'https://www.google.com/maps/search/?api=1&query=Hyryl%C3%A4%20urheilukentt%C3%A4%201%20nurmi%2C%20Tuusula', 'From SportEasy: add the street address when you know it.'),
  ('Myyrmäen jalkapallostadion TN', 'pitch', null, null, 'Vantaa', null, null, 'https://www.google.com/maps/search/?api=1&query=Myyrm%C3%A4en%20jalkapallostadion%20tekonurmi%2C%20Vantaa', 'From SportEasy: add the street address when you know it.'),
  ('Jokela TN', 'pitch', null, null, 'Tuusula', null, null, 'https://www.google.com/maps/search/?api=1&query=Jokela%20tekonurmi%2C%20Tuusula', 'From SportEasy: add the street address when you know it.'),
  ('Kankuri TN', 'pitch', null, null, 'Hyvinkää', null, null, 'https://www.google.com/maps/search/?api=1&query=Kankuri%20tekonurmi%2C%20Hyvink%C3%A4%C3%A4', 'From SportEasy: add the street address when you know it.'),
  ('Kartano 1 TN', 'pitch', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Kartano%201%20tekonurmi%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Kartano 2 TN', 'pitch', 'Pallokuja 4', '00980', 'Helsinki', 60.210831, 25.1567382, 'https://www.google.com/maps/search/?api=1&query=60.210831%2C25.1567382', 'From SportEasy.'),
  ('Kenraalinpuisto TN', 'pitch', null, null, 'Vantaa', null, null, 'https://www.google.com/maps/search/?api=1&query=Kenraalinpuisto%20tekonurmi%2C%20Vantaa', 'From SportEasy: add the street address when you know it.'),
  ('Keski-Espoon urheilupuisto', 'field', null, null, 'Espoo', null, null, 'https://www.google.com/maps/search/?api=1&query=Keski-Espoon%20urheilupuisto%2C%20Espoo', 'From SportEasy: add the street address when you know it.'),
  ('Keskusurheilukenttä TN', 'pitch', null, null, 'Järvenpää', null, null, 'https://www.google.com/maps/search/?api=1&query=Keskusurheilukentt%C3%A4%20tekonurmi%2C%20J%C3%A4rvenp%C3%A4%C3%A4', 'From SportEasy: add the street address when you know it.'),
  ('Kisapuisto Stadium', 'field', null, null, 'Lahti', null, null, 'https://www.google.com/maps/search/?api=1&query=Kisapuisto%20Stadium%2C%20Lahti', 'From SportEasy: add the street address when you know it.'),
  ('Klaukkala TN', 'pitch', null, null, 'Nurmijärvi', null, null, 'https://www.google.com/maps/search/?api=1&query=Klaukkala%20tekonurmi%2C%20Nurmij%C3%A4rvi', 'From SportEasy: add the street address when you know it.'),
  ('Kontula TN', 'pitch', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Kontula%20tekonurmi%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Laajasalo N', 'field', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Laajasalo%20nurmi%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Latokartano TN', 'pitch', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Latokartano%20tekonurmi%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Latokartanon liikuntahalli (Viikki)', 'hall', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Latokartanon%20liikuntahalli%20Viikki%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Mukkulan kuplahalli', 'hall', null, null, 'Lahti', null, null, 'https://www.google.com/maps/search/?api=1&query=Mukkulan%20kuplahalli%2C%20Lahti', 'From SportEasy: add the street address when you know it.'),
  ('Myllyhalli', 'hall', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Myllyhalli%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Myllypuro TN', 'pitch', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Myllypuro%20tekonurmi%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Pallokenttä TN', 'pitch', null, null, 'Porvoo', null, null, 'https://www.google.com/maps/search/?api=1&query=Pallokentt%C3%A4%20tekonurmi%2C%20Porvoo', 'From SportEasy: add the street address when you know it.'),
  ('Pallomylly', 'hall', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Pallomylly%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Pirkkolan tekonurmi', 'pitch', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Pirkkolan%20tekonurmi%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Puistola TN', 'pitch', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Puistola%20tekonurmi%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Puotila TN', 'pitch', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Puotila%20tekonurmi%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Rajakylä TN', 'pitch', null, null, 'Vantaa', null, null, 'https://www.google.com/maps/search/?api=1&query=Rajakyl%C3%A4%20tekonurmi%2C%20Vantaa', 'From SportEasy: add the street address when you know it.'),
  ('Ruskeasuon liikuntahalli', 'hall', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Ruskeasuon%20liikuntahalli%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Sinelli Areena TN (Havukoski)', 'pitch', null, null, 'Vantaa', null, null, 'https://www.google.com/maps/search/?api=1&query=Sinelli%20Areena%20tekonurmi%20Havukoski%2C%20Vantaa', 'From SportEasy: add the street address when you know it.'),
  ('Sportanlage Kurkimäki', 'field', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Sportanlage%20Kurkim%C3%A4ki%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Tali halli TN', 'hall', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Tali%20halli%20tekonurmi%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Tapuli TN', 'pitch', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Tapuli%20tekonurmi%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Pornaisten tekonurmi', 'pitch', null, null, 'Pornainen', null, null, 'https://www.google.com/maps/search/?api=1&query=Pornaisten%20tekonurmi%2C%20Pornainen', 'From SportEasy: add the street address when you know it.'),
  ('Tekova Areena halli TN', 'hall', null, null, 'Tuusula', null, null, 'https://www.google.com/maps/search/?api=1&query=Tekova%20Areena%20halli%20tekonurmi%2C%20Tuusula', 'From SportEasy: add the street address when you know it.'),
  ('Töölö PK 3 TN', 'pitch', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=T%C3%B6%C3%B6l%C3%B6%20pallokentt%C3%A4%203%20tekonurmi%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Töölö PK 6 TN', 'pitch', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=T%C3%B6%C3%B6l%C3%B6%20pallokentt%C3%A4%206%20tekonurmi%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Töölön pallokenttä', 'field', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=T%C3%B6%C3%B6l%C3%B6n%20pallokentt%C3%A4%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Haminan urheilukenttä N', 'field', null, null, 'Hamina', null, null, 'https://www.google.com/maps/search/?api=1&query=Haminan%20urheilukentt%C3%A4%20nurmi%2C%20Hamina', 'From SportEasy: add the street address when you know it.'),
  ('Vesala sports field', 'field', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Vesala%20sports%20field%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Viikki (Latokartanon urheilupuisto)', 'field', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Viikki%20Latokartanon%20urheilupuisto%2C%20Helsinki', 'From SportEasy: add the street address when you know it.'),
  ('Vuosaaren Kartano', 'field', null, null, 'Helsinki', null, null, 'https://www.google.com/maps/search/?api=1&query=Vuosaaren%20Kartano%2C%20Helsinki', 'From SportEasy: add the street address when you know it.')
on conflict do nothing;

select count(*) as places_from_sporteasy from locations where notes like 'From SportEasy%';
