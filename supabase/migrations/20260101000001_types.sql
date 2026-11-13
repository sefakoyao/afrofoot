-- Afro Foot 2.0 — 0001 types and shared helpers (no table dependencies)
create extension if not exists citext;
create schema if not exists app;
grant usage on schema app to anon, authenticated;

create type user_role        as enum ('super_admin','club_admin','coach','player');
create type account_status   as enum ('pending','active','suspended');
create type player_status    as enum ('prospect','active','inactive','alumni');
create type player_position  as enum ('goalkeeper','defender','midfielder','forward');
create type preferred_foot   as enum ('right','left','both');
create type staff_type       as enum ('head_coach','assistant_coach','goalkeeper_coach','manager','physio','analyst','board','other');
create type session_status   as enum ('scheduled','completed','cancelled');
create type match_status     as enum ('scheduled','played','postponed','cancelled');
create type home_away        as enum ('home','away','neutral');
create type competition_type as enum ('league','cup','friendly','tournament');
create type response_status  as enum ('pending','yes','no','maybe');
create type attendance_status as enum ('present','late','absent','excused');
create type squad_status     as enum ('starter','substitute','not_selected');
create type membership_status as enum ('pending','active','expired','cancelled');
create type payment_method   as enum ('cash','bank_transfer','mobilepay','card','other');
create type payment_status   as enum ('pending','paid','failed','refunded');
create type plan_period      as enum ('month','season','year','one_off');
create type audience_type    as enum ('everyone','players','coaches','team');
create type content_status   as enum ('draft','published','archived');
create type request_status   as enum ('new','in_review','accepted','declined','archived');

create function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
