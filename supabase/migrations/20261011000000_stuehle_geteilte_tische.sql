-- =====================================================================
-- 1) Tische mit oder ohne Stühle (Anzeige im Raumplan)
-- 2) Hotelgäste: bis zu 3 Zimmer dürfen sich gleichzeitig einen Tisch teilen
--
-- Doppelbuchungsschutz danach:
--   * externe Reservierungen untereinander  → Exclusion Constraint reservation_tables_no_overlap (wie bisher)
--   * extern ↔ Hotel und max. 3 Zimmer       → Trigger reservation_tables_shared (mit Sperre je Tisch,
--     damit gleichzeitige Speicherungen nacheinander geprüft werden)
-- Die Zahl 3 steht auch in src/domain/constants.ts (MAX_ROOMS_PER_TABLE).
-- Im Supabase SQL Editor ausführen. Mehrfaches Ausführen ist unschädlich.
-- =====================================================================

-- 1) Stühle -------------------------------------------------------------
alter table public.dining_tables add column if not exists show_chairs boolean not null default true;

-- 2) Geteilte Hotel-Tische ----------------------------------------------
alter table public.reservation_tables add column if not exists stay_id uuid;

-- Tischbelegung: Zeitraum, Aktiv-Flag und Aufenthalt aus der Reservierung übernehmen
create or replace function public.fill_reservation_table() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select venue_id, period, status, stay_id into r from public.reservations where id = new.reservation_id;
  if not found then raise exception 'Reservierung % nicht gefunden', new.reservation_id; end if;
  new.venue_id := r.venue_id;
  new.period := r.period;
  new.active := r.status not in ('storniert', 'noshow', 'abgeschlossen');
  new.stay_id := r.stay_id;
  return new;
end $$;

-- Änderungen an Zeit/Status/Aufenthalt der Reservierung an die Tischbelegung weitergeben
create or replace function public.sync_reservation_tables() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.period is distinct from old.period or new.status is distinct from old.status or new.stay_id is distinct from old.stay_id then
    update public.reservation_tables set period = new.period where reservation_id = new.id;
  end if;
  return new;
end $$;

-- Bestehende Zeilen nachtragen
update public.reservation_tables t set stay_id = r.stay_id
  from public.reservations r where r.id = t.reservation_id and t.stay_id is distinct from r.stay_id;

-- Exclusion Constraint nur noch für externe Reservierungen (Hotelgäste prüft der Trigger unten)
alter table public.reservation_tables drop constraint if exists reservation_tables_no_overlap;
alter table public.reservation_tables
  add constraint reservation_tables_no_overlap
  exclude using gist (table_id with =, period with &&) where (active and stay_id is null);

create or replace function public.check_shared_table() returns trigger
language plpgsql security definer set search_path = public as $$
declare rooms integer;
begin
  if not new.active then return new; end if;
  -- gleichzeitige Speicherungen für denselben Tisch nacheinander prüfen
  perform pg_advisory_xact_lock(hashtextextended('reservation_tables:' || new.table_id::text, 0));
  if new.stay_id is null then
    -- externe Reservierung: kein Hotelgast darf zur selben Zeit am Tisch sitzen
    if exists (select 1 from public.reservation_tables x
               where x.table_id = new.table_id and x.active and x.stay_id is not null
                 and x.reservation_id <> new.reservation_id and x.period && new.period) then
      raise exception using errcode = '23P01', message = 'reservation_tables_no_overlap: Tisch ist mit Hotelgästen belegt';
    end if;
  else
    -- Hotelgast: keine externe Reservierung zur selben Zeit …
    if exists (select 1 from public.reservation_tables x
               where x.table_id = new.table_id and x.active and x.stay_id is null
                 and x.reservation_id <> new.reservation_id and x.period && new.period) then
      raise exception using errcode = '23P01', message = 'reservation_tables_no_overlap: Tisch ist extern reserviert';
    end if;
    -- … und höchstens 3 verschiedene Zimmer gleichzeitig
    select count(distinct x.stay_id) into rooms from public.reservation_tables x
      where x.table_id = new.table_id and x.active and x.stay_id is not null and x.stay_id <> new.stay_id
        and x.reservation_id <> new.reservation_id and x.period && new.period;
    if rooms + 1 > 3 then
      raise exception using errcode = '23P01', message = 'reservation_tables_max_rooms: höchstens 3 Zimmer je Tisch';
    end if;
  end if;
  return new;
end $$;

-- läuft nach reservation_tables_fill (BEFORE-Trigger feuern alphabetisch)
drop trigger if exists reservation_tables_shared on public.reservation_tables;
create trigger reservation_tables_shared before insert or update on public.reservation_tables
  for each row execute function public.check_shared_table();
