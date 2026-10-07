-- =====================================================================
-- Menüverwaltung: Zutaten, Gerichte (Rezepte), Tagesmenüs pro Service
-- + Gästeallergien als Auswahl der 14 EU-Allergene (VO (EU) 1169/2011)
-- Im Supabase SQL Editor ausführen. Mehrfaches Ausführen ist unschädlich.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabellen
-- ---------------------------------------------------------------------
create table if not exists public.ingredients (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  unit        text not null default 'g' check (unit in ('g', 'ml', 'stk')),
  allergens   text[] not null default '{}',
  traces      text[] not null default '{}',   -- „kann Spuren enthalten“
  updated_at  timestamptz not null default now()
);
create index if not exists ingredients_venue_idx on public.ingredients (venue_id);

create table if not exists public.dishes (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references public.venues(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  name_it      text not null default '',
  name_en      text not null default '',
  course       text not null default 'hauptgang'
               check (course in ('vorspeise', 'suppe', 'zwischengang', 'hauptgang', 'beilage', 'dessert', 'sonstiges')),
  diet         text[] not null default '{}',   -- vegetarisch, vegan
  notes        text not null default '',
  ingredients  jsonb not null default '[]',    -- [{ "ingredientId": uuid, "qty": Menge pro Portion }]
  updated_at   timestamptz not null default now()
);
create index if not exists dishes_venue_idx on public.dishes (venue_id);

create table if not exists public.menus (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  date        date not null,
  service_id  uuid not null references public.services(id) on delete cascade,
  portions    integer check (portions is null or portions >= 0),  -- null = automatisch aus den Reservierungen
  buffer_pct  integer not null default 10 check (buffer_pct between 0 and 100),
  notes       text not null default '',
  items       jsonb not null default '[]',    -- [{ course, dishId, share, name, allergens }] (Name/Allergene = Momentaufnahme)
  updated_at  timestamptz not null default now(),
  unique (venue_id, date, service_id)
);
create index if not exists menus_date_idx on public.menus (venue_id, date);

-- Gästeallergien als Auswahl (Freitext „allergies“ bleibt als Notiz)
alter table public.reservations add column if not exists allergens text[] not null default '{}';
alter table public.stays        add column if not exists allergens text[] not null default '{}';

-- ---------------------------------------------------------------------
-- 2) Trigger: updated_at
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ingredients', 'dishes', 'menus'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3) Rechte: Küche pflegt Zutaten, Gerichte und Menüs
-- ---------------------------------------------------------------------
create or replace function public.can_write(v uuid, tbl text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role(v)
    when 'admin'   then true
    when 'empfang' then tbl in ('reservations', 'reservation_tables', 'stays', 'table_blocks', 'audit_log')
    when 'service' then tbl in ('reservations', 'audit_log')
    when 'kueche'  then tbl in ('ingredients', 'dishes', 'menus')
    else false
  end
$$;

do $$
declare t text;
begin
  foreach t in array array['ingredients', 'dishes', 'menus'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.my_role(venue_id) is not null)', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.can_write(venue_id, %L))', t, t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.can_write(venue_id, %L)) with check (public.can_write(venue_id, %L))', t, t, t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.can_write(venue_id, %L))', t, t, t);
  end loop;
end $$;

grant select, insert, update, delete on public.ingredients, public.dishes, public.menus to authenticated;

