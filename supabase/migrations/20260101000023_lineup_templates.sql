-- 0023 Release 0.14.0: saved lineup templates (formation, positions, bench, tactic arrows, private coach notes).
-- Only the team's coaches and admins can see or change them; players and the public never can.
create table lineup_templates (
  id uuid primary key default gen_random_uuid(),
  team_season_id uuid not null references team_seasons(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  formation text not null check (char_length(formation) between 3 and 12),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 20000),  -- slots, positions, bench, captain, arrows, kit, pitch
  coach_notes text check (char_length(coach_notes) <= 2000),                                                        -- private to coaches
  created_by uuid references profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_season_id, name)
);
create index on lineup_templates (team_season_id);
create trigger touch before update on lineup_templates for each row execute function app.touch_updated_at();
create trigger audit after insert or update or delete on lineup_templates for each row execute function app.audit();
alter table lineup_templates enable row level security;
revoke all on lineup_templates from anon;
create policy lt_coach on lineup_templates for all to authenticated
  using (app.is_admin() or app.coaches_ts(team_season_id)) with check (app.is_admin() or app.coaches_ts(team_season_id));

insert into app_releases (version, kind, title, notes, released_at) values
  ('0.14.0','feature','Better lineup builder',
   'Auto-fill, player availability, search and filters, substitutes strip, lineup check, tactic arrows, undo and redo, kit and pitch styles, saved lineups with private coach notes, image download and copy as text.', '2026-11-13')
on conflict (version) do nothing;
