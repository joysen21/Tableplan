-- =====================================================================
-- Tischplan – Datenbankschema (Supabase / PostgreSQL)
--
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen.
-- Das Skript ist idempotent (kann mehrfach ausgeführt werden).
--
-- Kernpunkte:
--   * Mandantenfähig: jede Zeile gehört zu einem Betrieb (venue_id)
--   * Rechte je Rolle über Row Level Security + Trigger
--   * Doppelbuchungsschutz in der Datenbank (Exclusion Constraint):
--     ein Tisch kann nie von zwei aktiven Reservierungen gleichzeitig
--     belegt sein – auch nicht, wenn zwei Geräte gleichzeitig speichern.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- 1) Betriebe & Mitglieder
-- ---------------------------------------------------------------------
create table if not exists public.venues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  venue_id    uuid not null references public.venues(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'empfang', 'service', 'kueche')),
  name        text not null default '',
  email       text not null default '',
  created_at  timestamptz not null default now(),
  primary key (venue_id, user_id)
);
create index if not exists members_user_idx on public.members (user_id);

-- ---------------------------------------------------------------------
-- 2) Stammdaten: Räume, Reviere, Tische, Deko, Kombinationen, Layouts, Services
-- ---------------------------------------------------------------------
create table if not exists public.rooms (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references public.venues(id) on delete cascade,
  name            text not null,
  width           integer not null default 1000 check (width between 200 and 5000),
  height          integer not null default 650 check (height between 200 and 5000),
  background_url  text,
  sort            integer not null default 0,
  updated_at      timestamptz not null default now()
);

create table if not exists public.stations (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  name        text not null,
  color       text not null default '#1f6feb',
  updated_at  timestamptz not null default now()
);

create table if not exists public.dining_tables (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references public.venues(id) on delete cascade,
  room_id      uuid not null references public.rooms(id) on delete cascade,
  name         text not null,
  shape        text not null default 'square' check (shape in ('round', 'square', 'rect', 'bench')),
  x            real not null default 100,
  y            real not null default 100,
  width        real not null default 70 check (width > 0),
  height       real not null default 70 check (height > 0),
  rotation     real not null default 0,
  min_persons  integer not null default 1 check (min_persons >= 1),
  max_persons  integer not null default 4,
  station_id   uuid references public.stations(id) on delete set null,
  features     text[] not null default '{}',
  updated_at   timestamptz not null default now(),
  check (max_persons >= min_persons)
);
create index if not exists dining_tables_room_idx on public.dining_tables (room_id);

create table if not exists public.decor (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  room_id     uuid not null references public.rooms(id) on delete cascade,
  kind        text not null check (kind in ('wall', 'door', 'bar', 'buffet', 'column', 'plant', 'label')),
  x           real not null default 100,
  y           real not null default 100,
  width       real not null default 100,
  height      real not null default 20,
  rotation    real not null default 0,
  label       text not null default '',
  updated_at  timestamptz not null default now()
);

create table if not exists public.table_combos (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  name        text not null,
  table_ids   uuid[] not null check (cardinality(table_ids) >= 2),
  updated_at  timestamptz not null default now()
);

create table if not exists public.layouts (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  room_id     uuid not null references public.rooms(id) on delete cascade,
  name        text not null,
  positions   jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

create table if not exists public.services (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references public.venues(id) on delete cascade,
  name          text not null,
  kind          text not null default 'abend' check (kind in ('fruehstueck', 'mittag', 'abend')),
  start_time    time not null,
  end_time      time not null,
  hotel_time    time,
  free_seating  boolean not null default false,
  pacing        integer not null default 0 check (pacing >= 0),
  turn_times    jsonb not null default '[{"maxP":2,"min":90},{"maxP":99,"min":120}]',
  seatings      text[] not null default '{}',
  sort          integer not null default 0,
  updated_at    timestamptz not null default now()
);

create table if not exists public.table_blocks (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  table_id    uuid not null references public.dining_tables(id) on delete cascade,
  date        date not null,
  service_id  uuid references public.services(id) on delete cascade,
  reason      text not null default '',
  updated_at  timestamptz not null default now()
);
create index if not exists table_blocks_date_idx on public.table_blocks (venue_id, date);

-- ---------------------------------------------------------------------
-- 3) Bewegungsdaten: Hotelaufenthalte, Reservierungen, Tischbelegung
-- ---------------------------------------------------------------------
create table if not exists public.stays (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  room_no     text not null,
  name        text not null,
  adults      integer not null default 2 check (adults >= 0),
  children    integer not null default 0 check (children >= 0),
  arrival     date not null,
  departure   date not null,
  board       text not null default 'HP' check (board in ('UF', 'HP', 'VP', 'AI')),
  phone       text not null default '',
  allergies   text not null default '',
  notes       text not null default '',
  vip         boolean not null default false,
  times       jsonb not null default '{}',
  table_ids   uuid[] not null default '{}',
  updated_at  timestamptz not null default now(),
  check (departure > arrival)
);
create index if not exists stays_period_idx on public.stays (venue_id, departure);

