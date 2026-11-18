-- 0054 Finance: player balances, income projection, season budget and expenses (release 0.43.0).
-- Admin → Finance groups everything about money: an overview for a season (income projected from player invoices,
-- budgeted and actual costs per category, the expected result), each player's balance, the invoices, and the expenses.
-- An invoice belongs to a season through its membership; an invoice without a membership by its due date.
-- Cost categories: team fees, field booking, kits, league fees, licences, other (the unused 0005 categories are mapped).

-- ===== Cost categories =====
alter table expenses drop constraint if exists expenses_category_check;
update expenses set category = case category when 'equipment' then 'kits' when 'pitch' then 'field_booking' when 'league_fees' then 'league_fees' else 'other' end;
alter table expenses
  add constraint expenses_category_check check (category in ('team_fees', 'field_booking', 'kits', 'league_fees', 'licences', 'other')),
  add constraint expenses_amount_max check (amount_cents <= 10000000),
  add constraint expenses_description_len check (description is null or char_length(description) between 1 and 200);
create index if not exists expenses_season_idx on expenses (season_id, incurred_on);

-- ===== Budget: one planned amount per season and category =====
create table season_budgets (
  season_id uuid not null references seasons(id) on delete cascade,
  category text not null check (category in ('team_fees', 'field_booking', 'kits', 'league_fees', 'licences', 'other')),
  amount_cents int not null check (amount_cents between 0 and 10000000),
  note text check (note is null or char_length(note) between 1 and 200),
  updated_at timestamptz not null default now(),
  primary key (season_id, category)
);
alter table season_budgets enable row level security;
create policy admin_all on season_budgets for all to authenticated using (app.is_admin()) with check (app.is_admin());
revoke all on season_budgets from anon;
create trigger audit after insert or update or delete on season_budgets for each row execute function app.audit();

-- ===== Which season an invoice belongs to =====
create function app.payment_in_season(p payments, s seasons) returns boolean language sql stable as $$
  select case when p.membership_id is not null then exists (select 1 from memberships m where m.id = p.membership_id and m.season_id = s.id)
              else coalesce(p.due_on, p.created_at::date) between s.starts_on and s.ends_on end
$$;

-- ===== Each player's balance (admins) =====
-- invoiced / paid / open / overdue for the season, plus everything still unpaid from any season (balance).
create function public.finance_balances(p_season uuid) returns table (
  player_id uuid, first_name text, last_name text, invoiced_cents bigint, paid_cents bigint, open_cents bigint, overdue_cents bigint,
  balance_cents bigint, oldest_due date, last_paid_at timestamptz, invoices int)
language plpgsql stable security definer set search_path = public as $$
declare s seasons; v_today date := (now() at time zone 'Europe/Helsinki')::date;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into s from seasons where id = p_season;
  if s.id is null then raise exception 'unknown season' using errcode = '22023'; end if;
  return query
  with mine as (
    select p.*, app.payment_in_season(p, s) as in_season from payments p where p.status in ('pending', 'failed', 'paid')
  )
  select pl.id, pl.first_name, pl.last_name,
         coalesce(sum(m.amount_cents) filter (where m.in_season), 0)::bigint,
         coalesce(sum(m.amount_cents) filter (where m.in_season and m.status = 'paid'), 0)::bigint,
         coalesce(sum(m.amount_cents) filter (where m.in_season and m.status <> 'paid' and (m.due_on is null or m.due_on >= v_today)), 0)::bigint,
         coalesce(sum(m.amount_cents) filter (where m.in_season and m.status <> 'paid' and m.due_on < v_today), 0)::bigint,
         coalesce(sum(m.amount_cents) filter (where m.status <> 'paid'), 0)::bigint,
         min(m.due_on) filter (where m.status <> 'paid'),
         max(m.paid_at),
         (count(m.id) filter (where m.in_season))::int
  from players pl
  left join mine m on m.player_id = pl.id
  where exists (select 1 from memberships ms where ms.player_id = pl.id and ms.season_id = s.id) or exists (select 1 from mine x where x.player_id = pl.id and (x.in_season or x.status <> 'paid'))
  group by pl.id, pl.first_name, pl.last_name;
