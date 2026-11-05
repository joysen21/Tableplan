-- =====================================================================
-- Dienstplan: Anfragen über den Mitarbeiter-Link und Saisonzeiträume
--   * Frei-Wunsch und Urlaub  → Bereichsleitung genehmigt/lehnt ab, erst dann Abwesenheit
--   * Krankmeldung            → sofort als Abwesenheit, Dienste ab heute werden offene Schichten,
--                               Leitung nimmt sie zur Kenntnis
--   * Dienst-Tausch           → Angebot → Kolleg:in gleichen Bereichs übernimmt → Leitung bestätigt
--   * Saison                  → venues.roster_settings.seasons = [{id, name, from, to}];
--                               außerhalb keine Anfragen (Planer zeigt Hinweise)
-- Voraussetzung: 20261012000000_dienstplan.sql, 20261014000000_dienstplan_planung.sql
-- Im Supabase SQL Editor ausführen. Mehrfaches Ausführen ist unschädlich.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabelle
-- ---------------------------------------------------------------------
create table if not exists public.roster_requests (
  id             uuid primary key default gen_random_uuid(),
  venue_id       uuid not null references public.venues(id) on delete cascade,
  staff_id       uuid not null references public.staff(id) on delete cascade,
  department_id  uuid references public.departments(id) on delete set null,   -- entscheidet: Leitung dieses Bereichs
  kind           text not null check (kind in ('frei', 'urlaub', 'krank', 'tausch')),
  date_from      date not null,
  date_to        date not null,
  shift_id       uuid references public.shifts(id) on delete cascade,          -- nur Tausch
  taker_id       uuid references public.staff(id) on delete set null,          -- nur Tausch: wer übernimmt
  note           text not null default '' check (length(note) <= 500),
  status         text not null default 'offen' check (status in ('offen', 'uebernommen', 'genehmigt', 'abgelehnt')),
  answer         text not null default '' check (length(answer) <= 500),
  decided_by     text not null default '',
  decided_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (date_to >= date_from),
  check (kind = 'tausch' or shift_id is null)
);
create index if not exists roster_requests_venue_idx on public.roster_requests (venue_id, date_to);
create index if not exists roster_requests_staff_idx on public.roster_requests (staff_id);
-- je Dienst höchstens ein laufendes Tauschangebot
create unique index if not exists roster_requests_one_offer on public.roster_requests (shift_id)
  where kind = 'tausch' and status in ('offen', 'uebernommen');

drop trigger if exists roster_requests_touch on public.roster_requests;
create trigger roster_requests_touch before update on public.roster_requests
  for each row execute function public.touch_updated_at();

-- Lesen: alle Planer (wie Abwesenheiten); ändern nur Admin bzw. Leitung des Bereichs.
-- Mitarbeitende schreiben ausschließlich über die Link-Funktionen unten.
alter table public.roster_requests enable row level security;
drop policy if exists roster_requests_select on public.roster_requests;
create policy roster_requests_select on public.roster_requests for select to authenticated using (public.is_planner(venue_id));
drop policy if exists roster_requests_update on public.roster_requests;
create policy roster_requests_update on public.roster_requests for update to authenticated
  using (public.can_plan(venue_id, department_id)) with check (public.can_plan(venue_id, department_id));
drop policy if exists roster_requests_delete on public.roster_requests;
create policy roster_requests_delete on public.roster_requests for delete to authenticated using (public.can_plan(venue_id, department_id));
grant select, update, delete on public.roster_requests to authenticated;

-- ---------------------------------------------------------------------
-- 2) Hilfsfunktionen
-- ---------------------------------------------------------------------
-- Liegt jeder Tag von–bis in einer Saison? Ohne Saison: ja (ganzjährig)
create or replace function public.roster_in_season(p_venue uuid, p_from date, p_to date) returns boolean
language sql stable security definer set search_path = public as $$
  with s as (
    select (e->>'from')::date f, (e->>'to')::date t
    from public.venues v, jsonb_array_elements(coalesce(v.roster_settings->'seasons', '[]'::jsonb)) e
    where v.id = p_venue
  )
  select not exists (select 1 from s) or not exists (
    select 1 from generate_series(p_from, p_to, interval '1 day') g(day)
    where not exists (select 1 from s where g.day::date between s.f and s.t)
  )
