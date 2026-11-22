-- 0071 Social media publishing (content assistant, step 2). Release 0.66.0.
-- The posts queued when an article is approved (social_posts, migration 0064) are now sent to the club's Facebook Page
-- and Instagram account by the app. TikTok stays queued ("waiting for the connection") for a later step.
--  * Admins switch automatic posting on or off per platform (site setting "social_posting", not public). The Facebook Page token
--    itself is a server setting on Vercel (META_PAGE_ACCESS_TOKEN), never stored in the database.
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
create index if not exists social_posts_due on social_posts (post_at) where status in ('waiting', 'scheduled');

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
insert into site_settings (key, value, is_public) values ('social_posting', '{"facebook": false, "instagram": false}', false)
on conflict (key) do nothing;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.66.0','feature','Posting to Facebook and Instagram',
  'Approved articles are posted to the club''s Facebook Page and Instagram account at their time, with the club''s picture. Admin → Website → Social media shows the connection, switches automatic posting on or off, and lists every post: posted (with a link), failed (with the reason and Retry), or waiting (Post now).','2026-11-22')
on conflict (version) do nothing;
