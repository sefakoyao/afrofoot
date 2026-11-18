-- 0048 Emails from the club: reply deadlines and reminders, the approval email, request alerts (release 0.36.0).
-- Everything is sent from the database, so no app or website needs an all-access key:
--  * email_outbox: every email to send. Triggers and a daily job add to it; a job every 2 minutes sends it through
--    Resend (pg_net) with the key kept in Supabase Vault (secret "resend_api_key"), then records Resend's answer.
--    Without the key nothing is sent: emails wait (at most 2 days) until the key is added.
--  * Reply deadline (reply_by) on trainings and games, set automatically: trainings the day before at 20:00, games two
--    days before at 20:00 (Helsinki time); coaches can change it. A player's own reply closes at the deadline.
--  * Reminders to players who have not replied: 3 days before the deadline and on the deadline day (morning), once
--    each; never to players without an email address, who switched reminders off, or who are blocked by overdue fees.
--  * The approval email when an account becomes active, in the member's language.
--  * An alert to the club (info@afrofoot.club) for each new website request (tryout, enrolment, invoice, message).
-- Settings (sender, reply-to, alert address, links): site_settings key "email" (not public), editable by admins.

-- ---------- extensions (present on Supabase; skipped where they are not, e.g. a plain Postgres for tests) ----------
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net; end if;
exception when others then raise notice 'pg_net not enabled (%): emails stay queued.', sqlerrm;
end $$;

-- ---------- reply deadline ----------
alter table training_sessions add column reply_by timestamptz;
alter table matches add column reply_by timestamptz;
alter table training_sessions add constraint training_reply_by_before_start check (reply_by is null or reply_by <= starts_at) not valid;
alter table matches add constraint match_reply_by_before_kickoff check (reply_by is null or reply_by <= kickoff_at) not valid;

-- The default deadline: N days before the event's day, at 20:00 Helsinki time (never after the start).
create or replace function app.default_reply_by(p_start timestamptz, p_days int) returns timestamptz language sql immutable as $$
  select least(p_start, ((((p_start at time zone 'Europe/Helsinki')::date - p_days)::timestamp + time '20:00') at time zone 'Europe/Helsinki'))
$$;
-- Each table in its own branch: a PL/pgSQL expression may only name columns the row has.
create or replace function app.set_reply_by() returns trigger language plpgsql as $$
declare v_start timestamptz; v_old timestamptz; v_days int;
begin
  if tg_table_name = 'matches' then
    v_start := new.kickoff_at; v_days := 2;
    if tg_op = 'UPDATE' then v_old := old.kickoff_at; end if;
  else
    v_start := new.starts_at; v_days := 1;
    if tg_op = 'UPDATE' then v_old := old.starts_at; end if;
  end if;
  -- set when missing; follow the event when it moves and the deadline was the automatic one or is now after the start
  if new.reply_by is null
     or (tg_op = 'UPDATE' and v_start is distinct from v_old and (old.reply_by is not distinct from app.default_reply_by(v_old, v_days) or new.reply_by > v_start)) then
    new.reply_by := app.default_reply_by(v_start, v_days);
  end if;
  return new;
end $$;
create trigger set_reply_by before insert or update on training_sessions for each row execute function app.set_reply_by();
create trigger set_reply_by before insert or update on matches for each row execute function app.set_reply_by();
update training_sessions set reply_by = app.default_reply_by(starts_at, 1) where reply_by is null;
update matches set reply_by = app.default_reply_by(kickoff_at, 2) where reply_by is null;

-- The player calendar view (0034) with the deadline at the end.
create or replace view team_schedule with (security_invoker = true) as
select s.id, 'practice'::text as event_type, s.team_season_id, s.title, null::text as division, s.starts_at, s.ends_at, s.location_id, s.status::text as status,
       s.meet_at, s.meeting_point, null::text as kind, null::text as description, s.reply_by
from training_sessions s
union all
select m.id, m.event_type::text, m.team_season_id, m.opponent, m.division, m.kickoff_at, m.kickoff_at + interval '2 hours', m.location_id, m.status::text,
       m.meet_at, m.meeting_point, null, null, m.reply_by
from matches m
union all
select e.id, 'event', e.team_season_id, e.title, null, e.starts_at, e.ends_at, e.location_id, e.status,
       e.meet_at, e.meeting_point, e.kind, e.description, null::timestamptz
from club_events e;

