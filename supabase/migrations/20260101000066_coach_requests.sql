-- 0066 Coaches see tryout requests and team enrolments (read only). Coaches and player-coaches (app.is_coach) get the
-- details they need to plan a tryout and welcome a new player: name, birth date, position, previous team, Palloliitto
-- link, contact and guardian details, the message, the status and the tryout date. Not the home address, payment
-- choice, consents or the admins' internal note. The tables stay admins-only (RLS admin_all); this function is the
-- coaches' only way in, and it changes nothing. Admins still handle the requests (Admin → Requests).
create or replace function public.coach_requests(p_all boolean default false)
returns table (kind text, id uuid, created_at timestamptz, status text, first_name text, last_name text, date_of_birth date,
  email text, phone text, "position" text, nationality text, previous_team text, palloliitto_url text, guardian_name text,
  guardian_phone text, message text, tryout_on date, plan text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'tryout'::text, r.id, r.created_at, r.status::text, r.first_name, r.last_name, r.date_of_birth, r.email::text, r.phone,
      r.position::text, null::text, r.previous_team, r.palloliitto_url, r.guardian_name, r.guardian_phone, r.message, r.tryout_on, null::text
    from tryout_requests r where p_all or r.status::text in ('new', 'in_review', 'accepted')
    union all
    select 'enrolment', e.id, e.created_at, e.status::text, e.first_name, e.last_name, e.date_of_birth, e.email::text, e.phone,
      e.position::text, e.nationality, e.previous_team, e.palloliitto_url, e.guardian_name, e.guardian_phone, null, null, mp.name
    from player_enrolments e left join membership_plans mp on mp.id = e.plan_id where p_all or e.status::text in ('new', 'in_review', 'accepted')
  ) x where app.is_coach() or app.is_admin()
  order by 3 desc
  limit 300
$$;
revoke all on function public.coach_requests(boolean) from public, anon;
grant execute on function public.coach_requests(boolean) to authenticated;