create table if not exists public.reservations (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references public.venues(id) on delete cascade,
  date          date not null,
  service_id    uuid not null references public.services(id) on delete cascade,
  time          time not null,
  duration      integer not null check (duration between 15 and 720),
  adults        integer not null default 2 check (adults >= 0),
  children      integer not null default 0 check (children >= 0),
  name          text not null check (length(trim(name)) > 0),
  phone         text not null default '',
  email         text not null default '',
  occasion      text not null default '',
  allergies     text not null default '',
  notes         text not null default '',
  highchair     boolean not null default false,
  vip           boolean not null default false,
  source        text not null default 'Telefon',
  status        text not null default 'bestaetigt'
                check (status in ('angefragt', 'bestaetigt', 'eingetroffen', 'platziert', 'rechnung', 'abgeschlossen', 'storniert', 'noshow')),
  wishes        text[] not null default '{}',
  stay_id       uuid references public.stays(id) on delete set null,
  manual_table  boolean not null default false,
  series_id     uuid,
  seated_at     integer,
  finished_at   integer,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  -- Belegungszeitraum (Datum + Uhrzeit + Dauer), Grundlage für den Doppelbuchungsschutz
  period        tsrange generated always as (tsrange(date + time, date + time + duration * interval '1 minute', '[)')) stored
);
create index if not exists reservations_date_idx on public.reservations (venue_id, date);
create index if not exists reservations_stay_idx on public.reservations (stay_id);

-- Zuordnung Reservierung ↔ Tisch(e). period/active werden per Trigger aus der Reservierung übernommen.
create table if not exists public.reservation_tables (
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  table_id        uuid not null references public.dining_tables(id) on delete cascade,
  venue_id        uuid not null references public.venues(id) on delete cascade,
  period          tsrange not null,
  active          boolean not null,
  primary key (reservation_id, table_id)
);
create index if not exists reservation_tables_table_idx on public.reservation_tables (table_id);

-- DER Doppelbuchungsschutz: aktive Belegungen desselben Tisches dürfen sich zeitlich nicht überschneiden
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservation_tables_no_overlap') then
    alter table public.reservation_tables
      add constraint reservation_tables_no_overlap
      exclude using gist (table_id with =, period with &&) where (active);
  end if;
end $$;

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  venue_id    uuid not null references public.venues(id) on delete cascade,
  ts          timestamptz not null default now(),
  user_id     uuid default auth.uid(),
  user_name   text not null default '',
  action      text not null,
  details     text not null default ''
);
create index if not exists audit_log_venue_idx on public.audit_log (venue_id, ts desc);

