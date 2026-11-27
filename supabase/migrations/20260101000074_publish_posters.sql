-- 0074 Publish posters to the website and social media. Release 0.79.0.
-- The Matchday poster and the Player announcement page (new signing, farewell, open tryout) get a Publish button:
--  * a news article on the website with the poster as its picture (news_posts.cover_path, public-media/posters/published/),
--    a title and a short text written by the publisher;
--  * posts on the platforms chosen (Facebook, Instagram, LinkedIn, X), now or at a set time, with the poster itself as the
--    image (social_posts.image_path) and a caption per platform; the 10-minute publisher of migration 0071 sends them;
--  * an open tryout also goes on the club calendar (club_events, public), where club events are installed (0034).
-- Only people who may publish (admins, and the communications people of 0064) can do it. Safe to run more than once.
-- Needs social media posting (migration 0071).
do $$ begin
  if to_regprocedure('public.claim_social_posts(text[],integer)') is null then
    raise exception 'Social media posting is not installed in this database (migration 0071): install it first';
  end if;
end $$;

-- the poster as the post's image (only a published poster file); people cannot swap it afterwards
alter table social_posts add column if not exists image_path text;
alter table social_posts drop constraint if exists social_posts_image_path;
alter table social_posts add constraint social_posts_image_path check (image_path is null or image_path ~ '^posters/published/[0-9a-f-]{36}\.jpg$');
create or replace function app.guard_social_image() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.image_path is distinct from old.image_path then
    raise exception 'The picture of a social post cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function app.guard_social_image() from public, anon, authenticated;
drop trigger if exists guard_image on social_posts;
create trigger guard_image before update on social_posts for each row execute function app.guard_social_image();

/*
 * Publish a poster: the article, the social posts and (open tryout) the calendar event, in one go.
 *  p_kind: matchday | welcome | farewell | tryout;  p_image: posters/published/<uuid>.jpg (uploaded by the app first)
 *  p_platforms: facebook / instagram / linkedin / x;  p_captions: {platform: text}, "{link}" becomes the article's address
 *  p_post_at: null = now, else from now to 60 days ahead;  p_event (tryout): {starts_at, ends_at, place}
 * Returns the article's id.
 */
create or replace function public.publish_poster(p_kind text, p_title text, p_text text, p_image text, p_platforms text[], p_captions jsonb,
  p_post_at timestamptz default null, p_event jsonb default null, p_site_url text default 'https://www.afrofoot.club') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_title text := btrim(coalesce(p_title, '')); v_text text := btrim(coalesce(p_text, '')); v_base text; v_slug text; v_post uuid; v_link text;
        v_p text; v_cap text; n int := 1; v_start timestamptz; v_end timestamptz;
begin
  if not app.can_publish() then raise exception 'publishers only' using errcode = '42501'; end if;
  if coalesce(p_kind, '') not in ('matchday', 'welcome', 'farewell', 'tryout') then raise exception 'unknown poster' using errcode = '22023'; end if;
  if char_length(v_title) not between 3 and 160 then raise exception 'title: 3 to 160 characters' using errcode = '22023'; end if;
  if char_length(v_text) > 2000 then raise exception 'text: at most 2000 characters' using errcode = '22023'; end if;
  if coalesce(p_image, '') !~ '^posters/published/[0-9a-f-]{36}\.jpg$' then raise exception 'poster picture missing' using errcode = '22023'; end if;
  if p_platforms is not null and not (p_platforms <@ array['facebook', 'instagram', 'linkedin', 'x']) then raise exception 'unknown platform' using errcode = '22023'; end if;
  if p_post_at is not null and (p_post_at < now() - interval '1 hour' or p_post_at > now() + interval '60 days') then raise exception 'posting time: from now to 60 days ahead' using errcode = '22023'; end if;

  -- the article
  v_base := left(coalesce(nullif(app.slugify(v_title), ''), 'news'), 70);
  v_slug := v_base;
  while exists (select 1 from news_posts where slug = v_slug) loop n := n + 1; v_slug := v_base || '-' || n; end loop;
  insert into news_posts (slug, title, excerpt, body_md, cover_path, status, published_at, author_id)
  values (v_slug, v_title, nullif(left(regexp_replace(v_text, '\s+', ' ', 'g'), 300), ''), v_text, p_image, 'published', now(), auth.uid())
  returning id into v_post;
  v_link := rtrim(coalesce(nullif(p_site_url, ''), 'https://www.afrofoot.club'), '/') || '/news/' || v_slug;

  -- the social posts, with the poster as the picture
  foreach v_p in array coalesce((select array_agg(distinct x) from unnest(p_platforms) x where x is not null), '{}') loop
    v_cap := replace(coalesce(nullif(btrim(p_captions ->> v_p), ''), case when v_p = 'x' then left(v_title, 200) || ' {link}' else v_title || E'\n\n' || v_text || E'\n\n{link}' end), '{link}', v_link);
    if v_p = 'x' and char_length(v_cap) > 280 then raise exception 'x: at most 280 characters with the link' using errcode = '22023'; end if;
    insert into social_posts (news_post_id, platform, caption, status, post_at, image_path)
    values (v_post, v_p, left(v_cap, 2200), 'waiting', coalesce(p_post_at, now()), p_image);
  end loop;

  -- an open tryout on the club calendar (public), where club events are installed
  if p_kind = 'tryout' and p_event is not null and to_regclass('public.club_events') is not null then
    begin
      v_start := (p_event ->> 'starts_at')::timestamptz;
      v_end := coalesce(nullif(p_event ->> 'ends_at', '')::timestamptz, v_start + interval '90 minutes');
    exception when others then raise exception 'tryout: date and time' using errcode = '22023';
    end;
    if v_start is not null then
      execute 'insert into club_events (kind, title, starts_at, ends_at, public, description) values ($1, $2, $3, $4, true, $5)'
        using 'other', left(v_title, 120), v_start, v_end, left(concat_ws(E'\n', nullif(btrim(p_event ->> 'place'), ''), nullif(v_text, ''), v_link), 2000);
    end if;
  end if;
  return v_post;
end $$;
revoke all on function public.publish_poster(text, text, text, text, text[], jsonb, timestamptz, jsonb, text) from public, anon;
grant execute on function public.publish_poster(text, text, text, text, text[], jsonb, timestamptz, jsonb, text) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.79.0','feature','Publish posters',
  'The Matchday poster and the Player announcement page (new signing, farewell, open tryout) have a Publish button: a news article on the website with the poster as its picture, posts on the chosen social media now or at a set time with the poster as the image, and open tryouts on the club calendar.','2026-11-27')
on conflict (version) do nothing;
