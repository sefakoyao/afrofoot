-- 0071 Social media publishing (content assistant, step 2). Release 0.66.0.
-- The posts queued when an article is approved (social_posts, migration 0064) are now sent by the app to the club's
-- Facebook Page, Instagram account, LinkedIn page and X account. TikTok stays queued ("waiting for the connection").
--  * New platforms LinkedIn and X. An X post has at most 280 characters (link included, as X counts them at most).
--    Approving a suggestion drafted before LinkedIn and X existed uses the Facebook text for LinkedIn and the headline
--    with the link for X, unless the approver wrote their own.
--  * Admins switch automatic posting on or off per platform (site setting "social_posting", not public). The keys
--    themselves are server settings on Vercel (Meta, LinkedIn, X), never stored in the database.
--  * The app claims due posts with public.claim_social_posts (service role only): one post is sent once, even when two
--    runs overlap (status 'posting', for update skip locked). A run interrupted while posting marks the post failed
--    instead of sending it again.
--  * Only the publisher (service role) marks a post posted, with its link. Admins and communications people may edit a
--    waiting or failed post, retry a failed one ("waiting" again), post it now or cancel it.
--  * Supabase pg_cron calls the app every 10 minutes (needs the Vault secret "cron_secret", the same value as Vercel's
--    CRON_SECRET). Posts due more than 3 days ago are not sent automatically: a person chooses "Post now".
-- Safe to run more than once. Needs the content assistant (migration 0064).
do $$ begin
  if to_regclass('public.social_posts') is null then
    raise exception 'The content assistant is not installed in this database (migration 0064): install it first';
  end if;
end $$;

alter table social_posts add column if not exists external_id text check (external_id is null or char_length(external_id) <= 200);
alter table social_posts drop constraint if exists social_posts_status_check;
alter table social_posts add constraint social_posts_status_check check (status in ('waiting', 'scheduled', 'posting', 'posted', 'failed', 'cancelled'));
alter table social_posts drop constraint if exists social_posts_platform_check;
alter table social_posts add constraint social_posts_platform_check check (platform in ('facebook', 'instagram', 'tiktok', 'linkedin', 'x'));
alter table social_posts drop constraint if exists social_posts_x_length;
alter table social_posts add constraint social_posts_x_length check (platform <> 'x' or char_length(caption) <= 280) not valid;
create index if not exists social_posts_due on social_posts (post_at) where status in ('waiting', 'scheduled');

-- Approving: the same as 0064, with LinkedIn and X (a suggestion drafted without them gets a text from the others).
create or replace function public.approve_suggestion(p_id uuid, p_post_at timestamptz, p_platforms text[], p_captions jsonb default null, p_site_url text default 'https://www.afrofoot.club') returns uuid
language plpgsql security definer set search_path = public as $$
declare s article_suggestions; v_slug text; v_base text; v_post uuid; v_p text; v_cap text; v_link text; n int := 1;
begin
  if not app.can_publish() then raise exception 'publishers only' using errcode = '42501'; end if;
  select * into s from article_suggestions where id = p_id for update;
  if s.id is null or s.status <> 'new' then raise exception 'not an open suggestion' using errcode = '22023'; end if;
  if p_post_at is not null and (p_post_at < now() - interval '1 hour' or p_post_at > now() + interval '60 days') then raise exception 'posting time: from now to 60 days ahead' using errcode = '22023'; end if;
  if p_platforms is null or not (p_platforms <@ array['facebook', 'instagram', 'tiktok', 'linkedin', 'x']) then raise exception 'unknown platform' using errcode = '22023'; end if;
  v_base := left(coalesce(nullif(app.slugify(s.title), ''), 'news'), 70);
  v_slug := v_base;
  while exists (select 1 from news_posts where slug = v_slug) loop n := n + 1; v_slug := v_base || '-' || n; end loop;
  v_link := rtrim(coalesce(nullif(p_site_url, ''), 'https://www.afrofoot.club'), '/') || '/news/' || v_slug;
  insert into news_posts (slug, title, excerpt, body_md, status, published_at, author_id, translations)
  values (v_slug, s.title, s.excerpt, s.body_md, 'published', now(), auth.uid(), s.translations)
  returning id into v_post;
  foreach v_p in array (select array_agg(distinct x) from unnest(p_platforms) x where x is not null) loop
    v_cap := coalesce(nullif(btrim(p_captions ->> v_p), ''), nullif(btrim(s.social ->> v_p), ''),
                      case v_p when 'linkedin' then nullif(btrim(s.social ->> 'facebook'), '')
                               when 'x' then left(s.title, 200) || ' {link} #afrofootclub' end);
    if v_cap is null then raise exception 'caption missing for %', v_p using errcode = '22023'; end if;
    -- the article's address replaces {link} (Instagram and TikTok captions say "link in bio" instead)
    v_cap := replace(v_cap, '{link}', v_link);
    if v_p = 'x' and char_length(v_cap) > 280 then raise exception 'x: at most 280 characters with the link' using errcode = '22023'; end if;
    insert into social_posts (news_post_id, suggestion_id, platform, caption, status, post_at)
    values (v_post, s.id, v_p, left(v_cap, 2200), 'waiting', coalesce(p_post_at, now()));
  end loop;
  update article_suggestions set status = 'approved', news_post_id = v_post, decided_by = auth.uid(), decided_at = now(), post_at = coalesce(p_post_at, post_at), updated_at = now() where id = s.id;
  return v_post;
end $$;
revoke all on function public.approve_suggestion(uuid, timestamptz, text[], jsonb, text) from public, anon;
grant execute on function public.approve_suggestion(uuid, timestamptz, text[], jsonb, text) to authenticated;

