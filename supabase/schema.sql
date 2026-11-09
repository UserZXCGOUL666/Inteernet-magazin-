-- Execute once in a NEW Supabase project's SQL Editor.
-- Every record is protected with RLS. Never put a service_role key in the browser.
begin;

create table public.store_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.store_admins enable row level security;
create policy "Read own membership" on public.store_admins for select to authenticated using (user_id = (select auth.uid()));

create function public.is_store_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.store_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_store_admin() from public;
grant execute on function public.is_store_admin() to anon, authenticated;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 150),
  description text not null default '' check (char_length(description) <= 5000),
  category text not null check (category in ('Женщинам','Мужчинам','Унисекс','Аксессуары')),
  type text not null check (type in ('Футболки','Худи и свитшоты','Брюки и джинсы','Верхняя одежда','Обувь','Сумки и аксессуары','Трикотаж')),
  price integer not null check (price between 1 and 10000000),
  old_price integer check (old_price > price and old_price <= 10000000),
  images text[] not null check (cardinality(images) between 1 and 4),
  sizes text[] not null check (cardinality(sizes) between 1 and 20),
  colors text[] not null check (cardinality(colors) between 1 and 12),
  stock integer not null default 0 check (stock between 0 and 100000),
  badge text not null default '' check (badge in ('','Новинка','Бестселлер')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index products_catalog_idx on public.products (active, created_at desc);
alter table public.products enable row level security;
create policy "Read visible products or admin" on public.products for select to anon, authenticated using (active or (select public.is_store_admin()));
create policy "Admins insert products" on public.products for insert to authenticated with check ((select public.is_store_admin()));
create policy "Admins update products" on public.products for update to authenticated using ((select public.is_store_admin())) with check ((select public.is_store_admin()));

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  number bigint generated always as identity (start with 1001) unique,
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  phone text not null check (char_length(phone) <= 30),
  delivery text not null check (delivery in ('pickup','delivery')),
  address text not null default '' check (char_length(address) <= 500),
  comment text not null default '' check (char_length(comment) <= 1000),
  total bigint not null default 0 check (total >= 0),
  status text not null default 'new' check (status in ('new','confirmed','completed','cancelled')),
  created_at timestamptz not null default now()
);
create index orders_created_idx on public.orders (created_at desc);
create index orders_phone_idx on public.orders (phone, created_at desc);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null, size text not null, color text not null,
  price integer not null check (price > 0),
  quantity integer not null check (quantity between 1 and 20)
);
create index order_items_order_idx on public.order_items(order_id);
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
create policy "Admins read orders" on public.orders for select to authenticated using ((select public.is_store_admin()));
create policy "Admins read order items" on public.order_items for select to authenticated using ((select public.is_store_admin()));

