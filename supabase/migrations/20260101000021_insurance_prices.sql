-- 0021 Insurance prices by age/status, season 2026. Release 0.12.2.
-- Source: Palloliitto insurance document 2026 (price row V10..V31) and club pages quoting it.
-- The federation's own age table could not be read automatically, so every row stays verified = false until an admin checks it.
update federation_fees set notes = 'Price depends on birth year (see the price rows). Optional leisure-time accident cover 40 or 80 EUR.' where season = 2026 and kind = 'insurance' and band = 'under_12';
insert into federation_fees (season, kind, band, label, amount_cents, notes, sort_order) values
 (2026,'insurance','born_2020_plus','Born 2020 or later',1000,'Seen on a club page quoting Palloliitto (code V22). Verify.',11),
 (2026,'insurance','born_2015','Born 2015',7000,'Seen on a club page quoting Palloliitto (code V21 d, 70 EUR). Verify.',12),
 (2026,'insurance','born_2009_2011','Born 2009 – 2011 (ages 15 – 17)',23000,'Seen on a club page quoting Palloliitto (code V20 b, 230 EUR). Verify.',21),
 (2026,'insurance','adult_amateur_broad','Adult amateur, broad cover',39500,'Inferred from the federation PDF price row (V10). Verify.',31),
 (2026,'insurance','adult_amateur_narrow','Adult amateur, narrow cover',15000,'Inferred from the federation PDF price row (V11). Verify.',32),
 (2026,'insurance','contract_amateur_broad','Contracted amateur, broad cover',69500,'Inferred from the federation PDF price row (V12). Verify.',33),
 (2026,'insurance','contract_amateur_narrow','Contracted amateur, narrow cover',32500,'Inferred from the federation PDF price row (V13). Verify.',34)
on conflict (season, kind, band) do update set amount_cents = excluded.amount_cents, notes = excluded.notes, label = excluded.label;
insert into app_releases (version, kind, title, notes, released_at) values
 ('0.12.2','content','Insurance prices by age','Yearly insurance prices by birth year / status on the Membership page; unverified rows flagged.','2026-11-13')
on conflict (version) do nothing;