-- One's own reply closes at the deadline (0045 closed it at the start); coaches and admins may still correct it.
create or replace function app.guard_event_reply() returns trigger language plpgsql security definer set search_path = public as $$
declare v_close timestamptz; v_status text; v_self boolean;
begin
  if new.availability is not distinct from old.availability and new.note is not distinct from old.note then
    new.responded_at := old.responded_at;
    return new;
  end if;
  new.responded_at := case when new.availability = 'pending' then null else now() end;
  v_self := exists (select 1 from players p where p.id = new.player_id and p.profile_id = auth.uid());
  if not v_self or app.is_admin() then return new; end if;
  if tg_table_name = 'session_attendance' then
    select least(coalesce(s.reply_by, s.starts_at), s.starts_at), s.status::text into v_close, v_status from training_sessions s where s.id = new.session_id;
  else
    select least(coalesce(m.reply_by, m.kickoff_at), m.kickoff_at), m.status::text into v_close, v_status from matches m where m.id = new.match_id;
  end if;
  if v_status is distinct from 'scheduled' or v_close <= now() then
    raise exception 'Replies are closed for this event' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ---------- preferences and settings ----------
alter table profiles add column reminder_emails boolean not null default true;
comment on column profiles.reminder_emails is 'The member wants reply reminders by email (My profile). Migration 0048.';
insert into site_settings (key, value, is_public) values ('email', jsonb_build_object(
  'from', 'Afro Foot Club <noreply@afrofoot.club>', 'reply_to', 'info@afrofoot.club', 'alert_to', 'info@afrofoot.club',
  'app_url', 'https://app.afrofoot.club', 'api_url', 'https://api.resend.com/emails'), false)
on conflict (key) do nothing;

-- ---------- templates (subject, text, button) per kind and language ----------
create table email_templates (
  kind text not null check (kind in ('reminder_3d', 'reminder_last', 'approved', 'request_alert', 'label_game')),
  locale text not null check (locale in ('en', 'fi', 'fr', 'ar')),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) <= 4000),
  cta text check (char_length(cta) <= 60),
  primary key (kind, locale)
);
alter table email_templates enable row level security;
create policy admin_all on email_templates for all to authenticated using (app.is_admin()) with check (app.is_admin());
insert into email_templates (kind, locale, subject, body, cta) values
 ('reminder_3d', 'en', 'Are you in? {event}, {when}', E'Hi {name},\n\n{event} is on {when}. Please tell your coach if you are coming: reply by {reply_by}.', 'Reply in the app'),
 ('reminder_3d', 'fi', 'Tuletko? {event}, {when}', E'Hei {name},\n\n{event} on {when}. Kerro valmentajalle, tuletko: vastaa viimeistään {reply_by}.', 'Vastaa sovelluksessa'),
 ('reminder_3d', 'fr', 'Tu viens ? {event}, {when}', E'Bonjour {name},\n\n{event} a lieu le {when}. Dis à ton entraîneur si tu viens : réponds avant le {reply_by}.', 'Répondre dans l’app'),
 ('reminder_3d', 'ar', 'هل ستحضر؟ {event}، {when}', E'مرحبًا {name}،\n\n{event} في {when}. أخبر مدربك إن كنت ستحضر: ردّ قبل {reply_by}.', 'الرد في التطبيق'),
 ('reminder_last', 'en', 'Last day to reply: {event}, {when}', E'Hi {name},\n\nToday is the last day to tell your coach if you are coming to {event} on {when}. Replies close at {reply_by}.', 'Reply now'),
 ('reminder_last', 'fi', 'Viimeinen päivä vastata: {event}, {when}', E'Hei {name},\n\nTänään on viimeinen päivä kertoa, tuletko: {event}, {when}. Vastaukset sulkeutuvat {reply_by}.', 'Vastaa nyt'),
 ('reminder_last', 'fr', 'Dernier jour pour répondre : {event}, {when}', E'Bonjour {name},\n\nAujourd’hui est le dernier jour pour dire si tu viens : {event}, le {when}. Les réponses ferment le {reply_by}.', 'Répondre maintenant'),
 ('reminder_last', 'ar', 'آخر يوم للرد: {event}، {when}', E'مرحبًا {name}،\n\nاليوم آخر يوم لتخبر مدربك إن كنت ستحضر {event} في {when}. تُغلق الردود في {reply_by}.', 'ردّ الآن'),
 ('approved', 'en', 'Welcome to Afro Foot Club: your account is approved', E'Hi {name},\n\nYour account in the Afro Foot Club app is approved. You can now sign in to see your calendar, reply to trainings and games, and find your membership and contract.', 'Sign in'),
 ('approved', 'fi', 'Tervetuloa Afro Foot Clubiin: tilisi on hyväksytty', E'Hei {name},\n\nTilisi Afro Foot Clubin sovelluksessa on hyväksytty. Voit nyt kirjautua: näet kalenterisi, voit vastata harjoituksiin ja otteluihin sekä löydät jäsenyytesi ja sopimuksesi.', 'Kirjaudu'),
 ('approved', 'fr', 'Bienvenue à Afro Foot Club : ton compte est validé', E'Bonjour {name},\n\nTon compte dans l’app Afro Foot Club est validé. Tu peux te connecter pour voir ton calendrier, répondre aux entraînements et aux matchs, et trouver ton adhésion et ton contrat.', 'Se connecter'),
 ('approved', 'ar', 'مرحبًا بك في Afro Foot Club: تمت الموافقة على حسابك', E'مرحبًا {name}،\n\nتمت الموافقة على حسابك في تطبيق Afro Foot Club. يمكنك الآن تسجيل الدخول لرؤية تقويمك والرد على التدريبات والمباريات والاطلاع على عضويتك وعقدك.', 'تسجيل الدخول'),
 ('request_alert', 'en', 'New {kind}: {name}', E'A new {kind} arrived from the website: {name}.\n\nOpen it in Admin → Requests.', 'Open the request'),
 ('label_game', 'en', 'Game vs {opponent}', '', null),
 ('label_game', 'fi', 'Ottelu vs {opponent}', '', null),
 ('label_game', 'fr', 'Match contre {opponent}', '', null),
 ('label_game', 'ar', 'مباراة ضد {opponent}', '', null);