end $$;
revoke all on function public.finance_balances(uuid) from public, anon;
grant execute on function public.finance_balances(uuid) to authenticated;

-- ===== Income projection for a season (admins) =====
-- collected (paid), outstanding (issued, unpaid; of which overdue) and scheduled: the invoices the nightly job will
-- still issue for active, automatically renewed memberships of the season up to its end (same rules as 0027), by month.
create function public.finance_projection(p_season uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s seasons; v_today date := (now() at time zone 'Europe/Helsinki')::date; m record; d date; step int; n int;
        v_sched jsonb := '{}'::jsonb; v_sched_total bigint := 0; v_sched_count int := 0; k text;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into s from seasons where id = p_season;
  if s.id is null then raise exception 'unknown season' using errcode = '22023'; end if;
  for m in
    select ms.next_due_on, ms.ends_on, mp.amount_cents, mp.period from memberships ms join membership_plans mp on mp.id = ms.plan_id
    where ms.season_id = s.id and ms.status = 'active' and ms.auto_renew and ms.next_due_on is not null
      and mp.amount_cents > 0 and mp.period in ('month', 'quarter', 'year', 'season')
  loop
    step := case m.period when 'month' then 1 when 'quarter' then 3 when 'year' then 12 end;
    d := m.next_due_on; n := 0;
    while d is not null and d <= s.ends_on and (m.ends_on is null or d <= m.ends_on) and n < 60 loop
      k := to_char(d, 'YYYY-MM');
      v_sched := jsonb_set(v_sched, array[k], to_jsonb(coalesce((v_sched ->> k)::bigint, 0) + m.amount_cents));
      v_sched_total := v_sched_total + m.amount_cents; v_sched_count := v_sched_count + 1; n := n + 1;
      d := case when step is null then null else (d + make_interval(months => step))::date end;
    end loop;
  end loop;
  return (
    with inv as (
      select p.amount_cents, p.status, p.due_on, to_char(coalesce(p.due_on, p.created_at::date), 'YYYY-MM') as month
      from payments p where p.status in ('pending', 'failed', 'paid') and app.payment_in_season(p, s)
    ), months as (
      select month from inv union select key from jsonb_each_text(v_sched)
    )
    select jsonb_build_object(
      'season', jsonb_build_object('id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'ends_on', s.ends_on),
      'collected', coalesce((select sum(amount_cents) from inv where status = 'paid'), 0),
      'outstanding', coalesce((select sum(amount_cents) from inv where status <> 'paid'), 0),
      'overdue', coalesce((select sum(amount_cents) from inv where status <> 'paid' and due_on < v_today), 0),
      'invoices', (select count(*) from inv),
      'scheduled', v_sched_total, 'scheduled_count', v_sched_count,
      'by_month', coalesce((select jsonb_agg(jsonb_build_object(
          'month', mo.month,
          'collected', coalesce((select sum(amount_cents) from inv where inv.month = mo.month and status = 'paid'), 0),
          'outstanding', coalesce((select sum(amount_cents) from inv where inv.month = mo.month and status <> 'paid'), 0),
          'scheduled', coalesce((v_sched ->> mo.month)::bigint, 0)) order by mo.month) from months mo), '[]'::jsonb)
    ));
end $$;
revoke all on function public.finance_projection(uuid) from public, anon;
grant execute on function public.finance_projection(uuid) to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.43.0','feature','Finance',
  'Admin → Finance: an overview per season (income projected from player invoices, budget and actual costs for team fees, field booking, kits, league fees, licences and other, the expected result), each player''s balance, the invoices and the expenses, grouped in one menu.','2026-11-18')
on conflict (version) do nothing;