$$;

-- Mitarbeiter/in zum persönlichen Link (nur aktive)
create or replace function public.roster_link_staff(p_token uuid) returns public.staff
language plpgsql stable security definer set search_path = public as $$
declare st public.staff;
begin
  select * into st from public.staff where share_token = p_token and active;
  if not found then raise exception 'roster_request: Dieser Link ist ungültig oder wurde erneuert.' using errcode = '42501'; end if;
  return st;
end $$;

-- ---------------------------------------------------------------------
-- 3) Mitarbeiter-Link: Anfrage stellen / zurücknehmen
-- ---------------------------------------------------------------------
create or replace function public.roster_request(p_token uuid, p_kind text, p_from date, p_to date, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare st public.staff; v_id uuid; v_note text := left(trim(coalesce(p_note, '')), 500);
begin
  st := public.roster_link_staff(p_token);
  perform pg_advisory_xact_lock(hashtext('request:' || st.id::text));
  if p_kind not in ('frei', 'urlaub', 'krank') then raise exception 'roster_request: Unbekannte Art der Anfrage.'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'roster_request: Das Bis-Datum liegt vor dem Von-Datum.'; end if;
  if p_from < current_date - case when p_kind = 'krank' then 7 else 0 end then
    raise exception 'roster_request: Dieser Zeitraum liegt zu weit in der Vergangenheit.'; end if;
  if p_to > current_date + 400 then raise exception 'roster_request: Bitte höchstens ein Jahr im Voraus anfragen.'; end if;
  if not public.roster_in_season(st.venue_id, p_from, p_to) then
    raise exception 'roster_request: Außerhalb der Saison sind keine Anfragen möglich.'; end if;
  if exists (select 1 from public.absences a where a.staff_id = st.id and a.date_from <= p_to and p_from <= a.date_to) then
    raise exception 'roster_request: Für diesen Zeitraum ist schon eine Abwesenheit eingetragen.'; end if;
  if p_kind <> 'krank' and exists (select 1 from public.roster_requests r where r.staff_id = st.id and r.kind in ('frei', 'urlaub')
      and r.status = 'offen' and r.date_from <= p_to and p_from <= r.date_to) then
    raise exception 'roster_request: Für diesen Zeitraum gibt es schon eine offene Anfrage.'; end if;

  insert into public.roster_requests (venue_id, staff_id, department_id, kind, date_from, date_to, note)
    values (st.venue_id, st.id, st.department_id, p_kind, p_from, p_to, v_note) returning id into v_id;

  if p_kind = 'krank' then
    insert into public.absences (venue_id, staff_id, date_from, date_to, kind, note)
      values (st.venue_id, st.id, p_from, p_to, 'krank', concat_ws(' · ', 'Krankmeldung über den Mitarbeiter-Link', nullif(v_note, '')));
    update public.shifts set staff_id = null, note = concat_ws(' · ', nullif(trim(note), ''), st.name || ' krank')
      where staff_id = st.id and date between greatest(p_from, current_date) and p_to;
  end if;
  return v_id;
end $$;

create or replace function public.roster_request_cancel(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare st public.staff;
begin
  st := public.roster_link_staff(p_token);
  delete from public.roster_requests where id = p_id and staff_id = st.id and kind <> 'krank' and status in ('offen', 'uebernommen');
  if not found then raise exception 'roster_request: Diese Anfrage kann nicht mehr zurückgenommen werden.'; end if;
end $$;

-- ---------------------------------------------------------------------
-- 4) Mitarbeiter-Link: Dienst-Tausch
-- ---------------------------------------------------------------------
create or replace function public.roster_swap_offer(p_token uuid, p_shift uuid, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare st public.staff; s public.shifts; v_id uuid;
begin
  st := public.roster_link_staff(p_token);
  select * into s from public.shifts where id = p_shift and staff_id = st.id and date >= current_date;
  if not found then raise exception 'roster_request: Diesen Dienst kannst du nicht (mehr) anbieten.'; end if;
  if not exists (select 1 from public.roster_publications p where p.department_id = s.department_id and p.week_start = date_trunc('week', s.date)::date) then
    raise exception 'roster_request: Dieser Dienst ist noch nicht veröffentlicht.'; end if;
  if not public.roster_in_season(st.venue_id, s.date, s.date) then
    raise exception 'roster_request: Außerhalb der Saison sind keine Anfragen möglich.'; end if;
  begin
    insert into public.roster_requests (venue_id, staff_id, department_id, kind, date_from, date_to, shift_id, note)
      values (st.venue_id, st.id, s.department_id, 'tausch', s.date, s.date, s.id, left(trim(coalesce(p_note, '')), 500)) returning id into v_id;
  exception when unique_violation then
    raise exception 'roster_request: Dieser Dienst wird schon zum Tausch angeboten.';
  end;
  return v_id;
end $$;

-- take = true: übernehmen (gleicher Stammbereich wie der Dienst, keine Überschneidung, nicht abwesend);
-- take = false: eigene Übernahme wieder zurückgeben
create or replace function public.roster_swap_take(p_token uuid, p_id uuid, p_take boolean) returns void
language plpgsql security definer set search_path = public as $$
declare st public.staff; r public.roster_requests; s public.shifts;
begin
  st := public.roster_link_staff(p_token);
  select * into r from public.roster_requests where id = p_id and kind = 'tausch' and venue_id = st.venue_id for update;
  if not found then raise exception 'roster_request: Dieses Angebot gibt es nicht mehr.'; end if;
  if not p_take then
    if r.taker_id is distinct from st.id or r.status <> 'uebernommen' then raise exception 'roster_request: Dieses Angebot kannst du nicht zurückgeben.'; end if;
    update public.roster_requests set status = 'offen', taker_id = null where id = r.id;
    return;
  end if;
  if r.status <> 'offen' then raise exception 'roster_request: Dieses Angebot hat schon jemand übernommen.'; end if;
  if r.staff_id = st.id then raise exception 'roster_request: Das ist dein eigenes Angebot.'; end if;
  if st.department_id is distinct from r.department_id then raise exception 'roster_request: Nur Kolleg:innen des gleichen Bereichs können übernehmen.'; end if;
  select * into s from public.shifts where id = r.shift_id;
  if not found or s.date < current_date then raise exception 'roster_request: Dieser Dienst ist nicht mehr verfügbar.'; end if;
  if exists (select 1 from public.absences a where a.staff_id = st.id and s.date between a.date_from and a.date_to) then
    raise exception 'roster_request: Du bist an diesem Tag abwesend.'; end if;
  if exists (
    select 1 from public.shifts o,
      unnest(public.shift_ranges(o.date, o.start_time, o.end_time, o.start2, o.end2)) a,
      unnest(public.shift_ranges(s.date, s.start_time, s.end_time, s.start2, s.end2)) b
    where o.staff_id = st.id and o.id <> s.id and o.date between s.date - 1 and s.date + 1 and a && b
  ) then raise exception 'roster_request: Du hast zu dieser Zeit schon einen Dienst.'; end if;
  update public.roster_requests set status = 'uebernommen', taker_id = st.id where id = r.id;
end $$;

-- ---------------------------------------------------------------------
-- 5) Leitung: genehmigen / ablehnen (atomar mit Abwesenheit bzw. Umtragung)
-- ---------------------------------------------------------------------
create or replace function public.roster_request_decide(p_id uuid, p_approve boolean, p_answer text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.roster_requests; v_by text; n int;
begin
  select * into r from public.roster_requests where id = p_id for update;
  if not found then raise exception 'roster_request: Diese Anfrage gibt es nicht mehr.'; end if;
  if not public.can_plan(r.venue_id, r.department_id) then
    raise exception 'roster_request: Keine Berechtigung: Diese Anfrage gehört zu einem Bereich, den Sie nicht leiten.' using errcode = '42501'; end if;
  if r.status not in ('offen', 'uebernommen') then raise exception 'roster_request: Diese Anfrage wurde schon bearbeitet.'; end if;
  select name into v_by from public.members where venue_id = r.venue_id and user_id = auth.uid();

  if p_approve then
    if r.kind in ('frei', 'urlaub') then
      if exists (select 1 from public.absences a where a.staff_id = r.staff_id and a.date_from <= r.date_to and r.date_from <= a.date_to) then
        raise exception 'roster_request: Für diesen Zeitraum ist schon eine Abwesenheit eingetragen.'; end if;
      insert into public.absences (venue_id, staff_id, date_from, date_to, kind, note)
        values (r.venue_id, r.staff_id, r.date_from, r.date_to, r.kind, r.note);
    elsif r.kind = 'tausch' then
      if r.status <> 'uebernommen' or r.taker_id is null then raise exception 'roster_request: Den Dienst hat noch niemand übernommen.'; end if;
      update public.shifts set staff_id = r.taker_id where id = r.shift_id and staff_id = r.staff_id;  -- Überschneidung prüft der Trigger
      get diagnostics n = row_count;
      if n = 0 then raise exception 'roster_request: Der Dienst wurde inzwischen geändert.'; end if;
    end if;
  end if;
  update public.roster_requests set status = case when p_approve then 'genehmigt' else 'abgelehnt' end,
    answer = left(trim(coalesce(p_answer, '')), 500), decided_by = coalesce(v_by, ''), decided_at = now()
    where id = r.id;
end $$;

-- ---------------------------------------------------------------------
-- 6) Lesezugang erweitert: eigene Anfragen, Tauschangebote der Kolleg:innen, Saison
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
    ), '[]'::jsonb),
    'seasons', coalesce((select roster_settings->'seasons' from public.venues where id = st.venue_id), '[]'::jsonb),
    -- eigene Anfragen: laufende und Entscheidungen der letzten 60 Tage
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'from', r.date_from, 'to', r.date_to, 'shiftId', r.shift_id, 'note', r.note, 'status', r.status,
        'answer', r.answer, 'decidedAt', r.decided_at, 'createdAt', r.created_at, 'takerName', tk.name
      ) order by r.created_at desc)
      from public.roster_requests r left join public.staff tk on tk.id = r.taker_id
      where r.staff_id = st.id and (r.status in ('offen', 'uebernommen') or coalesce(r.decided_at, r.created_at) >= now() - interval '60 days')
    ), '[]'::jsonb),
    -- Tauschangebote der Kolleg:innen im eigenen Bereich (offen oder von mir übernommen)
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'staffName', m.name, 'departmentName', d.name, 'color', coalesce(t.color, d.color), 'date', s.date,
        'start', to_char(s.start_time, 'HH24:MI'), 'end', to_char(s.end_time, 'HH24:MI'),
        'start2', to_char(s.start2, 'HH24:MI'), 'end2', to_char(s.end2, 'HH24:MI'), 'note', r.note, 'status', r.status,
        'takenByMe', r.taker_id = st.id
      ) order by s.date, s.start_time)
      from public.roster_requests r
      join public.shifts s on s.id = r.shift_id
      join public.staff m on m.id = r.staff_id
      join public.departments d on d.id = s.department_id
      left join public.shift_templates t on t.id = s.template_id
      where r.kind = 'tausch' and r.venue_id = st.venue_id and r.staff_id <> st.id and s.date >= current_date
        and r.department_id = st.department_id
        and (r.status = 'offen' or (r.status = 'uebernommen' and r.taker_id = st.id))
    ), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- ---------------------------------------------------------------------