-- ---------------------------------------------------------------------
-- 4) Rechte-Hilfsfunktionen
-- ---------------------------------------------------------------------
create or replace function public.my_role(v uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.members where venue_id = v and user_id = auth.uid()
$$;

-- Schreibrechte je Rolle und Tabelle
--   admin   : alles
--   empfang : Reservierungen, Tischbelegung, Hotelaufenthalte, Tischsperren, Protokoll
--   service : Reservierungen (nur Status – per Trigger erzwungen), Protokoll
--   kueche  : nur lesen
create or replace function public.can_write(v uuid, tbl text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role(v)
    when 'admin'   then true
    when 'empfang' then tbl in ('reservations', 'reservation_tables', 'stays', 'table_blocks', 'audit_log')
    when 'service' then tbl in ('reservations', 'audit_log')
    else false
  end
$$;

-- ---------------------------------------------------------------------
-- 5) Trigger
-- ---------------------------------------------------------------------

-- updated_at pflegen
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['rooms', 'stations', 'dining_tables', 'decor', 'table_combos', 'layouts', 'services', 'table_blocks', 'stays', 'reservations'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- Service darf Reservierungen nur im Status ändern, aber keine anlegen
create or replace function public.guard_service_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array['status', 'seated_at', 'finished_at', 'updated_at', 'period'];
begin
  if public.my_role(new.venue_id) = 'service' then
    if tg_op = 'INSERT' then
      raise exception 'Keine Berechtigung: Service darf keine Reservierungen anlegen' using errcode = '42501';
    end if;
    if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
      raise exception 'Keine Berechtigung: Service darf nur den Status ändern' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists reservations_guard_service on public.reservations;
create trigger reservations_guard_service before insert or update on public.reservations
  for each row execute function public.guard_service_role();

-- Tischbelegung: Zeitraum und Aktiv-Flag aus der Reservierung übernehmen
create or replace function public.fill_reservation_table() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select venue_id, period, status into r from public.reservations where id = new.reservation_id;
  if not found then raise exception 'Reservierung % nicht gefunden', new.reservation_id; end if;
  new.venue_id := r.venue_id;
  new.period := r.period;
  new.active := r.status not in ('storniert', 'noshow', 'abgeschlossen');
  return new;
end $$;

drop trigger if exists reservation_tables_fill on public.reservation_tables;
create trigger reservation_tables_fill before insert or update on public.reservation_tables
  for each row execute function public.fill_reservation_table();

-- Änderungen an Zeit/Status der Reservierung an die Tischbelegung weitergeben
create or replace function public.sync_reservation_tables() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.period is distinct from old.period or new.status is distinct from old.status then
    update public.reservation_tables set period = new.period where reservation_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists reservations_sync_tables on public.reservations;
create trigger reservations_sync_tables after update on public.reservations
  for each row execute function public.sync_reservation_tables();

-- Gelöschte Tische aus Kombinationen und festen Hoteltischen entfernen
create or replace function public.cleanup_deleted_table() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.table_combos set table_ids = array_remove(table_ids, old.id)
    where venue_id = old.venue_id and old.id = any(table_ids) and cardinality(table_ids) > 2;
  delete from public.table_combos where venue_id = old.venue_id and old.id = any(table_ids);
  update public.stays set table_ids = array_remove(table_ids, old.id) where venue_id = old.venue_id and old.id = any(table_ids);
  return old;
end $$;

drop trigger if exists dining_tables_cleanup on public.dining_tables;
create trigger dining_tables_cleanup after delete on public.dining_tables
  for each row execute function public.cleanup_deleted_table();

-- ---------------------------------------------------------------------
-- 6) Row Level Security
-- ---------------------------------------------------------------------
alter table public.venues  enable row level security;
alter table public.members enable row level security;

drop policy if exists venues_select on public.venues;
create policy venues_select on public.venues for select to authenticated using (public.my_role(id) is not null);
drop policy if exists venues_update on public.venues;
create policy venues_update on public.venues for update to authenticated
  using (public.my_role(id) = 'admin') with check (public.my_role(id) = 'admin');

drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated using (public.my_role(venue_id) is not null);
drop policy if exists members_update on public.members;
create policy members_update on public.members for update to authenticated
  using (public.my_role(venue_id) = 'admin' and user_id <> auth.uid()) with check (public.my_role(venue_id) = 'admin');
drop policy if exists members_delete on public.members;
create policy members_delete on public.members for delete to authenticated
  using (public.my_role(venue_id) = 'admin' and user_id <> auth.uid());

do $$
declare t text;
begin
  foreach t in array array['rooms', 'stations', 'dining_tables', 'decor', 'table_combos', 'layouts', 'services', 'table_blocks', 'stays', 'reservations', 'reservation_tables'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.my_role(venue_id) is not null)', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.can_write(venue_id, %L))', t, t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.can_write(venue_id, %L)) with check (public.can_write(venue_id, %L))', t, t, t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.can_write(venue_id, %L) and public.my_role(venue_id) <> ''service'')', t, t, t);
  end loop;
end $$;

alter table public.audit_log enable row level security;
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated using (public.my_role(venue_id) is not null);
drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log for insert to authenticated with check (public.can_write(venue_id, 'audit_log'));

