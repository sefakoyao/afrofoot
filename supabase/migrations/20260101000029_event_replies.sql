-- 0029 Event replies: players sign in (yes) or out (no) for trainings, matches and friendlies from their calendar.
-- The rows already exist (seeded from the roster, migration 0007) and players may update their own (policies
-- attendance_self_update / mavail_self_update, columns limited by app.restrict_columns). This adds the rules the
-- database did not enforce yet: a player may only answer before the event starts and while it is still scheduled,
-- and the answer time is always set by the database.

create function app.guard_event_reply() returns trigger language plpgsql security definer set search_path = public as $$
declare v_start timestamptz; v_status text; v_self boolean;
begin
  if new.availability is not distinct from old.availability and new.note is not distinct from old.note then
    new.responded_at := old.responded_at; -- the answer time follows the answer and cannot be set on its own
    return new;
  end if;
  new.responded_at := case when new.availability = 'pending' then null else now() end;
  -- Coaches and admins may correct answers at any time (e.g. a player who called in).
  v_self := exists (select 1 from players p where p.id = new.player_id and p.profile_id = auth.uid());
  if not v_self or app.is_admin() or app.role() = 'coach' then return new; end if;
  if tg_table_name = 'session_attendance' then
    select s.starts_at, s.status::text into v_start, v_status from training_sessions s where s.id = new.session_id;
  else
    select m.kickoff_at, m.status::text into v_start, v_status from matches m where m.id = new.match_id;
  end if;
  if v_status is distinct from 'scheduled' or v_start <= now() then
    raise exception 'Replies are closed for this event' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger guard_reply before update on session_attendance for each row execute function app.guard_event_reply();
create trigger guard_reply before update on match_availability for each row execute function app.guard_event_reply();