-- ---------- outbox ----------
create table email_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('reminder_3d', 'reminder_last', 'approved', 'request_alert')),
  ref_id uuid not null,                         -- the event, profile or request it is about
  profile_id uuid references profiles(id) on delete cascade,
  to_email citext not null check (char_length(to_email) <= 200),
  locale text not null default 'en',
  subject text not null, body_text text not null, body_html text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed', 'expired')),
  request_id bigint, error text check (char_length(error) <= 400),
  created_at timestamptz not null default now(), sent_at timestamptz,
  unique (kind, ref_id, to_email)               -- each email at most once
);
create index on email_outbox (status, created_at);
alter table email_outbox enable row level security;
create policy admin_read on email_outbox for select to authenticated using (app.is_admin());
revoke all on email_outbox from anon;

-- {key} placeholders filled from a json object
create or replace function app.fill(p_text text, p_vars jsonb) returns text language plpgsql immutable as $$
declare k text; v text; r text := coalesce(p_text, '');
begin
  for k, v in select key, value from jsonb_each_text(p_vars) loop r := replace(r, '{' || k || '}', coalesce(v, '')); end loop;
  return r;
end $$;
create or replace function app.html_escape(p text) returns text language sql immutable as
$$ select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;') $$;

-- Queues one email from a template (falls back to English); returns false when it was queued before.
create or replace function app.queue_email(p_kind text, p_to text, p_locale text, p_vars jsonb, p_ref uuid, p_profile uuid, p_link text)
returns boolean language plpgsql security definer set search_path = public as $$
declare tpl email_templates; v_locale text := case when p_locale in ('en', 'fi', 'fr', 'ar') then p_locale else 'en' end;
        v_subject text; v_text text; v_html text; n int;
begin
  if p_to is null or p_to !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return false; end if;
  select * into tpl from email_templates where kind = p_kind and locale = v_locale;
  if not found then v_locale := 'en'; select * into tpl from email_templates where kind = p_kind and locale = 'en'; end if;
  if not found then return false; end if;
  v_subject := app.fill(tpl.subject, p_vars);
  v_text := app.fill(tpl.body, p_vars) || case when p_link is not null then E'\n\n' || coalesce(tpl.cta, '') || ': ' || p_link else '' end
            || E'\n\n– Afro Foot Club';
  v_html := '<div dir="' || case when v_locale = 'ar' then 'rtl' else 'ltr' end || '" style="font-family:Figtree,Arial,sans-serif;font-size:15px;line-height:1.55;color:#101510;max-width:560px">'
            || '<div style="height:6px;background:linear-gradient(90deg,#3DAF2C,#EDF70F);border-radius:3px;margin-bottom:18px"></div>'
            || replace(app.html_escape(app.fill(tpl.body, p_vars)), E'\n', '<br>')
            || case when p_link is not null then '<p style="margin:22px 0"><a href="' || app.html_escape(p_link) || '" style="background:#3DAF2C;color:#101510;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:700">' || app.html_escape(coalesce(tpl.cta, p_link)) || '</a></p>' else '' end
            || '<p style="color:#5D675F;font-size:13px">Afro Foot Club ry</p></div>';
  insert into email_outbox (kind, ref_id, profile_id, to_email, locale, subject, body_text, body_html)
  values (p_kind, p_ref, p_profile, p_to, v_locale, v_subject, v_text, v_html)
  on conflict (kind, ref_id, to_email) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function app.queue_email(text, text, text, jsonb, uuid, uuid, text) from public, anon, authenticated;

