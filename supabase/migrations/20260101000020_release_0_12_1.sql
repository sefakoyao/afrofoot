-- 0020 Release 0.12.1: insurance options shown in full for ages 12-69 on the Membership page (no schema change).
insert into app_releases (version, kind, title, notes, released_at) values
 ('0.12.1','fix','Insurance options shown in full for ages 12–69','Broad cover, narrow cover and optional leisure-time accident cover are now listed for ages 12–19 and 20–69.','2026-11-13')
on conflict (version) do nothing;
