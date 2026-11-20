-- 0063 Past-season invoices (release 0.54.0). Safe to run again.
-- Admin → Finance → Past seasons: bill players for a season afterwards. The admin picks the season, the first and last
-- month (e.g. January–October 2025), the monthly fee, the invoice date, the due date and the players; each player gets
-- one invoice with one line per month (like the automatic invoices), marked as a season invoice of that season. A player
-- who already has a season invoice for any of those months is skipped, so running it twice bills nobody twice.
-- mark_invoices_paid() records several invoices as paid in full at once (through record_invoice_payment, 0056).
-- Players see these invoices like any other (Membership → My payments) and they count in Finance → Balances.

create or replace function public.create_season_invoices(p_season uuid, p_from date, p_to date, p_monthly_cents int, p_players uuid[],
  p_due date, p_issue date default null, p_description text default 'Membership fees')
returns table (created int, skipped int)
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Europe/Helsinki')::date;
  v_from date := date_trunc('month', p_from)::date; v_to date := date_trunc('month', p_to)::date;
  v_months int; v_desc text := btrim(coalesce(p_description, '')); v_issue date := coalesce(p_issue, (now() at time zone 'Europe/Helsinki')::date);
  v_player uuid; v_pay uuid; i int; n int := 0; s int := 0;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if not exists (select 1 from seasons where id = p_season) then raise exception 'unknown season' using errcode = '22023'; end if;
  if v_from is null or v_to is null or v_to < v_from then raise exception 'the last month is before the first' using errcode = '22023'; end if;
  v_months := (extract(year from v_to) - extract(year from v_from))::int * 12 + (extract(month from v_to) - extract(month from v_from))::int + 1;
  if v_months > 24 then raise exception 'at most 24 months' using errcode = '22023'; end if;
  if p_monthly_cents is null or p_monthly_cents < 1 or p_monthly_cents > 100000 then raise exception 'monthly fee between EUR 0.01 and 1000' using errcode = '22023'; end if;
  if p_due is null or p_due < v_today - 365 or p_due > v_today + 365 then raise exception 'due date within a year' using errcode = '22023'; end if;
  if v_issue > v_today or v_issue < v_today - 3650 or v_issue > p_due then raise exception 'invoice date: not in the future, not after the due date' using errcode = '22023'; end if;
  if char_length(v_desc) not between 3 and 60 then raise exception 'description 3–60 characters' using errcode = '22023'; end if;
  if p_players is null or cardinality(p_players) not between 1 and 300 then raise exception '1 to 300 players' using errcode = '22023'; end if;

  foreach v_player in array (select array_agg(distinct x) from unnest(p_players) x) loop
    if not exists (select 1 from players where id = v_player) then raise exception 'unknown player' using errcode = '22023'; end if;
    -- already billed for one of these months of this season: skipped
    if exists (select 1 from payments p join payment_lines l on l.payment_id = p.id
               where p.player_id = v_player and p.season_id = p_season and p.notes = 'season invoice' and p.status <> 'refunded'
                 and l.line_date between v_from and v_to) then
      s := s + 1; continue;
    end if;
    insert into payments (player_id, amount_cents, method, status, due_on, invoice_sent_at, notes, season_id, recorded_by)
    values (v_player, p_monthly_cents * v_months, 'invoice', 'pending', p_due,
            case when v_issue = v_today then now() else (v_issue + time '12:00') at time zone 'Europe/Helsinki' end,
            'season invoice', p_season, auth.uid())
    returning id into v_pay;
    for i in 0 .. v_months - 1 loop
      insert into payment_lines (payment_id, position, description, line_date, unit_price_cents, kind)
      values (v_pay, i + 1, v_desc, (v_from + make_interval(months => i))::date, p_monthly_cents, 'fee');
    end loop;
    n := n + 1;
  end loop;
  return query select n, s;
end $$;
revoke all on function public.create_season_invoices(uuid, date, date, int, uuid[], date, date, text) from public, anon;
grant execute on function public.create_season_invoices(uuid, date, date, int, uuid[], date, date, text) to authenticated;

-- Several invoices paid in full on one day (what is still owed on each); invoices already paid are left as they are.
create or replace function public.mark_invoices_paid(p_payments uuid[], p_paid_on date default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_id uuid; n int := 0;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_payments is null or cardinality(p_payments) not between 1 and 300 then raise exception '1 to 300 invoices' using errcode = '22023'; end if;
  foreach v_id in array (select array_agg(distinct x) from unnest(p_payments) x) loop
    if exists (select 1 from payments where id = v_id and status in ('pending', 'failed') and amount_cents > paid_cents) then
      perform public.record_invoice_payment(v_id, null, p_paid_on, 'marked paid with others');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.mark_invoices_paid(uuid[], date) from public, anon;
grant execute on function public.mark_invoices_paid(uuid[], date) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.54.0','feature','Past-season invoices',
  'Admin → Finance → Past seasons: bill chosen players for a season afterwards (first and last month, monthly fee, invoice and due date): one invoice per player with a line per month. Mark several as paid at once and see what is paid and still owed per player. Players see these invoices on their page.','2026-11-20')
on conflict (version) do nothing;