-- ---------------------------------------------------------------------
-- 7) Funktionen (RPC)
-- ---------------------------------------------------------------------

-- Ersten Betrieb anlegen: aufrufender Benutzer wird Admin
create or replace function public.create_venue(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.venues (name) values (coalesce(nullif(trim(p_name), ''), 'Mein Betrieb')) returning id into v_id;
  insert into public.members (venue_id, user_id, role, name, email)
    values (v_id, auth.uid(), 'admin', split_part(coalesce(v_email, ''), '@', 1), coalesce(v_email, ''));
  return v_id;
end $$;

-- Mitglied per E-Mail hinzufügen oder Rolle ändern (nur Admin)
create or replace function public.add_member(p_venue uuid, p_email text, p_role text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if public.my_role(p_venue) is distinct from 'admin' then raise exception 'Nur Admins dürfen Mitglieder verwalten' using errcode = '42501'; end if;
  if p_role not in ('admin', 'empfang', 'service', 'kueche') then raise exception 'Ungültige Rolle'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Kein Benutzer mit dieser E-Mail gefunden. Bitte zuerst in Supabase unter Authentication → Users anlegen oder einladen.';
  end if;
  insert into public.members (venue_id, user_id, role, name, email)
    values (p_venue, v_user, p_role, coalesce(nullif(trim(p_name), ''), split_part(p_email, '@', 1)), lower(trim(p_email)))
  on conflict (venue_id, user_id) do update set role = excluded.role, name = excluded.name;
end $$;

-- Reservierung inkl. JSON-Ausgabe mit Tisch-IDs
create or replace function public.reservation_json(p_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select (to_jsonb(r) - 'period') || jsonb_build_object('table_ids',
           coalesce((select jsonb_agg(t.table_id) from public.reservation_tables t where t.reservation_id = r.id), '[]'::jsonb))
  from public.reservations r where r.id = p_id
$$;

-- Mehrere Reservierungen samt Tischen atomar speichern (alles oder nichts).
-- Läuft mit den Rechten des Aufrufers (RLS + Trigger greifen).
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
        occasion, allergies, notes, highchair, vip, source, status, wishes, stay_id, manual_table, series_id, seated_at, finished_at)
    values (rid, p_venue, (it->>'date')::date, (it->>'service_id')::uuid, (it->>'time')::time, (it->>'duration')::int,
        coalesce((it->>'adults')::int, 0), coalesce((it->>'children')::int, 0), it->>'name', coalesce(it->>'phone', ''), coalesce(it->>'email', ''),
        coalesce(it->>'occasion', ''), coalesce(it->>'allergies', ''), coalesce(it->>'notes', ''), coalesce((it->>'highchair')::boolean, false),
        coalesce((it->>'vip')::boolean, false), coalesce(it->>'source', 'Telefon'), coalesce(it->>'status', 'bestaetigt'),
        coalesce(array(select jsonb_array_elements_text(coalesce(it->'wishes', '[]'::jsonb))), '{}'),
        (it->>'stay_id')::uuid, coalesce((it->>'manual_table')::boolean, false), (it->>'series_id')::uuid,
        (it->>'seated_at')::int, (it->>'finished_at')::int)
    on conflict (id) do update set
        date = excluded.date, service_id = excluded.service_id, time = excluded.time, duration = excluded.duration,
        adults = excluded.adults, children = excluded.children, name = excluded.name, phone = excluded.phone, email = excluded.email,
        occasion = excluded.occasion, allergies = excluded.allergies, notes = excluded.notes, highchair = excluded.highchair,
        vip = excluded.vip, source = excluded.source, status = excluded.status, wishes = excluded.wishes, stay_id = excluded.stay_id,
        manual_table = excluded.manual_table, series_id = excluded.series_id, seated_at = excluded.seated_at, finished_at = excluded.finished_at
      where r.venue_id = p_venue;
    insert into public.reservation_tables (reservation_id, table_id, venue_id, period, active)
      select rid, t, p_venue, 'empty'::tsrange, false from unnest(tids) t
      where not exists (select 1 from public.reservation_tables x where x.reservation_id = rid and x.table_id = t);
  end loop;
  return coalesce((select jsonb_agg(public.reservation_json(i)) from unnest(ids) i), '[]'::jsonb);
end $$;

-- Hotelaufenthalt + zugehörige Reservierungen atomar speichern
create or replace function public.save_stay(p_venue uuid, p_stay jsonb, p_items jsonb, p_delete uuid[] default '{}') returns jsonb
language plpgsql security invoker set search_path = public as $$
declare sid uuid := coalesce((p_stay->>'id')::uuid, gen_random_uuid()); res jsonb;
begin
  insert into public.stays as s (id, venue_id, room_no, name, adults, children, arrival, departure, board, phone, allergies, notes, vip, times, table_ids)
  values (sid, p_venue, p_stay->>'room_no', p_stay->>'name', coalesce((p_stay->>'adults')::int, 1), coalesce((p_stay->>'children')::int, 0),
      (p_stay->>'arrival')::date, (p_stay->>'departure')::date, coalesce(p_stay->>'board', 'HP'), coalesce(p_stay->>'phone', ''),
      coalesce(p_stay->>'allergies', ''), coalesce(p_stay->>'notes', ''), coalesce((p_stay->>'vip')::boolean, false),
      coalesce(p_stay->'times', '{}'::jsonb), coalesce(array(select (jsonb_array_elements_text(coalesce(p_stay->'table_ids', '[]'::jsonb)))::uuid), '{}'))
  on conflict (id) do update set room_no = excluded.room_no, name = excluded.name, adults = excluded.adults, children = excluded.children,
      arrival = excluded.arrival, departure = excluded.departure, board = excluded.board, phone = excluded.phone, allergies = excluded.allergies,
      notes = excluded.notes, vip = excluded.vip, times = excluded.times, table_ids = excluded.table_ids
    where s.venue_id = p_venue;
  res := public.save_reservations(p_venue, p_items, p_delete);
  return jsonb_build_object('stay', (select to_jsonb(s) from public.stays s where s.id = sid), 'reservations', res);
end $$;

revoke all on function public.create_venue(text) from public, anon;
revoke all on function public.add_member(uuid, text, text, text) from public, anon;
revoke all on function public.save_reservations(uuid, jsonb, uuid[]) from public, anon;
revoke all on function public.save_stay(uuid, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.create_venue(text) to authenticated;
grant execute on function public.add_member(uuid, text, text, text) to authenticated;
grant execute on function public.save_reservations(uuid, jsonb, uuid[]) to authenticated;
grant execute on function public.save_stay(uuid, jsonb, jsonb, uuid[]) to authenticated;
grant execute on function public.reservation_json(uuid) to authenticated;
grant execute on function public.my_role(uuid) to authenticated;
grant execute on function public.can_write(uuid, text) to authenticated;

grant select, update on public.venues to authenticated;
grant select, update, delete on public.members to authenticated;
grant select, insert, update, delete on
  public.rooms, public.stations, public.dining_tables, public.decor, public.table_combos, public.layouts,
  public.services, public.table_blocks, public.stays, public.reservations, public.reservation_tables to authenticated;
grant select, insert on public.audit_log to authenticated;

-- ---------------------------------------------------------------------
-- 8) Storage: Grundriss-Bilder (Bucket "floorplans", Pfad <venue_id>/<datei>)
-- ---------------------------------------------------------------------
create or replace function public.is_venue_admin_path(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.my_role(split_part(p_name, '/', 1)::uuid) = 'admin';
exception when others then
  return false;
end $$;
grant execute on function public.is_venue_admin_path(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('floorplans', 'floorplans', true) on conflict (id) do nothing;
    execute 'drop policy if exists floorplans_insert on storage.objects';
    execute 'create policy floorplans_insert on storage.objects for insert to authenticated with check (bucket_id = ''floorplans'' and public.is_venue_admin_path(name))';
    execute 'drop policy if exists floorplans_update on storage.objects';
    execute 'create policy floorplans_update on storage.objects for update to authenticated using (bucket_id = ''floorplans'' and public.is_venue_admin_path(name))';
    execute 'drop policy if exists floorplans_delete on storage.objects';
    execute 'create policy floorplans_delete on storage.objects for delete to authenticated using (bucket_id = ''floorplans'' and public.is_venue_admin_path(name))';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 9) Realtime: Änderungen live an alle Geräte
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['venues', 'members', 'rooms', 'stations', 'dining_tables', 'decor', 'table_combos', 'layouts', 'services',
                             'table_blocks', 'stays', 'reservations', 'reservation_tables', 'audit_log'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
