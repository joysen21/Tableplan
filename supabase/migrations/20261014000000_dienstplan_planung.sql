-- =====================================================================
-- Dienstplan, Etappen 2–6: Dienste (Wochenplan), Abwesenheiten,
-- Veröffentlichen, Lesezugang per Link / Kalender-Abo, „Heute im Dienst“,
-- Prüfregeln und Besetzungsschlüssel
-- Voraussetzung: 20261012000000_dienstplan.sql
-- Im Supabase SQL Editor ausführen. Mehrfaches Ausführen ist unschädlich.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Erweiterungen bestehender Tabellen
-- ---------------------------------------------------------------------
alter table public.venues      add column if not exists roster_settings jsonb not null default '{}';
alter table public.departments add column if not exists guests_per_staff integer check (guests_per_staff is null or guests_per_staff > 0);
alter table public.departments add column if not exists min_staff integer not null default 0 check (min_staff >= 0);
alter table public.staff       add column if not exists vacation_days numeric(4,1) not null default 0 check (vacation_days between 0 and 365);
alter table public.staff       add column if not exists share_token uuid not null default gen_random_uuid();
create unique index if not exists staff_share_token_idx on public.staff (share_token);

-- ---------------------------------------------------------------------
-- 2) Tabellen
-- ---------------------------------------------------------------------
create table if not exists public.shifts (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues(id) on delete cascade,
  department_id  uuid not null references public.departments(id) on delete cascade,
  staff_id       uuid references public.staff(id) on delete cascade,          -- null = offene Schicht
  position_id    uuid references public.positions(id) on delete set null,
  template_id    uuid references public.shift_templates(id) on delete set null,
  date           date not null,
  start_time     time not null,
  end_time       time not null,                  -- vor start_time = über Mitternacht
  start2         time,
  end2           time,
  break_min      integer not null default 0 check (break_min >= 0),
  note           text not null default '',
  updated_at     timestamptz not null default now(),
  check ((start2 is null) = (end2 is null))
);
create index if not exists shifts_date_idx on public.shifts (venue_id, date);
create index if not exists shifts_staff_idx on public.shifts (staff_id, date);

create table if not exists public.absences (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  staff_id    uuid not null references public.staff(id) on delete cascade,
  date_from   date not null,
  date_to     date not null,
  kind        text not null default 'urlaub' check (kind in ('urlaub', 'krank', 'frei', 'sonstiges')),
  note        text not null default '',
  updated_at  timestamptz not null default now(),
  check (date_to >= date_from)
);
create index if not exists absences_venue_idx on public.absences (venue_id, date_from);

create table if not exists public.roster_publications (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues(id) on delete cascade,
  department_id  uuid not null references public.departments(id) on delete cascade,
  week_start     date not null check (extract(isodow from week_start) = 1),   -- Montag
  published_at   timestamptz not null default now(),
  published_by   text not null default '',
  unique (department_id, week_start)
);
create index if not exists roster_publications_venue_idx on public.roster_publications (venue_id, week_start);

-- ---------------------------------------------------------------------
-- 3) Trigger
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['shifts', 'absences'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- Veröffentlichungszeit immer vom Server (Vergleich mit updated_at der Dienste)
create or replace function public.stamp_publication() returns trigger
language plpgsql as $$
begin
  new.published_at := now();
  return new;
end $$;
drop trigger if exists roster_publications_stamp on public.roster_publications;
create trigger roster_publications_stamp before insert or update on public.roster_publications
  for each row execute function public.stamp_publication();

-- Zeitblöcke eines Dienstes (Ende vor Beginn = Folgetag; Teildienst = 2 Blöcke)
create or replace function public.shift_ranges(d date, s time, e time, s2 time, e2 time) returns tsrange[]
language sql immutable as $$
  select array_remove(array[
    tsrange(d + s, d + e + case when e <= s then interval '1 day' else interval '0' end),
    case when s2 is not null and e2 is not null
      then tsrange(d + s2, d + e2 + case when e2 <= s2 then interval '1 day' else interval '0' end) end
  ], null)
$$;

-- Doppelbelegung sperren: dieselbe Person kann nicht zwei Dienste zur gleichen Zeit haben
-- (Sperre je Person, damit gleichzeitiges Speichern auf zwei Geräten nicht durchrutscht)
create or replace function public.check_shift_overlap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.staff_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('shift:' || new.staff_id::text));
  if exists (
    select 1 from public.shifts o,
      unnest(public.shift_ranges(o.date, o.start_time, o.end_time, o.start2, o.end2)) a,
      unnest(public.shift_ranges(new.date, new.start_time, new.end_time, new.start2, new.end2)) b
    where o.staff_id = new.staff_id and o.id <> new.id and o.date between new.date - 1 and new.date + 1 and a && b
  ) then
    raise exception 'shift_overlap: Diese Person hat zu dieser Zeit schon einen Dienst.' using errcode = '23P01';
  end if;
  return new;
end $$;
drop trigger if exists shifts_no_overlap on public.shifts;
create trigger shifts_no_overlap before insert or update on public.shifts
  for each row execute function public.check_shift_overlap();

