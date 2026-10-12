-- =====================================================================
-- Dienstplan, Etappe 1: Modul-Schalter, Bereiche mit Bereichsleitungen,
-- Positionen, Mitarbeitende, Schichtvorlagen
-- Im Supabase SQL Editor ausführen. Mehrfaches Ausführen ist unschädlich.
--
-- Rechte:
--   admin          : alles
--   Bereichsleitung: Benutzer in departments.lead_ids – pflegt Positionen,
--                    Mitarbeitende und Vorlagen der eigenen Bereiche
--   alle anderen   : kein Zugriff auf die Dienstplan-Stammdaten
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Modul-Schalter je Betrieb
-- ---------------------------------------------------------------------
alter table public.venues add column if not exists modules text[] not null default '{}';

-- ---------------------------------------------------------------------
-- 2) Tabellen
-- ---------------------------------------------------------------------
create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  color       text not null default '#4F7BD1',
  sort        integer not null default 0,
  lead_ids    uuid[] not null default '{}',     -- Bereichsleitungen (auth.users.id)
  updated_at  timestamptz not null default now()
);
create index if not exists departments_venue_idx on public.departments (venue_id);

create table if not exists public.positions (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues(id) on delete cascade,
  department_id  uuid not null references public.departments(id) on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  sort           integer not null default 0,
  updated_at     timestamptz not null default now()
);
create index if not exists positions_venue_idx on public.positions (venue_id);

create table if not exists public.staff (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues(id) on delete cascade,
  department_id  uuid references public.departments(id) on delete set null,   -- Stammbereich
  name           text not null check (length(trim(name)) > 0),
  short          text not null default '',
  position_ids   uuid[] not null default '{}',   -- Qualifikationen, auch aus anderen Bereichen
  contract       text not null default 'unbefristet'
                 check (contract in ('unbefristet', 'befristet', 'saison', 'lehrling', 'aushilfe')),
  weekly_hours   numeric(4,1) not null default 40 check (weekly_hours between 0 and 60),
  contract_from  date,
  contract_to    date,
  phone          text not null default '',
  email          text not null default '',
  color          text not null default '#4F7BD1',
  notes          text not null default '',
  active         boolean not null default true,
  updated_at     timestamptz not null default now(),
  check (contract_to is null or contract_from is null or contract_to >= contract_from)
);
create index if not exists staff_venue_idx on public.staff (venue_id);

create table if not exists public.shift_templates (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues(id) on delete cascade,
  department_id  uuid not null references public.departments(id) on delete cascade,
  position_id    uuid references public.positions(id) on delete set null,
  name           text not null check (length(trim(name)) > 0),
  short          text not null default '',
  start_time     time not null,
  end_time       time not null,                  -- vor start_time = über Mitternacht
  start2         time,                           -- Teildienst: zweiter Block
  end2           time,
  break_min      integer not null default 0 check (break_min >= 0),
  color          text not null default '#4F7BD1',
  sort           integer not null default 0,
  updated_at     timestamptz not null default now(),
  check ((start2 is null) = (end2 is null))
);
create index if not exists shift_templates_venue_idx on public.shift_templates (venue_id);

-- ---------------------------------------------------------------------
-- 3) Trigger: updated_at, gelöschte Position aus den Qualifikationen entfernen
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['departments', 'positions', 'staff', 'shift_templates'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

create or replace function public.cleanup_deleted_position() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.staff set position_ids = array_remove(position_ids, old.id)
    where venue_id = old.venue_id and old.id = any(position_ids);
  return old;
end $$;
drop trigger if exists positions_cleanup on public.positions;
create trigger positions_cleanup after delete on public.positions
  for each row execute function public.cleanup_deleted_position();

-- ---------------------------------------------------------------------
-- 4) Rechte-Hilfsfunktionen
-- ---------------------------------------------------------------------

-- Admin oder Leitung dieses Bereichs (ohne Bereich: nur Admin)
create or replace function public.can_plan(v uuid, dept uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role(v) = 'admin'
      or (dept is not null and public.my_role(v) is not null and exists (
            select 1 from public.departments d where d.id = dept and d.venue_id = v and auth.uid() = any(d.lead_ids)))
$$;

-- Admin oder Leitung irgendeines Bereichs des Betriebs
create or replace function public.is_planner(v uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role(v) = 'admin'
      or (public.my_role(v) is not null and exists (
            select 1 from public.departments d where d.venue_id = v and auth.uid() = any(d.lead_ids)))
$$;

-- Küche darf jetzt (als mögliche Bereichsleitung) auch ins Protokoll schreiben
create or replace function public.can_write(v uuid, tbl text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role(v)
    when 'admin'   then true
    when 'empfang' then tbl in ('reservations', 'reservation_tables', 'stays', 'table_blocks', 'audit_log')
    when 'service' then tbl in ('reservations', 'audit_log')
    when 'kueche'  then tbl in ('ingredients', 'dishes', 'menus', 'audit_log')
    else false
  end
$$;

-- ---------------------------------------------------------------------
-- 5) Row Level Security
-- ---------------------------------------------------------------------

-- Bereiche: alle Mitglieder sehen sie (für die Ansichten), nur Admins ändern sie –
-- so kann sich niemand selbst zur Bereichsleitung machen
alter table public.departments enable row level security;
drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments for select to authenticated using (public.my_role(venue_id) is not null);
drop policy if exists departments_insert on public.departments;
create policy departments_insert on public.departments for insert to authenticated with check (public.my_role(venue_id) = 'admin');
drop policy if exists departments_update on public.departments;
create policy departments_update on public.departments for update to authenticated
  using (public.my_role(venue_id) = 'admin') with check (public.my_role(venue_id) = 'admin');
drop policy if exists departments_delete on public.departments;
create policy departments_delete on public.departments for delete to authenticated using (public.my_role(venue_id) = 'admin');

-- Positionen, Mitarbeitende, Vorlagen: lesen alle Planer (bereichsübergreifend einplanen),
-- ändern nur Admin bzw. Leitung des Bereichs – beim Verschieben in einen anderen
-- Bereich müssen alter (using) und neuer Bereich (with check) passen
do $$
declare t text;
begin
  foreach t in array array['positions', 'staff', 'shift_templates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_planner(venue_id))', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.can_plan(venue_id, department_id))', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.can_plan(venue_id, department_id)) with check (public.can_plan(venue_id, department_id))', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.can_plan(venue_id, department_id))', t, t);
  end loop;
end $$;

revoke all on function public.can_plan(uuid, uuid) from public, anon;
revoke all on function public.is_planner(uuid) from public, anon;
grant execute on function public.can_plan(uuid, uuid) to authenticated;
grant execute on function public.is_planner(uuid) to authenticated;
grant select, insert, update, delete on public.departments, public.positions, public.staff, public.shift_templates to authenticated;

-- ---------------------------------------------------------------------
-- 6) Realtime
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['departments', 'positions', 'staff', 'shift_templates'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