-- what people may change; the publisher (service role: no signed-in user) may change everything
create or replace function app.guard_social_post() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    if tg_op = 'INSERT' or new.updated_at is not distinct from old.updated_at then new.updated_at := now(); end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('waiting', 'scheduled') or new.external_url is not null or new.external_id is not null or new.posted_at is not null or new.attempts <> 0 then
      raise exception 'A new social post starts as waiting' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status in ('posting', 'posted') then
    raise exception 'This post is being sent or has been sent' using errcode = '42501';
  end if;
  if (new.status not in ('waiting', 'scheduled', 'cancelled') and not (new.status = 'failed' and old.status = 'failed')) or (new.external_url, new.external_id, new.posted_at, new.attempts) is distinct from (old.external_url, old.external_id, old.posted_at, old.attempts) then
    raise exception 'Only the app marks a post as sent' using errcode = '42501';
  end if;
  if old.status = 'failed' and new.status in ('waiting', 'scheduled') then new.error := null; end if;   -- Retry
  new.updated_at := now();
  return new;
end $$;
revoke all on function app.guard_social_post() from public, anon, authenticated;
drop trigger if exists guard on social_posts;
create trigger guard before insert or update on social_posts for each row execute function app.guard_social_post();

-- The publisher takes the due posts of the platforms that are switched on. Posts left "posting" for 15 minutes (a run
-- that stopped half-way) become failed: whether they reached the platform is unknown, so a person decides.
create or replace function public.claim_social_posts(p_platforms text[], p_limit int default 5)
returns setof social_posts language plpgsql security definer set search_path = public as $$
begin
  update social_posts set status = 'failed', error = 'Interrupted while posting: check the page before you retry.'
   where status = 'posting' and updated_at < now() - interval '15 minutes';
  return query
  update social_posts s set status = 'posting', attempts = s.attempts + 1, error = null
   where s.id in (select id from social_posts
                   where status in ('waiting', 'scheduled') and platform = any(coalesce(p_platforms, '{}'))
                     and post_at <= now() and post_at > now() - interval '3 days'
                   order by post_at limit least(greatest(coalesce(p_limit, 5), 1), 20) for update skip locked)
  returning s.*;
end $$;
revoke all on function public.claim_social_posts(text[], int) from public, anon, authenticated;

-- "Post now": the same claim for one post, whatever its time, for a person who may publish (called by the app with
-- the service role after it has checked the person's rights).
create or replace function public.claim_social_post(p_id uuid)
returns setof social_posts language plpgsql security definer set search_path = public as $$
begin
  return query
  update social_posts s set status = 'posting', attempts = s.attempts + 1, error = null, post_at = least(s.post_at, now())
   where s.id = (select id from social_posts where id = p_id and status in ('waiting', 'scheduled', 'failed') for update skip locked)
  returning s.*;
end $$;
revoke all on function public.claim_social_post(uuid) from public, anon, authenticated;

-- ---------- every 10 minutes: Supabase asks the app to post what is due ----------
create or replace function app.vault_secret(p_name text) returns text language plpgsql stable security definer set search_path = public as $$
declare k text;
begin
  if to_regclass('vault.decrypted_secrets') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into k using p_name;
  return nullif(trim(k), '');
exception when others then return null;
end $$;
revoke all on function app.vault_secret(text) from public, anon, authenticated;

create or replace function app.ping_social_publisher() returns bigint language plpgsql security definer set search_path = public as $$
declare k text := app.vault_secret('cron_secret'); rid bigint;
begin
  if k is null or to_regprocedure('net.http_get(text,jsonb,jsonb,integer)') is null then return null; end if;
  if not exists (select 1 from social_posts where status in ('waiting', 'scheduled', 'posting') and post_at <= now() and post_at > now() - interval '3 days') then return null; end if;
  execute 'select net.http_get(url := $1, params := $2, headers := $3, timeout_milliseconds := 60000)' into rid
    using rtrim(coalesce(app.vault_secret('app_url'), 'https://app.afrofoot.club'), '/') || '/api/social/publish', '{}'::jsonb,
          jsonb_build_object('Authorization', 'Bearer ' || k);
  return rid;
end $$;
revoke all on function app.ping_social_publisher() from public, anon, authenticated;

-- For Admin → Website → Social media: is the 10-minute job set up (never the secret itself).
create or replace function public.social_job_status() returns table (secret_set boolean, http_ready boolean, scheduled boolean)
language plpgsql stable security definer set search_path = public as $$
declare j boolean := false;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if to_regclass('cron.job') is not null then execute 'select exists (select 1 from cron.job where jobname = $1)' into j using 'afrofoot-social-publish'; end if;
  return query select app.vault_secret('cron_secret') is not null, to_regprocedure('net.http_get(text,jsonb,jsonb,integer)') is not null, j;
end $$;
revoke all on function public.social_job_status() from public, anon;
grant execute on function public.social_job_status() to authenticated;

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net; end if;
    perform cron.schedule('afrofoot-social-publish', '*/10 * * * *', 'select app.ping_social_publisher();');
  end if;
exception when others then raise notice 'Could not schedule the social media job (%). Enable pg_cron and pg_net under Database > Extensions and run this file again.', sqlerrm;
end $$;

-- automatic posting: off until an admin switches it on
insert into site_settings (key, value, is_public) values ('social_posting', '{"facebook": false, "instagram": false, "linkedin": false, "x": false}', false)
on conflict (key) do nothing;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.66.0','feature','Posting to Facebook, Instagram, LinkedIn and X',
  'Approved articles are posted to the club''s Facebook Page, Instagram, LinkedIn page and X account at their time, with the club''s picture. Admin → Website → Social media shows the connection, switches automatic posting on or off, and lists every post: posted (with a link), failed (with the reason and Retry), or waiting (Post now).','2026-11-22')
on conflict (version) do nothing;
