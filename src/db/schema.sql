-- FlagSales Live: the sales logger, rebuilt with made-up data.
--
-- The rule that matters: the app never touches a table. It runs as the role
-- `app`, which may only call the functions below and read the views. Prices
-- come from the products table, PINs are bcrypt hashes nobody can read, and
-- a seller can only log sales for themselves.

create extension if not exists pgcrypto;

create table sellers (
  id serial primary key,
  name text not null unique,
  pin_hash text not null,
  role text not null default 'seller' check (role in ('seller', 'lead')),
  daily_goal numeric(5, 2) not null default 6
);

create table products (
  id serial primary key,
  name text not null unique,
  points numeric(4, 2) not null check (points >= 0),
  euros integer not null check (euros >= 0),
  sort integer not null
);

create table sessions (
  token uuid primary key default gen_random_uuid(),
  seller_id integer not null references sellers,
  location text not null,
  started_at timestamptz not null default now()
);

create table sales (
  id bigserial primary key,
  seller_id integer not null references sellers,
  product_id integer not null references products,
  quantity integer not null check (quantity between 1 and 20),
  -- Snapshot of the price at the moment of the sale, so later price changes don't rewrite history.
  points numeric(6, 2) not null,
  euros integer not null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by integer references sellers
);

create table activities (
  id bigserial primary key,
  seller_id integer not null references sellers,
  kind text not null check (kind in ('encounter', 'assessment', 'offer')),
  delta integer not null check (delta in (-1, 1)),
  created_at timestamptz not null default now()
);

create table failed_sign_ins (
  seller_id integer not null references sellers,
  at timestamptz not null default now()
);

-- "Today" is the Helsinki calendar day, wherever the database thinks it is.
create function today_start() returns timestamptz
language sql stable as $$
  select date_trunc('day', now() at time zone 'Europe/Helsinki') at time zone 'Europe/Helsinki'
$$;

create function seller_for(p_token uuid) returns sellers
language plpgsql stable security definer as $$
declare
  found sellers;
begin
  select s.* into found from sessions x join sellers s on s.id = x.seller_id where x.token = p_token;
  if found.id is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  return found;
end;
$$;

-- Wrong PINs are returned, not raised: an exception would roll back the
-- failed-attempt row too, and the lockout would never trigger.
create function sign_in(p_name text, p_pin text, p_location text) returns table (session_token uuid, error text)
language plpgsql security definer as $$
declare
  who sellers;
  recent integer;
  new_token uuid;
begin
  select * into who from sellers where name = p_name;
  if who.id is null then
    return query select null::uuid, 'Unknown seller'::text;
    return;
  end if;

  select count(*) into recent from failed_sign_ins where seller_id = who.id and at > now() - interval '5 minutes';
  if recent >= 5 then
    return query select null::uuid, 'Too many wrong PINs. Try again in 5 minutes.'::text;
    return;
  end if;

  if crypt(p_pin, who.pin_hash) <> who.pin_hash then
    insert into failed_sign_ins (seller_id) values (who.id);
    return query select null::uuid, 'Wrong PIN'::text;
    return;
  end if;

  insert into sessions (seller_id, location) values (who.id, p_location) returning sessions.token into new_token;
  return query select new_token, null::text;
end;
$$;

-- Logs a basket of sales for the signed-in seller. The client sends product ids
-- and quantities only; points and euros are read from the products table.
create function log_sales(p_token uuid, p_items jsonb) returns table (points numeric, euros integer)
language plpgsql security definer as $$
declare
  who sellers := seller_for(p_token);
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nothing to save' using errcode = '22023';
  end if;

  return query
  with basket as (
    select (item->>'product_id')::integer as product_id, (item->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) as item
  ),
  inserted as (
    insert into sales (seller_id, product_id, quantity, points, euros)
    select who.id, p.id, b.quantity, p.points * b.quantity, p.euros * b.quantity
    from basket b join products p on p.id = b.product_id
    returning sales.points, sales.euros
  )
  select coalesce(sum(i.points), 0)::numeric, coalesce(sum(i.euros), 0)::integer from inserted i;
