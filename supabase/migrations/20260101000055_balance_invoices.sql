-- 0055 Balance invoices (release 0.44.0).
-- Admin → Finance → Invoices → "New balance invoices": an admin bills one player for amounts typed in by hand, one row
-- per item with its season (e.g. "Balance 2024", "Player licence 2026"). Each row becomes its own invoice (own number,
-- reference and PDF), so the player sees them as separate invoices and pays them separately; the Membership tab shows
-- what makes up their total balance. An invoice can now carry its season (payments.season_id), which the Finance pages
-- use before the membership and the due date.

alter table payments add column season_id uuid references seasons(id) on delete set null;
create index on payments (season_id);
alter table payment_lines drop constraint if exists payment_lines_kind_check;
alter table payment_lines add constraint payment_lines_kind_check check (kind in ('fee', 'past_due', 'balance'));

-- An invoice belongs to its own season when it has one, else to its membership's, else to the season of its due date.
create or replace function app.payment_in_season(p payments, s seasons) returns boolean language sql stable as $$
  select case when p.season_id is not null then p.season_id = s.id
              when p.membership_id is not null then exists (select 1 from memberships m where m.id = p.membership_id and m.season_id = s.id)
              else coalesce(p.due_on, p.created_at::date) between s.starts_on and s.ends_on end
$$;

-- p_items: [{"season_id": uuid|null, "description": text, "amount_cents": int}, …], 1–10 items. Returns the new invoice ids.
create function public.create_balance_invoices(p_player uuid, p_due date, p_items jsonb) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare it jsonb; v_desc text; v_amount int; v_season uuid; v_pay uuid; v_ids uuid[] := '{}'; v_today date := (now() at time zone 'Europe/Helsinki')::date;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if not exists (select 1 from players where id = p_player) then raise exception 'unknown player' using errcode = '22023'; end if;
  if p_due is null or p_due < v_today - 365 or p_due > v_today + 365 then raise exception 'due date within a year' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 10 then raise exception '1 to 10 items' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_desc := trim(it ->> 'description');
    v_amount := (it ->> 'amount_cents')::int;
    v_season := nullif(it ->> 'season_id', '')::uuid;
    if char_length(coalesce(v_desc, '')) not between 3 and 200 then raise exception 'description 3–200 characters' using errcode = '22023'; end if;
    if v_amount is null or v_amount < 1 or v_amount > 500000 then raise exception 'amount between EUR 0.01 and 5000' using errcode = '22023'; end if;
    if v_season is not null and not exists (select 1 from seasons where id = v_season) then raise exception 'unknown season' using errcode = '22023'; end if;
    insert into payments (player_id, amount_cents, method, status, due_on, invoice_sent_at, notes, season_id, recorded_by)
    values (p_player, v_amount, 'invoice', 'pending', p_due, now(), 'balance invoice', v_season, auth.uid()) returning id into v_pay;
    insert into payment_lines (payment_id, position, description, line_date, unit_price_cents, kind) values (v_pay, 1, v_desc, null, v_amount, 'balance');
    v_ids := v_ids || v_pay;
  end loop;
  return v_ids;
end $$;
revoke all on function public.create_balance_invoices(uuid, date, jsonb) from public, anon;
grant execute on function public.create_balance_invoices(uuid, date, jsonb) to authenticated;

-- The player's own payments, now with the invoice's title (the first line that is not a membership fee) and season.
create or replace view my_payments as
  select p.id, p.amount_cents, p.currency, p.status, p.method, p.due_on, p.paid_at, p.reference, p.invoice_number, p.checkout_url,
         case when p.status = 'paid' then 'paid'
              when p.status in ('pending','failed') and p.due_on is not null and p.due_on < current_date then 'overdue'
              else p.status::text end as display_status,
         (select l.description from payment_lines l where l.payment_id = p.id and l.kind = 'balance' order by l.position limit 1) as title,
         (select s.name from seasons s where s.id = p.season_id) as season_name
  from payments p where p.player_id = app.my_player_id();
grant select on my_payments to authenticated;

insert into app_releases (version, kind, title, notes, released_at) values
 ('0.44.0','feature','Balance invoices',
  'Admin → Finance → Invoices → New balance invoices: bill a player for amounts typed in by hand, each with its season (e.g. Balance 2024, Player licence 2026). Each becomes its own invoice; players see them separately with a breakdown of their total balance.','2026-11-18')
on conflict (version) do nothing;
