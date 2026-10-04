-- =====================================================================
-- Tischplan – Supabase-Schema
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen.
-- Das Skript kann gefahrlos mehrfach ausgeführt werden.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabellen
-- ---------------------------------------------------------------------

-- Ein Betrieb = ein Restaurant/Hotel (mandantenfähig)
create table if not exists public.tp_betriebe (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Wer darf in welchem Betrieb mit welcher Rolle arbeiten
create table if not exists public.tp_mitglieder (
  betrieb_id  uuid not null references public.tp_betriebe(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'empfang', 'service', 'kueche')),
  name        text not null default '',
  email       text not null default '',
  created_at  timestamptz not null default now(),
  primary key (betrieb_id, user_id)
);
create index if not exists tp_mitglieder_user_idx on public.tp_mitglieder (user_id);

-- Alle Fachdaten als Datensätze je "Sammlung" (coll):
--   rooms, tables, decor, combos, stations, services, layouts,
--   stays, reservations, audit, meta
-- data enthält das JSON-Objekt genau so, wie es die App verwendet.
-- res_date wird von der App bei Reservierungen gesetzt (für das Laden nach Zeitraum).
create table if not exists public.tp_records (
  betrieb_id  uuid not null references public.tp_betriebe(id) on delete cascade,
  coll        text not null check (coll in ('rooms','tables','decor','combos','stations','services','layouts','stays','reservations','audit','meta')),
  id          text not null,
  data        jsonb not null,
  res_date    date,
  client_id   text,                                  -- Gerät, das zuletzt geschrieben hat (Echo-Unterdrückung)
  updated_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  primary key (betrieb_id, coll, id)
);
create index if not exists tp_records_res_idx   on public.tp_records (betrieb_id, coll, res_date);
create index if not exists tp_records_audit_idx on public.tp_records (betrieb_id, coll, updated_at desc);

-- Zeitstempel und Benutzer bei jeder Änderung serverseitig setzen
create or replace function public.tp_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists tp_records_touch on public.tp_records;
create trigger tp_records_touch before insert or update on public.tp_records
  for each row execute function public.tp_touch();

-- ---------------------------------------------------------------------
-- 2) Hilfsfunktionen für die Rechteprüfung
-- ---------------------------------------------------------------------

-- Rolle des angemeldeten Benutzers im Betrieb (null = kein Zugriff)
create or replace function public.tp_role(b uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from public.tp_mitglieder where betrieb_id = b and user_id = auth.uid()
$$;

-- Schreibrechte je Rolle und Sammlung
--   admin   : alles
--   empfang : Reservierungen, Hotelaufenthalte, Protokoll, Tische (für Tischsperren)
--   service : Reservierungen (Status) und Protokoll
--   kueche  : nur lesen
create or replace function public.tp_can_write(b uuid, c text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.tp_role(b)
    when 'admin'   then true
    when 'empfang' then c in ('reservations', 'stays', 'audit', 'tables')
    when 'service' then c in ('reservations', 'audit')
    else false
  end
$$;

-- ---------------------------------------------------------------------
-- 3) Row Level Security
-- ---------------------------------------------------------------------
alter table public.tp_betriebe   enable row level security;
alter table public.tp_mitglieder enable row level security;
alter table public.tp_records    enable row level security;

drop policy if exists tp_betriebe_select on public.tp_betriebe;
create policy tp_betriebe_select on public.tp_betriebe for select to authenticated
  using (public.tp_role(id) is not null);
drop policy if exists tp_betriebe_update on public.tp_betriebe;
create policy tp_betriebe_update on public.tp_betriebe for update to authenticated
  using (public.tp_role(id) = 'admin') with check (public.tp_role(id) = 'admin');

drop policy if exists tp_mitglieder_select on public.tp_mitglieder;
create policy tp_mitglieder_select on public.tp_mitglieder for select to authenticated
  using (public.tp_role(betrieb_id) is not null);
drop policy if exists tp_mitglieder_update on public.tp_mitglieder;
create policy tp_mitglieder_update on public.tp_mitglieder for update to authenticated
  using (public.tp_role(betrieb_id) = 'admin' and user_id <> auth.uid())
  with check (public.tp_role(betrieb_id) = 'admin');
drop policy if exists tp_mitglieder_delete on public.tp_mitglieder;
create policy tp_mitglieder_delete on public.tp_mitglieder for delete to authenticated
  using (public.tp_role(betrieb_id) = 'admin' and user_id <> auth.uid());
-- Neue Mitglieder nur über die Funktion tp_add_member (siehe unten)

drop policy if exists tp_records_select on public.tp_records;
create policy tp_records_select on public.tp_records for select to authenticated
  using (public.tp_role(betrieb_id) is not null);
drop policy if exists tp_records_insert on public.tp_records;
create policy tp_records_insert on public.tp_records for insert to authenticated
  with check (public.tp_can_write(betrieb_id, coll));
drop policy if exists tp_records_update on public.tp_records;
create policy tp_records_update on public.tp_records for update to authenticated
  using (public.tp_can_write(betrieb_id, coll)) with check (public.tp_can_write(betrieb_id, coll));
drop policy if exists tp_records_delete on public.tp_records;
create policy tp_records_delete on public.tp_records for delete to authenticated
  using (public.tp_can_write(betrieb_id, coll) and public.tp_role(betrieb_id) in ('admin', 'empfang') and coll <> 'audit');

-- ---------------------------------------------------------------------
-- 4) Funktionen für Betrieb und Mitglieder
-- ---------------------------------------------------------------------