end;
$$;

create function log_activity(p_token uuid, p_kind text, p_delta integer) returns integer
language plpgsql security definer as $$
declare
  who sellers := seller_for(p_token);
  total integer;
begin
  select coalesce(sum(delta), 0) into total from activities
  where seller_id = who.id and kind = p_kind and created_at >= today_start();
  if p_delta < 0 and total <= 0 then
    return 0; -- never below zero
  end if;
  insert into activities (seller_id, kind, delta) values (who.id, p_kind, p_delta);
  return total + p_delta;
end;
$$;

create function void_sale(p_token uuid, p_sale_id bigint) returns void
language plpgsql security definer as $$
declare
  who sellers := seller_for(p_token);
begin
  if who.role <> 'lead' then
    raise exception 'Only a team lead can void sales' using errcode = '42501';
  end if;
  update sales set voided_at = now(), voided_by = who.id where id = p_sale_id and voided_at is null;
end;
$$;

create view leaderboard_today as
select
  s.id as seller_id,
  s.name,
  coalesce(sum(x.points), 0)::numeric as points,
  coalesce(sum(x.euros), 0)::integer as euros,
  coalesce(sum(x.quantity), 0)::integer as sold,
  max(x.created_at) as last_sale_at,
  rank() over (order by coalesce(sum(x.points), 0) desc)::integer as rank
from sellers s
left join sales x on x.seller_id = s.id and x.voided_at is null and x.created_at >= today_start()
where s.role = 'seller'
group by s.id, s.name;

create view product_split_today as
select p.id as product_id, p.name, coalesce(sum(x.quantity), 0)::integer as sold, coalesce(sum(x.euros), 0)::integer as euros
from products p
left join sales x on x.product_id = p.id and x.voided_at is null and x.created_at >= today_start()
group by p.id, p.name, p.sort
order by p.sort;

create view recent_sales as
select x.id, s.name as seller, p.name as product, x.quantity, x.points, x.euros, x.created_at, x.voided_at is not null as voided
from sales x join sellers s on s.id = x.seller_id join products p on p.id = x.product_id
order by x.created_at desc, x.id desc
limit 12;

create view product_list as
select id, name, points, euros from products order by sort;

create view seller_names as
select name, role from sellers order by role desc, name;

-- One seller's day, for their own screen.
create function my_day(p_token uuid) returns table (
  name text, points numeric, euros integer, sold integer, rank integer, sellers integer,
  goal numeric, encounters integer, assessments integer, offers integer, signed_in_at timestamptz
)
language sql stable security definer as $$
  with who as (select * from seller_for(p_token)),
  board as (select * from leaderboard_today),
  acts as (
    select kind, sum(delta)::integer as n from activities
    where seller_id = (select id from who) and created_at >= today_start() group by kind
  )
  select
    w.name,
    coalesce(b.points, 0), coalesce(b.euros, 0), coalesce(b.sold, 0),
    coalesce(b.rank, 1), (select count(*)::integer from board),
    w.daily_goal,
    coalesce((select n from acts where kind = 'encounter'), 0),
    coalesce((select n from acts where kind = 'assessment'), 0),
    coalesce((select n from acts where kind = 'offer'), 0),
    (select started_at from sessions where token = p_token)
  from who w left join board b on b.seller_id = w.id
$$;

-- The app's role: functions and views only.
create role app nologin;
revoke all on all tables in schema public from public;
revoke all on all functions in schema public from public;
grant select on leaderboard_today, product_split_today, recent_sales, product_list, seller_names to app;
grant execute on function sign_in(text, text, text), log_sales(uuid, jsonb), log_activity(uuid, text, integer),
  void_sale(uuid, bigint), my_day(uuid), today_start() to app;
