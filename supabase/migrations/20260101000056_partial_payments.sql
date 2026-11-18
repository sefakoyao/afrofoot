-- 0056 Partial payments on invoices (release 0.46.0).
-- An admin records what a player actually paid on an invoice (amount and date, e.g. EUR 10 of a EUR 20 invoice). Each
-- payment received is a row in payment_receipts; payments.paid_cents keeps the running total. An invoice is paid when the
-- receipts reach its amount (status 'paid', paid_at = the last payment's date). What is still owed is everywhere
-- amount − paid: the player's summary and Membership tab, the PDF and bank barcode, Player balances, Finance, Sign-in help.
-- A receipt recorded by mistake can be deleted, which reopens a paid invoice. "Mark paid" records the rest in one go.
-- An invoice already paid before this release counts as fully paid (no receipt rows for it).

alter table payments add column paid_cents int not null default 0;
update payments set paid_cents = amount_cents where status = 'paid';
alter table payments add constraint payments_paid_within_amount check (paid_cents between 0 and amount_cents);

create table payment_receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  amount_cents int not null check (amount_cents between 1 and 10000000),
  paid_on date not null,
  note text check (note is null or char_length(note) between 1 and 200),
  recorded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on payment_receipts (payment_id, paid_on);
alter table payment_receipts enable row level security;
-- written only through the functions below; admins read all, a player reads the receipts of their own invoices
create policy admin_read on payment_receipts for select to authenticated using (app.is_admin());
create policy receipts_self on payment_receipts for select to authenticated
  using (exists (select 1 from payments p where p.id = payment_id and p.player_id = app.my_player_id()));
revoke all on payment_receipts from anon;
create trigger audit after insert or update or delete on payment_receipts for each row execute function app.audit();

-- A payment created or marked paid by any other route (e.g. MobilePay, the nightly job) counts as fully paid.
create function app.payment_paid_in_full() returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') and new.paid_cents < new.amount_cents then new.paid_cents := new.amount_cents; end if;
  return new;
end $$;
create trigger paid_in_full before insert or update on payments for each row execute function app.payment_paid_in_full();

-- Records a payment received. p_amount null = everything still owed ("Mark paid"). Returns what is paid and left.
create function public.record_invoice_payment(p_payment uuid, p_amount int default null, p_paid_on date default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p payments; v_today date := (now() at time zone 'Europe/Helsinki')::date; v_on date := coalesce(p_paid_on, (now() at time zone 'Europe/Helsinki')::date);
        v_left int; v_amount int;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into p from payments where id = p_payment for update;
  if p.id is null then raise exception 'unknown payment' using errcode = '22023'; end if;
  if p.status not in ('pending', 'failed') then raise exception 'already paid' using errcode = 'check_violation'; end if;
  v_left := p.amount_cents - p.paid_cents;
  v_amount := coalesce(p_amount, v_left);
  if v_amount < 1 or v_amount > v_left then raise exception 'amount between EUR 0.01 and what is still owed' using errcode = '22023'; end if;
  if v_on > v_today or v_on < v_today - 3650 then raise exception 'payment date not in the future' using errcode = '22023'; end if;
  insert into payment_receipts (payment_id, amount_cents, paid_on, note, recorded_by) values (p.id, v_amount, v_on, nullif(trim(p_note), ''), auth.uid());
  if v_amount = v_left then
    update payments set paid_cents = amount_cents, status = 'paid', recorded_by = auth.uid(),
           paid_at = case when v_on = v_today then now() else (v_on + time '12:00') at time zone 'Europe/Helsinki' end, updated_at = now()
     where id = p.id;
  else
    update payments set paid_cents = paid_cents + v_amount, updated_at = now() where id = p.id;
  end if;
  return jsonb_build_object('paid_cents', p.paid_cents + v_amount, 'left_cents', v_left - v_amount, 'paid', v_amount = v_left);
end $$;
revoke all on function public.record_invoice_payment(uuid, int, date, text) from public, anon;
grant execute on function public.record_invoice_payment(uuid, int, date, text) to authenticated;

-- Deletes a payment received (a mistake); a paid invoice opens again.
create function public.delete_invoice_receipt(p_receipt uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r payment_receipts;
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into r from payment_receipts where id = p_receipt;
  if r.id is null then raise exception 'unknown receipt' using errcode = '22023'; end if;
  perform 1 from payments where id = r.payment_id for update;
  delete from payment_receipts where id = r.id;
  update payments set paid_cents = greatest(0, paid_cents - r.amount_cents),
         status = case when status = 'paid' then 'pending'::payment_status else status end,
         paid_at = case when status = 'paid' then null else paid_at end, updated_at = now()
   where id = r.payment_id;
end $$;
revoke all on function public.delete_invoice_receipt(uuid) from public, anon;
grant execute on function public.delete_invoice_receipt(uuid) to authenticated;

-- The player's own payments, now with what is paid and still due.
create or replace view my_payments as
  select p.id, p.amount_cents, p.currency, p.status, p.method, p.due_on, p.paid_at, p.reference, p.invoice_number, p.checkout_url,
         case when p.status = 'paid' then 'paid'
              when p.status in ('pending','failed') and p.due_on is not null and p.due_on < current_date then 'overdue'
              else p.status::text end as display_status,
         (select l.description from payment_lines l where l.payment_id = p.id and l.kind = 'balance' order by l.position limit 1) as title,
         (select s.name from seasons s where s.id = p.season_id) as season_name,
         p.paid_cents, case when p.status = 'paid' then 0 else p.amount_cents - p.paid_cents end as due_cents
  from payments p where p.player_id = app.my_player_id();
grant select on my_payments to authenticated;

-- my_payment_summary: amounts still owed are now amount − paid
create or replace function public.my_payment_summary() returns table (
  team_name text, paid_cents bigint, owed_cents bigint, overdue_cents bigint,
  next_due_on date, sign_in_blocked_from date, exempt_until date, grace_days int, policy_enabled boolean)
language sql stable security definer set search_path = public as $$
  with me as (select app.my_player_id() as id),
  fp as (select * from fee_policy),
  t as (select tm.name from team_players tp join team_seasons ts on ts.id = tp.team_season_id join teams tm on tm.id = ts.team_id, me
         where tp.player_id = me.id and tp.left_on is null order by ts.created_at desc limit 1)
  select (select name from t),
         coalesce(sum(p.paid_cents), 0),
         coalesce(sum(p.amount_cents - p.paid_cents) filter (where p.status in ('pending','failed')), 0),
         coalesce(sum(p.amount_cents - p.paid_cents) filter (where p.status in ('pending','failed') and p.due_on < current_date), 0),
         min(p.due_on) filter (where p.status in ('pending','failed')),
         min(p.due_on) filter (where p.status in ('pending','failed') and p.due_on is not null) + (select grace_days from fp),
         (select fee_exempt_until from players where id = (select id from me)),
         (select grace_days from fp), (select enabled from fp)
  from payments p where p.player_id = (select id from me)
$$;

-- fee_overview: amounts still owed are now amount − paid
create or replace function public.fee_overview() returns table (player_id uuid, player_name text, team_name text, owed_cents bigint, oldest_due date, days_overdue int, blocked boolean, exempt_until date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query
  select pl.id, pl.first_name || ' ' || pl.last_name,
         (select tm.name from team_players tp join team_seasons ts on ts.id = tp.team_season_id join teams tm on tm.id = ts.team_id where tp.player_id = pl.id and tp.left_on is null order by ts.created_at desc limit 1),
         sum(p.amount_cents - p.paid_cents), min(p.due_on), greatest(0, current_date - min(p.due_on))::int,
         coalesce(pl.profile_id is not null and app.player_blocked(pl.profile_id), false), pl.fee_exempt_until
  from players pl join payments p on p.player_id = pl.id and p.status in ('pending','failed')
  group by pl.id order by min(p.due_on) nulls last;
end $$;

-- signin_status: amounts still owed are now amount − paid
create or replace function public.signin_status(p_profile uuid) returns table (
  email text, has_account boolean, email_confirmed boolean, last_sign_in_at timestamptz, providers text[], banned_until timestamptz,
  role text, status text, player_id uuid, fee_blocked boolean, owed_cents bigint, oldest_due date, exempt_until date
) language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not app.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query
  select coalesce(u.email, pr.email)::text, u.id is not null, u.email_confirmed_at is not null, u.last_sign_in_at,
         coalesce((select array_agg(distinct i.provider order by i.provider) from auth.identities i where i.user_id = pr.id), '{}')::text[],
         case when u.banned_until > now() then u.banned_until end,
         pr.role::text, pr.status::text, pl.id,
         coalesce(app.player_blocked(pr.id), false),
         (select sum(p.amount_cents - p.paid_cents) from payments p where p.player_id = pl.id and p.status in ('pending', 'failed'))::bigint,
         (select min(p.due_on) from payments p where p.player_id = pl.id and p.status in ('pending', 'failed')),
         pl.fee_exempt_until
  from profiles pr
  left join auth.users u on u.id = pr.id
  left join players pl on pl.profile_id = pr.id
  where pr.id = p_profile;
end $$;

-- finance_summary: amounts still owed are now amount − paid
create or replace function public.finance_summary(p_season uuid) returns table (income_cents bigint, pending_cents bigint, expenses_cents bigint, net_cents bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
  select i.paid, i.pending, e.spent, i.paid - e.spent from
   (select coalesce(sum(p.paid_cents), 0)::bigint paid, coalesce(sum(p.amount_cents - p.paid_cents) filter (where p.status = 'pending'), 0)::bigint pending
      from payments p left join memberships m on m.id = p.membership_id where m.season_id = p_season or (p.membership_id is null and p.created_at::date between (select starts_on from seasons where id = p_season) and (select ends_on from seasons where id = p_season))) i,
   (select coalesce(sum(amount_cents), 0)::bigint spent from expenses where season_id = p_season) e;
end $$;

-- finance_balances: amounts still owed are now amount − paid
create or replace function public.finance_balances(p_season uuid) returns table (
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
         coalesce(sum(m.paid_cents) filter (where m.in_season), 0)::bigint,
         coalesce(sum(m.amount_cents - m.paid_cents) filter (where m.in_season and m.status <> 'paid' and (m.due_on is null or m.due_on >= v_today)), 0)::bigint,
         coalesce(sum(m.amount_cents - m.paid_cents) filter (where m.in_season and m.status <> 'paid' and m.due_on < v_today), 0)::bigint,
         coalesce(sum(m.amount_cents - m.paid_cents) filter (where m.status <> 'paid'), 0)::bigint,
         min(m.due_on) filter (where m.status <> 'paid'),
         greatest(max(m.paid_at), (select max(r.paid_on)::timestamptz from payment_receipts r join payments x on x.id = r.payment_id where x.player_id = pl.id)),
         (count(m.id) filter (where m.in_season))::int
  from players pl
  left join mine m on m.player_id = pl.id
  where exists (select 1 from memberships ms where ms.player_id = pl.id and ms.season_id = s.id) or exists (select 1 from mine x where x.player_id = pl.id and (x.in_season or x.status <> 'paid'))
  group by pl.id, pl.first_name, pl.last_name;
end $$;

-- finance_projection: amounts still owed are now amount − paid
create or replace function public.finance_projection(p_season uuid) returns jsonb
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
      select p.paid_cents as paid, p.amount_cents - p.paid_cents as open, p.status, p.due_on, to_char(coalesce(p.due_on, p.created_at::date), 'YYYY-MM') as month
      from payments p where p.status in ('pending', 'failed', 'paid') and app.payment_in_season(p, s)
    ), months as (
      select month from inv union select key from jsonb_each_text(v_sched)
    )
    select jsonb_build_object(
      'season', jsonb_build_object('id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'ends_on', s.ends_on),
      'collected', coalesce((select sum(paid) from inv), 0),
      'outstanding', coalesce((select sum(open) from inv where status <> 'paid'), 0),
      'overdue', coalesce((select sum(open) from inv where status <> 'paid' and due_on < v_today), 0),
      'invoices', (select count(*) from inv),
      'scheduled', v_sched_total, 'scheduled_count', v_sched_count,
      'by_month', coalesce((select jsonb_agg(jsonb_build_object(
          'month', mo.month,
          'collected', coalesce((select sum(paid) from inv where inv.month = mo.month), 0),
          'outstanding', coalesce((select sum(open) from inv where inv.month = mo.month and status <> 'paid'), 0),
          'scheduled', coalesce((v_sched ->> mo.month)::bigint, 0)) order by mo.month) from months mo), '[]'::jsonb)
    ));
end $$;
insert into app_releases (version, kind, title, notes, released_at) values
 ('0.46.0','feature','Partial payments',
  'Admin → Finance → Invoices: record what a player paid on an invoice (e.g. EUR 10 of EUR 20) with its date; the rest stays owed. Players, Player balances, Finance and the invoice PDF show what is paid and what is left. A payment recorded by mistake can be deleted.','2026-11-18')
on conflict (version) do nothing;