-- 7) Rechte und Realtime
-- ---------------------------------------------------------------------
revoke all on function public.roster_in_season(uuid, date, date) from public, anon;
grant execute on function public.roster_in_season(uuid, date, date) to authenticated;
revoke all on function public.roster_link_staff(uuid) from public, anon, authenticated;
revoke all on function public.roster_request(uuid, text, date, date, text) from public;
grant execute on function public.roster_request(uuid, text, date, date, text) to anon, authenticated;
revoke all on function public.roster_request_cancel(uuid, uuid) from public;
grant execute on function public.roster_request_cancel(uuid, uuid) to anon, authenticated;
revoke all on function public.roster_swap_offer(uuid, uuid, text) from public;
grant execute on function public.roster_swap_offer(uuid, uuid, text) to anon, authenticated;
revoke all on function public.roster_swap_take(uuid, uuid, boolean) from public;
grant execute on function public.roster_swap_take(uuid, uuid, boolean) to anon, authenticated;
revoke all on function public.roster_request_decide(uuid, boolean, text) from public, anon;
grant execute on function public.roster_request_decide(uuid, boolean, text) to authenticated;
revoke all on function public.public_roster(uuid) from public;
grant execute on function public.public_roster(uuid) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'roster_requests') then
    alter publication supabase_realtime add table public.roster_requests;
  end if;
end $$;
