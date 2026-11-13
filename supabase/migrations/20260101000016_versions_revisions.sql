-- 0016 Change tracking for admins: release/version log + content revision history (pages, news) with restore.

-- ===== Release log =====
create table app_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  kind text not null default 'feature' check (kind in ('feature','fix','design','security','content')),
  title text not null check (char_length(title) between 3 and 140),
  notes text not null default '' check (char_length(notes) <= 4000),
  released_at timestamptz not null default now(),
  released_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table app_releases enable row level security;
create policy releases_admin_read on app_releases for select to authenticated using (app.is_admin());
create policy releases_super_write on app_releases for all to authenticated using (app.is_super()) with check (app.is_super());
grant select on app_releases to authenticated;
grant insert, update, delete on app_releases to authenticated;
create trigger audit after insert or update or delete on app_releases for each row execute function app.audit();

-- latest version number only: safe to show in the public footer
create view public_app_version with (security_invoker = false) as
  select version, released_at from app_releases order by released_at desc, created_at desc limit 1;
grant select on public_app_version to anon, authenticated;

-- ===== Content revisions =====
create table content_revisions (
  id uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in ('pages','news_posts')),
  record_id uuid not null,
  revision int not null,
  snapshot jsonb not null,
  changed_fields text[] not null default '{}',
  change_note text check (char_length(change_note) <= 300),
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  restored_from uuid references content_revisions(id) on delete set null,
  unique (table_name, record_id, revision)
);
create index on content_revisions (table_name, record_id, revision desc);
alter table content_revisions enable row level security;
create policy revisions_admin_read on content_revisions for select to authenticated using (app.is_admin());
grant select on content_revisions to authenticated;   -- no client writes: only the trigger writes

create function app.snapshot_revision() returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb := to_jsonb(new); rev int; changed text[]; note text := nullif(current_setting('app.change_note', true), '');
        src uuid := nullif(current_setting('app.restored_from', true), '')::uuid;
begin
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    if (o - 'updated_at' - 'updated_by') = (n - 'updated_at' - 'updated_by') then return new; end if;
    select coalesce(array_agg(k order by k), '{}') into changed from jsonb_each(n) e(k, v)
      where k not in ('updated_at','updated_by') and o->k is distinct from v;
  else
    changed := array['created'];
  end if;
  select coalesce(max(revision), 0) + 1 into rev from content_revisions where table_name = tg_table_name and record_id = new.id;
  insert into content_revisions (table_name, record_id, revision, snapshot, changed_fields, change_note, changed_by, restored_from)
  values (tg_table_name, new.id, rev, n, changed, note, auth.uid(), src);
  return new;
end $$;
create trigger revisions after insert or update on pages     for each row execute function app.snapshot_revision();
create trigger revisions after insert or update on news_posts for each row execute function app.snapshot_revision();

-- restore: writes the old content back as a NEW revision (history is never rewritten); restored content is set to draft
create function public.restore_revision(p_revision uuid, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare r content_revisions; newrev int;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into r from content_revisions where id = p_revision;
  if not found then raise exception 'revision not found'; end if;
  perform set_config('app.change_note', coalesce(p_note, 'Restored revision ' || r.revision), true);
  perform set_config('app.restored_from', r.id::text, true);
  if r.table_name = 'pages' then
    update pages set title = r.snapshot->>'title', body_md = r.snapshot->>'body_md', seo_description = r.snapshot->>'seo_description',
      status = 'draft', updated_by = auth.uid() where id = r.record_id;
  else
    update news_posts set title = r.snapshot->>'title', excerpt = r.snapshot->>'excerpt', body_md = r.snapshot->>'body_md',
      cover_path = r.snapshot->>'cover_path', status = 'draft', published_at = null where id = r.record_id;
  end if;
  select max(revision) into newrev from content_revisions where table_name = r.table_name and record_id = r.record_id;
  return newrev;
end $$;
revoke all on function public.restore_revision(uuid, text) from public, anon;
grant execute on function public.restore_revision(uuid, text) to authenticated;

-- ===== Release history so far =====
insert into app_releases (version, kind, title, notes, released_at) values
 ('0.1.0','feature','Database, roles and permissions','Schema, row-level security, audit log, 4 roles.','2026-10-20'),
 ('0.2.0','feature','Languages and design system','English, Finnish, French; tokens and logo colours.','2026-10-24'),
 ('0.3.0','feature','Arabic, lineups and live match events','RTL layout, formations, goals, assists, cards, substitutions.','2026-10-28'),
 ('0.4.0','feature','Tryouts and membership payments','Tryout form, monthly/quarterly/yearly plans, MobilePay, wire, invoice.','2026-11-02'),
 ('0.5.0','feature','Training schedule, ratings, MVP, profiles','Recurring sessions, admin ratings, MVP vote with 24 h publish, photo-required profile.','2026-11-06'),
 ('0.6.0','feature','Locations, event types, enrolment','Saved pitches, route guide, Practice/Game/Friendly with division, enrolment page.','2026-11-10'),
 ('0.7.0','design','Big-club editorial design','Two-tier menu, black hero, news/results modules, values footer.','2026-11-12'),
 ('0.8.0','design','Rounded, simpler design','Nunito typeface, pill buttons, soft cards.','2026-11-13'),
 ('0.9.0','feature','Hero slider with video, version history','Dark hero slider using live club data and a video background; release log and page revision history for admins.','2026-11-13'),
 ('0.9.1','content','Women and Juniors pages, enrolment moved','Enrolment reached from the menu and team pages instead of the front page; Women and Juniors pages marked Upcoming.','2026-11-13');