-- ---------------------------------------------------------------------
-- 4) Speicherfunktionen: Allergen-Auswahl mitspeichern
-- ---------------------------------------------------------------------
create or replace function public.save_reservations(p_venue uuid, p_items jsonb, p_delete uuid[] default '{}') returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  it jsonb; rid uuid; tids uuid[]; ids uuid[] := '{}';
begin
  if coalesce(cardinality(p_delete), 0) > 0 then
    delete from public.reservations where venue_id = p_venue and id = any(p_delete);
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    rid := coalesce((it->>'id')::uuid, gen_random_uuid());
    ids := ids || rid;
    tids := coalesce(array(select (jsonb_array_elements_text(coalesce(it->'table_ids', '[]'::jsonb)))::uuid), '{}');
    -- zuerst entfernte Tische lösen (vermeidet Schein-Konflikte beim Verschieben)
    delete from public.reservation_tables where reservation_id = rid and not (table_id = any(tids));
    insert into public.reservations as r (id, venue_id, date, service_id, time, duration, adults, children, name, phone, email,
        occasion, allergies, allergens, notes, highchair, vip, source, status, wishes, stay_id, manual_table, series_id, seated_at, finished_at)
    values (rid, p_venue, (it->>'date')::date, (it->>'service_id')::uuid, (it->>'time')::time, (it->>'duration')::int,
        coalesce((it->>'adults')::int, 0), coalesce((it->>'children')::int, 0), it->>'name', coalesce(it->>'phone', ''), coalesce(it->>'email', ''),
        coalesce(it->>'occasion', ''), coalesce(it->>'allergies', ''),
        coalesce(array(select jsonb_array_elements_text(coalesce(it->'allergens', '[]'::jsonb))), '{}'),
        coalesce(it->>'notes', ''), coalesce((it->>'highchair')::boolean, false),
        coalesce((it->>'vip')::boolean, false), coalesce(it->>'source', 'Telefon'), coalesce(it->>'status', 'bestaetigt'),
        coalesce(array(select jsonb_array_elements_text(coalesce(it->'wishes', '[]'::jsonb))), '{}'),
        (it->>'stay_id')::uuid, coalesce((it->>'manual_table')::boolean, false), (it->>'series_id')::uuid,
        (it->>'seated_at')::int, (it->>'finished_at')::int)
    on conflict (id) do update set
        date = excluded.date, service_id = excluded.service_id, time = excluded.time, duration = excluded.duration,
        adults = excluded.adults, children = excluded.children, name = excluded.name, phone = excluded.phone, email = excluded.email,
        occasion = excluded.occasion, allergies = excluded.allergies, allergens = excluded.allergens, notes = excluded.notes, highchair = excluded.highchair,
        vip = excluded.vip, source = excluded.source, status = excluded.status, wishes = excluded.wishes, stay_id = excluded.stay_id,
        manual_table = excluded.manual_table, series_id = excluded.series_id, seated_at = excluded.seated_at, finished_at = excluded.finished_at
      where r.venue_id = p_venue;
    insert into public.reservation_tables (reservation_id, table_id, venue_id, period, active)
      select rid, t, p_venue, 'empty'::tsrange, false from unnest(tids) t
      where not exists (select 1 from public.reservation_tables x where x.reservation_id = rid and x.table_id = t);
  end loop;
  return coalesce((select jsonb_agg(public.reservation_json(i)) from unnest(ids) i), '[]'::jsonb);
end $$;

create or replace function public.save_stay(p_venue uuid, p_stay jsonb, p_items jsonb, p_delete uuid[] default '{}') returns jsonb
language plpgsql security invoker set search_path = public as $$
declare sid uuid := coalesce((p_stay->>'id')::uuid, gen_random_uuid()); res jsonb;
begin
  insert into public.stays as s (id, venue_id, room_no, name, adults, children, arrival, departure, board, phone, allergies, allergens, notes, vip, times, table_ids)
  values (sid, p_venue, p_stay->>'room_no', p_stay->>'name', coalesce((p_stay->>'adults')::int, 1), coalesce((p_stay->>'children')::int, 0),
      (p_stay->>'arrival')::date, (p_stay->>'departure')::date, coalesce(p_stay->>'board', 'HP'), coalesce(p_stay->>'phone', ''),
      coalesce(p_stay->>'allergies', ''), coalesce(array(select jsonb_array_elements_text(coalesce(p_stay->'allergens', '[]'::jsonb))), '{}'),
      coalesce(p_stay->>'notes', ''), coalesce((p_stay->>'vip')::boolean, false),
      coalesce(p_stay->'times', '{}'::jsonb), coalesce(array(select (jsonb_array_elements_text(coalesce(p_stay->'table_ids', '[]'::jsonb)))::uuid), '{}'))
  on conflict (id) do update set room_no = excluded.room_no, name = excluded.name, adults = excluded.adults, children = excluded.children,
      arrival = excluded.arrival, departure = excluded.departure, board = excluded.board, phone = excluded.phone, allergies = excluded.allergies,
      allergens = excluded.allergens, notes = excluded.notes, vip = excluded.vip, times = excluded.times, table_ids = excluded.table_ids
    where s.venue_id = p_venue;
  res := public.save_reservations(p_venue, p_items, p_delete);
  return jsonb_build_object('stay', (select to_jsonb(s) from public.stays s where s.id = sid), 'reservations', res);
end $$;

-- ---------------------------------------------------------------------
-- 5) Realtime
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['ingredients', 'dishes', 'menus'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
