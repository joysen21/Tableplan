-- Module Garage, Massage, Fahrrad: Ressourcen (Stellplätze, Masseurinnen, Räder), Therapien, Anwesenheit, Buchungen.
-- Buchungen nur für Hotelgäste (stay_id), Doppelbuchung derselben Ressource sperrt die DB (Exclusion Constraint).
-- Zeiten als lokale Zeitstempel ohne Zeitzone: Garage 12:00–12:00 je Nacht, Fahrrad 08–13 / 13–18 Uhr, Massage Beginn + Dauer.
-- Sichtbarkeit über public.module_allowed() (Standard: Empfang, Admin immer); Ressourcen und Therapien pflegt der Admin.

create or replace function public.module_allowed(v uuid, m text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(v) = 'admin', false) or exists (
    select 1 from public.venues x where x.id = v and m = any(x.modules)
      and coalesce(x.module_roles -> m, case m when 'bestellliste' then '["kueche"]'::jsonb
                                               when 'pass' then '["service", "kueche"]'::jsonb
                                               when 'garage' then '["empfang"]'::jsonb
                                               when 'massage' then '["empfang"]'::jsonb
                                               when 'fahrrad' then '["empfang"]'::jsonb
                                               else '[]'::jsonb end) ? public.my_role(v))
$$;
revoke all on function public.module_allowed(uuid, text) from public;
grant execute on function public.module_allowed(uuid, text) to authenticated;

create table if not exists public.hotel_resources (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  module     text not null check (module in ('garage', 'massage', 'fahrrad')),
  name       text not null check (length(trim(name)) > 0),
  sort       integer not null default 0,
  active     boolean not null default true,
  ev         boolean not null default false,   -- Garage: Ladeplatz für E-Autos
  art        text not null default '',         -- Fahrrad: Art (E-Bike, Mountainbike …)
  size       text not null default '',         -- Fahrrad: Rahmengröße
  updated_at timestamptz not null default now()
);
create index if not exists hotel_resources_venue_idx on public.hotel_resources (venue_id);

create table if not exists public.massage_therapies (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  duration   integer not null default 50 check (duration between 5 and 480),
  price      numeric(10,2) not null default 0,
  sort       integer not null default 0,
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists massage_therapies_venue_idx on public.massage_therapies (venue_id);

-- Anwesenheit der Masseurinnen (je Tag ein Zeitraum)
create table if not exists public.resource_presence (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  resource_id uuid not null references public.hotel_resources(id) on delete cascade,
  date        date not null,
  start_time  time not null,
  end_time    time not null check (end_time > start_time),
  updated_at  timestamptz not null default now(),
  unique (resource_id, date)
);
create index if not exists resource_presence_venue_idx on public.resource_presence (venue_id, date);

create table if not exists public.resource_bookings (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  module      text not null check (module in ('garage', 'massage', 'fahrrad')),
  resource_id uuid not null references public.hotel_resources(id) on delete cascade,
  stay_id     uuid not null references public.stays(id) on delete cascade,
  starts      timestamp not null,
  ends        timestamp not null check (ends > starts),
  therapy_id  uuid references public.massage_therapies(id) on delete set null,
  plate       text not null default '',          -- Garage: Kennzeichen
  ev          boolean not null default false,    -- Garage: E-Auto
  part        text check (part in ('tag', 'vm', 'nm')),  -- Fahrrad
  price       numeric(10,2),
  note        text not null default '',
  created_by  text not null default '',
  updated_at  timestamptz not null default now(),
  constraint resource_bookings_no_overlap exclude using gist (resource_id with =, tsrange(starts, ends, '[)') with &&)
);
create index if not exists resource_bookings_venue_idx on public.resource_bookings (venue_id, starts);

alter table public.hotel_resources enable row level security;
alter table public.massage_therapies enable row level security;
alter table public.resource_presence enable row level security;
alter table public.resource_bookings enable row level security;

drop policy if exists hotel_resources_select on public.hotel_resources;
create policy hotel_resources_select on public.hotel_resources for select to authenticated using (public.module_allowed(venue_id, module));
drop policy if exists hotel_resources_write on public.hotel_resources;
create policy hotel_resources_write on public.hotel_resources for all to authenticated
  using (public.my_role(venue_id) = 'admin') with check (public.my_role(venue_id) = 'admin');

drop policy if exists massage_therapies_select on public.massage_therapies;
create policy massage_therapies_select on public.massage_therapies for select to authenticated using (public.module_allowed(venue_id, 'massage'));
drop policy if exists massage_therapies_write on public.massage_therapies;
create policy massage_therapies_write on public.massage_therapies for all to authenticated
  using (public.my_role(venue_id) = 'admin') with check (public.my_role(venue_id) = 'admin');

drop policy if exists resource_presence_all on public.resource_presence;
create policy resource_presence_all on public.resource_presence for all to authenticated
  using (public.module_allowed(venue_id, 'massage')) with check (public.module_allowed(venue_id, 'massage'));

drop policy if exists resource_bookings_all on public.resource_bookings;
create policy resource_bookings_all on public.resource_bookings for all to authenticated
  using (public.module_allowed(venue_id, module)) with check (public.module_allowed(venue_id, module));

do $$
declare t text;
begin
  foreach t in array array['hotel_resources', 'massage_therapies', 'resource_presence', 'resource_bookings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

grant select, insert, update, delete on public.hotel_resources, public.massage_therapies, public.resource_presence, public.resource_bookings to authenticated;
revoke all on public.hotel_resources, public.massage_therapies, public.resource_presence, public.resource_bookings from anon;

-- Startdaten: Garage mit 2 Ladeplätzen, 2 Masseurinnen mit Standard-Therapien, ein paar Räder (nur wenn noch nichts angelegt)
do $$
declare v record;
begin
  for v in select id from public.venues loop
    if exists (select 1 from public.hotel_resources where venue_id = v.id) then continue; end if;
    insert into public.hotel_resources (venue_id, module, name, sort, ev) values
      (v.id, 'garage', 'Platz 1', 0, true), (v.id, 'garage', 'Platz 2', 1, true), (v.id, 'garage', 'Platz 3', 2, false),
      (v.id, 'garage', 'Platz 4', 3, false), (v.id, 'garage', 'Platz 5', 4, false), (v.id, 'garage', 'Platz 6', 5, false);
    insert into public.hotel_resources (venue_id, module, name, sort) values (v.id, 'massage', 'Masseurin 1', 0), (v.id, 'massage', 'Masseurin 2', 1);
    insert into public.hotel_resources (venue_id, module, name, sort, art, size) values
      (v.id, 'fahrrad', 'E-Bike 1', 0, 'E-Bike', 'M'), (v.id, 'fahrrad', 'E-Bike 2', 1, 'E-Bike', 'L'),
      (v.id, 'fahrrad', 'MTB 1', 2, 'Mountainbike', 'M'), (v.id, 'fahrrad', 'Kinderrad', 3, 'Kinderrad', '24"');
    if not exists (select 1 from public.massage_therapies where venue_id = v.id) then
      insert into public.massage_therapies (venue_id, name, duration, price, sort) values
        (v.id, 'Rückenmassage', 25, 45, 0), (v.id, 'Ganzkörpermassage', 50, 85, 1), (v.id, 'Fußreflexzonenmassage', 40, 65, 2);
    end if;
  end loop;
end $$;
