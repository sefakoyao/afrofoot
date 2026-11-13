-- 0010 multilingual content (English / Finnish / French)
-- English is the source language stored in the normal columns. Finnish and French live in `translations`:
--   {"fi": {"title": "...", "body_md": "..."}, "fr": {...}}
-- Reading code falls back to English for any missing field (see app.localized).
create function app.valid_translations(j jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(j) = 'object'
     and not exists (select 1 from jsonb_object_keys(j) k where k not in ('fi','fr'))
     and not exists (select 1 from jsonb_each(j) e where jsonb_typeof(e.value) <> 'object')
$$;
create function app.localized(base text, tr jsonb, loc text, field text) returns text language sql immutable as $$
  select coalesce(nullif(tr -> loc ->> field, ''), base)
$$;
grant execute on function app.valid_translations(jsonb), app.localized(text, jsonb, text, text) to anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['pages','news_posts','sponsors','staff_members','announcements','membership_plans','evaluation_criteria'] loop
    execute format('alter table public.%I add column translations jsonb not null default %L::jsonb', t, '{}');
    execute format('alter table public.%I add constraint %I check (app.valid_translations(translations))', t, t || '_translations_valid');
  end loop; end $$;

alter table contact_messages add column locale text not null default 'en' check (locale in ('en','fi','fr'));
alter table join_requests    add column locale text not null default 'en' check (locale in ('en','fi','fr'));

-- Public staff view now carries translations (columns appended at the end, as CREATE OR REPLACE VIEW requires).
create or replace view public_staff as
select id, (first_name || ' ' || last_name) as display_name, type, title, bio, photo_path, sort_order, translations
from staff_members where is_public and active;
