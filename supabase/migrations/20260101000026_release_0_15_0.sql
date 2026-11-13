-- 0026 Release 0.15.0: new typeface (Figtree).
insert into app_releases (version, kind, title, notes, released_at) values
  ('0.15.0','design','New typeface: Figtree','Figtree replaces Nunito for Latin text and headings. Arabic keeps Cairo.', '2026-11-13')
on conflict (version) do nothing;