-- Atomic reservation: never accept prices/totals from the client.
-- Lock rows in stable product-id order to avoid deadlocks.
create function public.place_order(customer jsonb, items jsonb, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order_id uuid; v_number bigint; v_name text; v_phone text; v_delivery text;
  v_address text; v_comment text; v_product public.products%rowtype;
  v_item jsonb; v_id uuid; v_quantity integer; v_reserved integer; v_total bigint := 0;
  v_product_ids uuid[];
begin
  if request_id is null then raise exception 'Отсутствует идентификатор заявки'; end if;
  perform pg_advisory_xact_lock(hashtextextended(request_id::text, 0));
  select o.number into v_number from public.orders o where o.request_id = place_order.request_id;
  if found then return jsonb_build_object('number',v_number); end if;
  if jsonb_typeof(customer) is distinct from 'object' or jsonb_typeof(items) is distinct from 'array' then raise exception 'Некорректная заявка'; end if;
  if jsonb_array_length(items) not between 1 and 50 then raise exception 'Допустимо от 1 до 50 позиций'; end if;
  v_name := trim(coalesce(customer->>'name',''));
  v_phone := regexp_replace(coalesce(customer->>'phone',''),'[^0-9]','','g');
  v_delivery := coalesce(customer->>'delivery','');
  v_address := trim(coalesce(customer->>'address',''));
  v_comment := trim(coalesce(customer->>'comment',''));
  if char_length(v_name) not between 2 and 100 or char_length(v_phone) not between 10 and 15 or v_delivery not in ('pickup','delivery') or char_length(v_address)>500 or char_length(v_comment)>1000 then raise exception 'Проверьте контактные данные'; end if;
  if v_delivery='delivery' and char_length(v_address)<5 then raise exception 'Укажите адрес доставки'; end if;
  -- Bounded per-phone submission throttle. Same normalized phone serializes requests.
  perform pg_advisory_xact_lock(hashtextextended('phone:' || v_phone, 0));
  if (select count(*) from public.orders o where o.phone=v_phone and o.created_at > now()-interval '1 hour')>=5 then raise exception 'Слишком много заявок. Попробуйте позже'; end if;
  for v_item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(v_item) is distinct from 'object' or coalesce(v_item->>'quantity','') !~ '^[0-9]{1,2}$' then raise exception 'Некорректное количество'; end if;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity not between 1 and 20 then raise exception 'Допустимо от 1 до 20 единиц'; end if;
    begin v_id := (v_item->>'product_id')::uuid; exception when invalid_text_representation then raise exception 'Товар недоступен'; end;
    if v_id is null then raise exception 'Товар недоступен'; end if;
    v_product_ids := array_append(v_product_ids,v_id);
  end loop;
  perform 1 from public.products p where p.id=any(v_product_ids) order by p.id for update;
  -- Validate combined stock across all variants before creating the order.
  for v_product in select p.* from public.products p where p.id=any(v_product_ids) loop
    select sum((i->>'quantity')::integer) into v_reserved from jsonb_array_elements(items) i where (i->>'product_id')::uuid=v_product.id;
    if not v_product.active then raise exception 'Товар недоступен'; end if;
    if v_reserved>v_product.stock then raise exception 'Недостаточно товара «%»',v_product.name; end if;
  end loop;
  insert into public.orders(request_id,customer_name,phone,delivery,address,comment)
    values(place_order.request_id,v_name,v_phone,v_delivery,v_address,v_comment) returning id,number into v_order_id,v_number;
  for v_item in select value from jsonb_array_elements(items) loop
    select * into v_product from public.products p where p.id=(v_item->>'product_id')::uuid;
    if not found or not v_product.active then raise exception 'Товар недоступен'; end if;
    if not coalesce((v_item->>'size')=any(v_product.sizes),false) or not coalesce((v_item->>'color')=any(v_product.colors),false) then raise exception 'Выбранный вариант недоступен'; end if;
    v_quantity := (v_item->>'quantity')::integer;
    insert into public.order_items(order_id,product_id,name,size,color,price,quantity)
      values(v_order_id,v_product.id,v_product.name,v_item->>'size',v_item->>'color',v_product.price,v_quantity);
    update public.products set stock=stock-v_quantity where id=v_product.id;
    v_total := v_total + v_product.price::bigint*v_quantity;
  end loop;
  update public.orders set total=v_total where id=v_order_id;
  return jsonb_build_object('number',v_number);
end;
$$;
revoke all on function public.place_order(jsonb,jsonb,uuid) from public;
grant execute on function public.place_order(jsonb,jsonb,uuid) to anon,authenticated;

-- Cancellation releases stock once. Cancelled orders cannot be reopened.
create function public.set_order_status(order_id uuid,new_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_current text; v_item record;
begin
  if not public.is_store_admin() then raise exception 'Нет доступа'; end if;
  if new_status is null or new_status not in ('new','confirmed','completed','cancelled') then raise exception 'Некорректный статус'; end if;
  select status into v_current from public.orders where id=order_id for update;
  if not found then raise exception 'Заявка не найдена'; end if;
  if v_current='cancelled' and new_status<>'cancelled' then raise exception 'Отменённую заявку нельзя открыть повторно'; end if;
  if new_status='cancelled' and v_current<>'cancelled' then
    for v_item in select product_id,sum(quantity)::integer quantity from public.order_items where order_items.order_id=set_order_status.order_id and product_id is not null group by product_id order by product_id loop
      update public.products set stock=stock+v_item.quantity where id=v_item.product_id;
    end loop;
  end if;
  update public.orders set status=new_status where id=order_id;
end;
$$;
revoke all on function public.set_order_status(uuid,text) from public;
grant execute on function public.set_order_status(uuid,text) to authenticated;

-- Explicit grants: RLS protects browser access; RPC alone creates orders.
grant usage on schema public to anon,authenticated;
grant select on public.products to anon,authenticated;
grant insert,update on public.products to authenticated;
grant select on public.store_admins,public.orders,public.order_items to authenticated;
revoke insert,update,delete on public.orders,public.order_items from anon,authenticated;
revoke insert,update,delete on public.store_admins from anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy "Admin uploads product photos" on storage.objects for insert to authenticated with check (bucket_id='product-images' and (select public.is_store_admin()));
create policy "Admin removes product photos" on storage.objects for delete to authenticated using (bucket_id='product-images' and (select public.is_store_admin()));
create policy "Admin reads product photo metadata" on storage.objects for select to authenticated using (bucket_id='product-images' and (select public.is_store_admin()));
commit;

-- After creating an Auth user in Supabase > Authentication > Users:
-- insert into public.store_admins(user_id) values ('PASTE-THE-USER-UUID-HERE');