-- Ersten Betrieb anlegen: der aufrufende Benutzer wird Admin
create or replace function public.tp_create_betrieb(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_email text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.tp_betriebe (name) values (coalesce(nullif(trim(p_name), ''), 'Mein Betrieb')) returning id into v_id;
  insert into public.tp_mitglieder (betrieb_id, user_id, role, name, email)
    values (v_id, auth.uid(), 'admin', split_part(coalesce(v_email, ''), '@', 1), coalesce(v_email, ''));
  return v_id;
end $$;

-- Mitglied per E-Mail hinzufügen / Rolle setzen (nur Admin).
-- Der Benutzer muss vorher in Supabase existieren (Authentication → Users → Invite user).
create or replace function public.tp_add_member(p_betrieb uuid, p_email text, p_role text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
begin
  if public.tp_role(p_betrieb) is distinct from 'admin' then raise exception 'Nur Admins dürfen Mitglieder verwalten'; end if;
  if p_role not in ('admin', 'empfang', 'service', 'kueche') then raise exception 'Ungültige Rolle'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Kein Benutzer mit dieser E-Mail gefunden. Bitte zuerst in Supabase unter Authentication → Users einladen.';
  end if;
  insert into public.tp_mitglieder (betrieb_id, user_id, role, name, email)
    values (p_betrieb, v_user, p_role, coalesce(nullif(trim(p_name), ''), split_part(p_email, '@', 1)), lower(trim(p_email)))
  on conflict (betrieb_id, user_id) do update set role = excluded.role, name = excluded.name;
end $$;

revoke all on function public.tp_create_betrieb(text) from public, anon;
revoke all on function public.tp_add_member(uuid, text, text, text) from public, anon;
grant execute on function public.tp_create_betrieb(text) to authenticated;
grant execute on function public.tp_add_member(uuid, text, text, text) to authenticated;
grant execute on function public.tp_role(uuid) to authenticated;
grant execute on function public.tp_can_write(uuid, text) to authenticated;

grant select, update on public.tp_betriebe to authenticated;
grant select, update, delete on public.tp_mitglieder to authenticated;
grant select, insert, update, delete on public.tp_records to authenticated;

-- ---------------------------------------------------------------------
-- 5) Realtime: Änderungen live an alle Geräte senden
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tp_records') then
    alter publication supabase_realtime add table public.tp_records;
  end if;
end $$;
