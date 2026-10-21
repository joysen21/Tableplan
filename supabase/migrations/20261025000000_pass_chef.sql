-- Modul „Pass + Chef“: Gänge abrufen (Service) → fertig melden (Küche) → servieren (Service)
-- Eine Zeile je Abruf: Reservierung, Gang, Anzahl je Gericht, stornierte Portionen, Stand.
-- Sichtbarkeit wie die Bestellliste über public.module_allowed() (Standard: Service + Küche, Admin immer).

-- Standard-Rollen je Modul (solange in den Einstellungen nichts zugewiesen ist)
create or replace function public.module_allowed(v uuid, m text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(v) = 'admin', false) or exists (
    select 1 from public.venues x where x.id = v and m = any(x.modules)
      and coalesce(x.module_roles -> m, case m when 'bestellliste' then '["kueche"]'::jsonb
                                               when 'pass' then '["service", "kueche"]'::jsonb
                                               else '[]'::jsonb end) ? public.my_role(v))
$$;
revoke all on function public.module_allowed(uuid, text) from public;
grant execute on function public.module_allowed(uuid, text) to authenticated;

-- Der Service trägt am Pass die Menüauswahl für Gäste ohne Auswahl ein und storniert offene Portionen
create or replace function public.can_write(v uuid, tbl text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role(v)
    when 'admin'   then true
    when 'empfang' then tbl in ('reservations', 'reservation_tables', 'stays', 'table_blocks', 'menu_choices', 'audit_log')
    when 'service' then tbl in ('reservations', 'audit_log') or (tbl = 'menu_choices' and public.module_allowed(v, 'pass'))
    when 'kueche'  then tbl in ('ingredients', 'dishes', 'menus', 'menu_choices', 'audit_log')
    else false
  end
$$;

create table if not exists public.pass_calls (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  menu_id        uuid not null references public.menus(id) on delete cascade,
  course         text not null,
  counts         jsonb not null default '{}',   -- { dishId: Anzahl }
  cancelled      jsonb not null default '{}',   -- { dishId: stornierte Portionen }
  state          text not null default 'abgerufen' check (state in ('abgerufen', 'fertig', 'serviert')),
  called_by      text not null default '',      -- Benutzer-ID des Kellners, der abgerufen hat
  called_by_name text not null default '',
  called_at      timestamptz not null default now(),
  ready_at       timestamptz,
  served_at      timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists pass_calls_venue_idx on public.pass_calls (venue_id, called_at desc);
create index if not exists pass_calls_res_idx on public.pass_calls (reservation_id);

alter table public.pass_calls enable row level security;
drop policy if exists pass_calls_select on public.pass_calls;
create policy pass_calls_select on public.pass_calls for select to authenticated using (public.module_allowed(venue_id, 'pass'));
drop policy if exists pass_calls_insert on public.pass_calls;
create policy pass_calls_insert on public.pass_calls for insert to authenticated with check (public.module_allowed(venue_id, 'pass'));
drop policy if exists pass_calls_update on public.pass_calls;
create policy pass_calls_update on public.pass_calls for update to authenticated
  using (public.module_allowed(venue_id, 'pass')) with check (public.module_allowed(venue_id, 'pass'));
drop policy if exists pass_calls_delete on public.pass_calls;
create policy pass_calls_delete on public.pass_calls for delete to authenticated using (public.module_allowed(venue_id, 'pass'));

drop trigger if exists pass_calls_touch on public.pass_calls;
create trigger pass_calls_touch before update on public.pass_calls for each row execute function public.touch_updated_at();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pass_calls') then
    alter publication supabase_realtime add table public.pass_calls;
  end if;
end $$;

grant select, insert, update, delete on public.pass_calls to authenticated;
revoke all on public.pass_calls from anon;