-- ---------------------------------------------------------------------
-- 4) Rechte
-- ---------------------------------------------------------------------
create or replace function public.staff_department(p_staff uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select department_id from public.staff where id = p_staff
$$;

-- Dienste & Veröffentlichungen: lesen alle Planer, ändern Admin bzw. Leitung des Bereichs, dem der Dienst gehört
-- (so kann die Küchenleitung auch eine Servicekraft für einen Küchendienst einplanen)
do $$
declare t text;
begin
  foreach t in array array['shifts', 'roster_publications'] loop
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

-- Abwesenheiten: Bereich = Stammbereich der Person
alter table public.absences enable row level security;
drop policy if exists absences_select on public.absences;
create policy absences_select on public.absences for select to authenticated using (public.is_planner(venue_id));
drop policy if exists absences_insert on public.absences;
create policy absences_insert on public.absences for insert to authenticated with check (public.can_plan(venue_id, public.staff_department(staff_id)));
drop policy if exists absences_update on public.absences;
create policy absences_update on public.absences for update to authenticated
  using (public.can_plan(venue_id, public.staff_department(staff_id))) with check (public.can_plan(venue_id, public.staff_department(staff_id)));
drop policy if exists absences_delete on public.absences;
create policy absences_delete on public.absences for delete to authenticated using (public.can_plan(venue_id, public.staff_department(staff_id)));

grant select, insert, update, delete on public.shifts, public.absences, public.roster_publications to authenticated;
revoke all on function public.staff_department(uuid) from public, anon;
grant execute on function public.staff_department(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Lesezugang ohne Login: Mitarbeiter-Link /p/<token> und Kalender-Abo
--    Nur veröffentlichte Wochen; eigene Dienste + Team (gleiche Bereiche) mit Namen,
--    keine Kontaktdaten. Zeitraum: Vorwoche bis 6 Wochen voraus.
-- ---------------------------------------------------------------------
create or replace function public.public_roster(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  st public.staff; v_from date; v_to date; v_deps uuid[]; res jsonb;
begin
  select * into st from public.staff where share_token = p_token and active;
  if not found then return null; end if;
  v_from := date_trunc('week', current_date)::date - 7;
  v_to   := v_from + 48;
  -- Bereiche: Stammbereich + Bereiche, in denen die Person eingeplant ist
  select array_agg(distinct x) into v_deps from (
    select st.department_id as x where st.department_id is not null
    union select s.department_id from public.shifts s where s.staff_id = st.id and s.date between v_from and v_to
  ) q;
  select jsonb_build_object(
    'venueName', (select name from public.venues where id = st.venue_id),
    'staffName', st.name, 'from', v_from, 'to', v_to,
    'publishedAt', (select max(p.published_at) from public.roster_publications p where p.venue_id = st.venue_id and p.department_id = any(coalesce(v_deps, '{}'))),
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'departmentId', s.department_id, 'staffId', s.staff_id, 'positionId', s.position_id, 'templateId', s.template_id,
        'date', s.date, 'start', to_char(s.start_time, 'HH24:MI'), 'end', to_char(s.end_time, 'HH24:MI'),
        'start2', to_char(s.start2, 'HH24:MI'), 'end2', to_char(s.end2, 'HH24:MI'), 'breakMin', s.break_min, 'note', s.note,
        'staffName', coalesce(m.name, 'Offene Schicht'), 'departmentName', d.name,
        'color', coalesce(t.color, d.color), 'mine', s.staff_id = st.id, 'changed', s.updated_at > p.published_at
      ) order by s.date, s.start_time)
      from public.shifts s
      join public.departments d on d.id = s.department_id
      join public.roster_publications p on p.department_id = s.department_id and p.week_start = date_trunc('week', s.date)::date
      left join public.staff m on m.id = s.staff_id
      left join public.shift_templates t on t.id = s.template_id
      where s.venue_id = st.venue_id and s.date between v_from and v_to
        and (s.staff_id = st.id or s.department_id = any(coalesce(v_deps, '{}')))
    ), '[]'::jsonb),
    'absences', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'staffId', a.staff_id, 'from', a.date_from, 'to', a.date_to, 'kind', a.kind, 'note', ''))
      from public.absences a where a.staff_id = st.id and a.date_to >= v_from and a.date_from <= v_to
    ), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- „Heute im Dienst“ für alle Mitglieder (z. B. im Live-Plan) – nur veröffentlichte Dienste
create or replace function public.on_duty(p_venue uuid, p_date date) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.my_role(p_venue) is null then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'staffName', m.name, 'departmentName', d.name, 'color', coalesce(t.color, d.color),
      'start', to_char(s.start_time, 'HH24:MI'), 'end', to_char(s.end_time, 'HH24:MI'),
      'start2', to_char(s.start2, 'HH24:MI'), 'end2', to_char(s.end2, 'HH24:MI')
    ) order by d.sort, s.start_time, m.name)
    from public.shifts s
    join public.staff m on m.id = s.staff_id
    join public.departments d on d.id = s.department_id
    join public.roster_publications p on p.department_id = s.department_id and p.week_start = date_trunc('week', s.date)::date
    left join public.shift_templates t on t.id = s.template_id
    where s.venue_id = p_venue and s.date = p_date
  ), '[]'::jsonb) end
$$;

revoke all on function public.public_roster(uuid) from public;
grant execute on function public.public_roster(uuid) to anon, authenticated;
revoke all on function public.on_duty(uuid, date) from public, anon;
grant execute on function public.on_duty(uuid, date) to authenticated;

-- ---------------------------------------------------------------------
-- 6) Realtime
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['shifts', 'absences', 'roster_publications'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
