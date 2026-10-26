-- Modul „Fälligkeiten“: wiederkehrende oder einmalige Termine (Wartung, Prüfungen, Verträge …)
-- mit Gruppe, Fälligkeitsdatum, Intervall in Monaten, Verantwortlichem (Mitarbeiter), Erinnerung (Tage vorher) und Erledigt-Flag.
-- Sichtbarkeit über public.module_allowed() (Standard: Empfang, Admin immer).

create or replace function public.module_allowed(v uuid, m text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(v) = 'admin', false) or exists (
    select 1 from public.venues x where x.id = v and m = any(x.modules)
      and coalesce(x.module_roles -> m, case m when 'bestellliste' then '["kueche"]'::jsonb
                                               when 'pass' then '["service", "kueche"]'::jsonb
                                               when 'garage' then '["empfang"]'::jsonb
                                               when 'massage' then '["empfang"]'::jsonb
                                               when 'fahrrad' then '["empfang"]'::jsonb
                                               when 'faelligkeiten' then '["empfang"]'::jsonb
                                               else '[]'::jsonb end) ? public.my_role(v))
$$;
revoke all on function public.module_allowed(uuid, text) from public;
grant execute on function public.module_allowed(uuid, text) to authenticated;

create table if not exists public.due_groups (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  sort       integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists due_groups_venue_idx on public.due_groups (venue_id);

create table if not exists public.due_items (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references public.venues(id) on delete cascade,
  title           text not null check (length(trim(title)) > 0),
  group_id        uuid references public.due_groups(id) on delete set null,
  due_date        date not null,
  interval_months integer not null default 0 check (interval_months between 0 and 240),  -- 0 = einmalig
  staff_id        uuid,                              -- Verantwortliche/r (Mitarbeiter aus dem Dienstplan)
  staff_name      text not null default '',          -- Name zum Anzeigen (auch ohne Lesezugriff auf den Dienstplan)
  reminder_days   integer not null default 14 check (reminder_days between 0 and 365),
  done            boolean not null default false,
  done_at         date,
  last_done       date,
  note            text not null default '',
  updated_at      timestamptz not null default now()
);
create index if not exists due_items_venue_idx on public.due_items (venue_id, due_date);

alter table public.due_groups enable row level security;
alter table public.due_items enable row level security;
drop policy if exists due_groups_all on public.due_groups;
create policy due_groups_all on public.due_groups for all to authenticated
  using (public.module_allowed(venue_id, 'faelligkeiten')) with check (public.module_allowed(venue_id, 'faelligkeiten'));
drop policy if exists due_items_all on public.due_items;
create policy due_items_all on public.due_items for all to authenticated
  using (public.module_allowed(venue_id, 'faelligkeiten')) with check (public.module_allowed(venue_id, 'faelligkeiten'));

do $$
declare t text;
begin
  foreach t in array array['due_groups', 'due_items'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

grant select, insert, update, delete on public.due_groups, public.due_items to authenticated;
revoke all on public.due_groups, public.due_items from anon;

-- Auswahl der Verantwortlichen: nur Name der aktiven Mitarbeitenden – auch für Rollen ohne Lesezugriff auf den Dienstplan
create or replace function public.due_staff(p_venue uuid) returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select s.id, s.name from public.staff s
  where s.venue_id = p_venue and s.active and public.module_allowed(p_venue, 'faelligkeiten')
  order by s.name
$$;
revoke all on function public.due_staff(uuid) from public, anon;
grant execute on function public.due_staff(uuid) to authenticated;

-- Startgruppen je Betrieb (nur wenn noch keine angelegt sind)
insert into public.due_groups (venue_id, name, sort)
select v.id, g.name, g.sort from public.venues v
cross join (values ('Wartung', 0), ('Prüfungen & Behörden', 1), ('Verträge', 2), ('Versicherungen', 3)) as g(name, sort)
where not exists (select 1 from public.due_groups x where x.venue_id = v.id);