create or replace function app.email_setting(p_key text) returns text language sql stable security definer set search_path = public as
$$ select value ->> p_key from site_settings where key = 'email' $$;

-- ---------- reminders (daily) ----------
-- For trainings and games with a deadline today (last call) or in 3 days, to roster players who have not replied.
create or replace function app.queue_reminders(p_now timestamptz default now()) returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_today date := (p_now at time zone 'Europe/Helsinki')::date; v_app text := coalesce(app.email_setting('app_url'), 'https://app.afrofoot.club');
begin
  for r in
    with ev as (
      select s.id, 'practice' as type, s.team_season_id, s.title as label, s.starts_at, s.reply_by from training_sessions s
       where s.status = 'scheduled' and s.reply_by > p_now
      union all
      select m.id, 'game', m.team_season_id, m.opponent, m.kickoff_at, m.reply_by from matches m
       where m.status = 'scheduled' and m.reply_by > p_now
    ), due as (
      select ev.*, case when (ev.reply_by at time zone 'Europe/Helsinki')::date = v_today then 'reminder_last'
                        when (ev.reply_by at time zone 'Europe/Helsinki')::date = v_today + 3 then 'reminder_3d' end as kind
      from ev
    ), pending as (
      select d.*, a.player_id from due d join session_attendance a on a.session_id = d.id and a.availability = 'pending' where d.kind is not null and d.type = 'practice'
      union all
      select d.*, a.player_id from due d join match_availability a on a.match_id = d.id and a.availability = 'pending' where d.kind is not null and d.type = 'game'
    )
    select p.*, pr.id as profile_id, pr.email, pr.first_name, pr.locale
    from pending p
    join players pl on pl.id = p.player_id
    join profiles pr on pr.id = pl.profile_id
    join team_players tp on tp.player_id = p.player_id and tp.team_season_id = p.team_season_id and tp.left_on is null
    where pr.status = 'active' and pr.email is not null and pr.reminder_emails and not app.player_blocked(pr.id)
  loop
    if app.queue_email(r.kind, r.email, r.locale, jsonb_build_object(
         'name', r.first_name,
         'event', case when r.type = 'game' then app.fill((select subject from email_templates where kind = 'label_game' and locale = case when r.locale in ('en','fi','fr','ar') then r.locale else 'en' end), jsonb_build_object('opponent', r.label)) else r.label end,
         'when', to_char(r.starts_at at time zone 'Europe/Helsinki', 'DD.MM.YYYY HH24:MI'),
         'reply_by', to_char(r.reply_by at time zone 'Europe/Helsinki', 'DD.MM.YYYY HH24:MI')),
       r.id, r.profile_id, v_app || '/me?m=' || to_char(r.starts_at at time zone 'Europe/Helsinki', 'YYYY-MM') || '#ev-' || r.id) then
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function app.queue_reminders(timestamptz) from public, anon, authenticated;

-- ---------- approval email ----------
create or replace function app.email_on_approval() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'active' and new.email is not null then
    perform app.queue_email('approved', new.email, new.locale, jsonb_build_object('name', coalesce(nullif(new.first_name, ''), '')), new.id, new.id,
      coalesce(app.email_setting('app_url'), 'https://app.afrofoot.club') || '/login');
  end if;
  return new;
end $$;
create trigger email_on_approval after update of status on profiles for each row execute function app.email_on_approval();

-- ---------- request alerts to the club ----------
create or replace function app.email_on_request() returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text; v_name text; v_to text := coalesce(app.email_setting('alert_to'), 'info@afrofoot.club');
begin
  v_kind := case tg_table_name when 'tryout_requests' then 'tryout request' when 'player_enrolments' then 'team enrolment'
                               when 'invoice_requests' then 'invoice request' else 'message' end;
  v_name := case tg_table_name when 'invoice_requests' then to_jsonb(new) ->> 'full_name' when 'contact_messages' then to_jsonb(new) ->> 'name'
                 else concat_ws(' ', to_jsonb(new) ->> 'first_name', to_jsonb(new) ->> 'last_name') end;
  if tg_table_name = 'contact_messages' and to_jsonb(new) ->> 'topic' = 'partnership' then v_kind := 'sponsor enquiry'; end if;
  perform app.queue_email('request_alert', v_to, 'en', jsonb_build_object('kind', v_kind, 'name', v_name), new.id, null,
    coalesce(app.email_setting('app_url'), 'https://app.afrofoot.club') || '/admin/requests');
  return new;
end $$;
create trigger email_on_request after insert on tryout_requests for each row execute function app.email_on_request();
create trigger email_on_request after insert on player_enrolments for each row execute function app.email_on_request();
create trigger email_on_request after insert on invoice_requests for each row execute function app.email_on_request();
create trigger email_on_request after insert on contact_messages for each row execute function app.email_on_request();

-- ---------- sending (Resend through pg_net, key from Supabase Vault) ----------
create or replace function app.resend_key() returns text language plpgsql stable security definer set search_path = public as $$
declare k text;
begin
  if to_regclass('vault.decrypted_secrets') is null then return null; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into k using 'resend_api_key';
  return nullif(trim(k), '');
exception when others then return null;
end $$;
revoke all on function app.resend_key() from public, anon, authenticated;

create or replace function app.send_outbox() returns int language plpgsql security definer set search_path = public as $$
declare r email_outbox; k text := app.resend_key(); rid bigint; n int := 0;
begin
  update email_outbox set status = 'expired' where status = 'queued' and created_at < now() - interval '2 days';
  if k is null or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return 0; end if;
  for r in select * from email_outbox where status = 'queued' order by created_at limit 50 for update skip locked loop
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 15000)' into rid
      using coalesce(app.email_setting('api_url'), 'https://api.resend.com/emails'),
            jsonb_build_object('from', coalesce(app.email_setting('from'), 'Afro Foot Club <noreply@afrofoot.club>'), 'to', jsonb_build_array(r.to_email),
              'reply_to', coalesce(app.email_setting('reply_to'), 'info@afrofoot.club'), 'subject', r.subject, 'text', r.body_text, 'html', r.body_html),
            jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json');
    update email_outbox set status = 'sent', request_id = rid, sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function app.send_outbox() from public, anon, authenticated;

-- Resend's answers: 2xx = delivered to Resend, anything else = failed (with the reason, never the key).
create or replace function app.check_outbox() returns int language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if to_regclass('net._http_response') is null then return 0; end if;
  execute $q$
    update email_outbox o set status = case when r.status_code between 200 and 299 then 'delivered' else 'failed' end,
      error = case when r.status_code between 200 and 299 then null else left(coalesce(r.error_msg, r.content, 'HTTP ' || r.status_code), 400) end
    from net._http_response r where r.id = o.request_id and o.status = 'sent' and (r.status_code is not null or r.error_msg is not null) $q$;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app.check_outbox() from public, anon, authenticated;

-- For Admin → overview: is sending set up, and how did the last 7 days go (never the key itself).
create or replace function public.email_status() returns table (key_set boolean, sender_ready boolean, queued bigint, delivered bigint, failed bigint, last_error text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query select app.resend_key() is not null, to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null,
    (select count(*) from email_outbox where status in ('queued', 'sent')),
    (select count(*) from email_outbox where status = 'delivered' and created_at > now() - interval '7 days'),
    (select count(*) from email_outbox where status = 'failed' and created_at > now() - interval '7 days'),
    (select o.error from email_outbox o where o.status = 'failed' order by o.created_at desc limit 1);
end $$;
revoke all on function public.email_status() from public, anon;
grant execute on function public.email_status() to authenticated;

-- ---------- schedules (Supabase pg_cron) ----------
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('afrofoot-email-send', '*/2 * * * *', 'select app.send_outbox(); select app.check_outbox();');
    perform cron.schedule('afrofoot-email-reminders', '5 6 * * *', 'select app.queue_reminders();');   -- 08:05 / 09:05 Helsinki
  end if;
exception when others then raise notice 'Could not schedule the email jobs (%). Enable pg_cron under Database > Extensions and run this file again.', sqlerrm;
end $$;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.36.0','feature','Reply deadlines, reminders and club emails',
  'Trainings and games have a reply deadline; players who have not replied get an email reminder 3 days before and on the last day. New members get an email when their account is approved, and the club gets an email for each new website request.','2026-11-18')
on conflict (version) do nothing;
