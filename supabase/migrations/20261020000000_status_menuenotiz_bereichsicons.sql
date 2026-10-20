-- =====================================================================
-- Eigene Reservierungs-Status, Notiz zur Menüauswahl (QR), Icons für Bereiche
--   * venues.status_config: Bezeichnung/Farbe/Ausblenden der Standard-Status und eigene Status
--   * reservations.sub_status: eigener Status (id aus status_config). Der Grundstatus in
--     reservations.status bleibt für alle Abläufe maßgeblich (Doppelbuchungsschutz, Live-Plan).
--   * menu_choices.note: Notiz des Gasts zur Menüauswahl (QR) bzw. vom Personal
--   * departments.icon: Icon des Bereichs statt Farbpunkt
-- Im Supabase SQL Editor ausführen. Mehrfaches Ausführen ist unschädlich.
-- =====================================================================

alter table public.venues add column if not exists status_config jsonb not null default '{}';
alter table public.reservations add column if not exists sub_status text;
alter table public.menu_choices add column if not exists note text not null default '';
alter table public.departments add column if not exists icon text;

-- 1) Reservierungen speichern: zusätzlich sub_status -------------------------
create or replace function public.save_reservations(p_venue uuid, p_items jsonb, p_delete uuid[] default '{}') returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  it jsonb; rid uuid; tids uuid[]; ids uuid[] := '{}'; v_cur timestamptz;
begin
  if coalesce(cardinality(p_delete), 0) > 0 then
    delete from public.reservations where venue_id = p_venue and id = any(p_delete);
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    rid := coalesce((it->>'id')::uuid, gen_random_uuid());
    ids := ids || rid;
    -- Veralteten Stand erkennen (Zeile sperren, damit niemand dazwischen speichert)
    if nullif(it->>'expected_updated_at', '') is not null then
      select r.updated_at into v_cur from public.reservations r where r.id = rid and r.venue_id = p_venue for update;
      if found and v_cur is distinct from (it->>'expected_updated_at')::timestamptz then
        raise exception 'Die Reservierung „%“ wurde inzwischen von jemand anderem geändert.', coalesce(it->>'name', '')
          using errcode = '40001';
      end if;
    end if;
    tids := coalesce(array(select (jsonb_array_elements_text(coalesce(it->'table_ids', '[]'::jsonb)))::uuid), '{}');
    -- zuerst entfernte Tische lösen (vermeidet Schein-Konflikte beim Verschieben)
    delete from public.reservation_tables where reservation_id = rid and not (table_id = any(tids));
    insert into public.reservations as r (id, venue_id, date, service_id, time, duration, adults, children, name, phone, email,
        occasion, allergies, allergens, notes, highchair, vip, source, status, sub_status, wishes, stay_id, manual_table, series_id, seated_at, finished_at)
    values (rid, p_venue, (it->>'date')::date, (it->>'service_id')::uuid, (it->>'time')::time, (it->>'duration')::int,
        coalesce((it->>'adults')::int, 0), coalesce((it->>'children')::int, 0), it->>'name', coalesce(it->>'phone', ''), coalesce(it->>'email', ''),
        coalesce(it->>'occasion', ''), coalesce(it->>'allergies', ''),
        coalesce(array(select jsonb_array_elements_text(coalesce(it->'allergens', '[]'::jsonb))), '{}'),
        coalesce(it->>'notes', ''), coalesce((it->>'highchair')::boolean, false),
        coalesce((it->>'vip')::boolean, false), coalesce(it->>'source', 'Telefon'), coalesce(it->>'status', 'bestaetigt'),
        nullif(it->>'sub_status', ''),
        coalesce(array(select jsonb_array_elements_text(coalesce(it->'wishes', '[]'::jsonb))), '{}'),
        (it->>'stay_id')::uuid, coalesce((it->>'manual_table')::boolean, false), (it->>'series_id')::uuid,
        (it->>'seated_at')::int, (it->>'finished_at')::int)
    on conflict (id) do update set
        date = excluded.date, service_id = excluded.service_id, time = excluded.time, duration = excluded.duration,
        adults = excluded.adults, children = excluded.children, name = excluded.name, phone = excluded.phone, email = excluded.email,
        occasion = excluded.occasion, allergies = excluded.allergies, allergens = excluded.allergens, notes = excluded.notes, highchair = excluded.highchair,
        vip = excluded.vip, source = excluded.source, status = excluded.status, sub_status = excluded.sub_status, wishes = excluded.wishes, stay_id = excluded.stay_id,
        manual_table = excluded.manual_table, series_id = excluded.series_id, seated_at = excluded.seated_at, finished_at = excluded.finished_at
      where r.venue_id = p_venue;
    insert into public.reservation_tables (reservation_id, table_id, venue_id, period, active)
      select rid, t, p_venue, 'empty'::tsrange, false from unnest(tids) t
      where not exists (select 1 from public.reservation_tables x where x.reservation_id = rid and x.table_id = t);
  end loop;
  return coalesce((select jsonb_agg(public.reservation_json(i)) from unnest(ids) i), '[]'::jsonb);
end $$;

-- 2) Service darf weiterhin nur den Status ändern – jetzt inkl. eigenem Status ---
create or replace function public.guard_service_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array['status', 'sub_status', 'seated_at', 'finished_at', 'updated_at', 'period'];
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

-- 3) Gäste-Speisekarte: Notiz je Zimmer anzeigen und speichern -----------------
create or replace function public.guest_menu(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tb record;
  d0 date := (now() at time zone 'Europe/Rome')::date;
begin
  select t.id, t.name, t.venue_id into tb from public.dining_tables t where t.qr_token = p_token;
  if not found or coalesce(length(p_token), 0) < 16 then return null; end if;
  return jsonb_build_object(
    'venue', (select jsonb_build_object('name', v.name, 'branding', v.branding) from public.venues v where v.id = tb.venue_id),
    'table', jsonb_build_object('name', tb.name),
    'menus', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'date', m.date, 'service', s.name, 'kind', s.kind, 'state', m.ordering, 'pick', s.free_seating,
        'items', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'course', x.it->>'course', 'dishId', x.it->>'dishId',
              'name', coalesce(dh.name, x.it->>'name'), 'nameIt', coalesce(dh.name_it, ''), 'nameEn', coalesce(dh.name_en, ''),
              'diet', coalesce(to_jsonb(dh.diet), '[]'::jsonb), 'allergens', coalesce(x.it->'allergens', '[]'::jsonb)) order by x.ord), '[]'::jsonb)
          from jsonb_array_elements(m.items) with ordinality as x(it, ord)
          left join public.dishes dh on dh.id::text = x.it->>'dishId'),
        'rooms', case when s.free_seating then (
          select coalesce(jsonb_agg(jsonb_build_object(
              'stayId', st.id, 'roomNo', st.room_no, 'persons', st.adults + st.children, 'counts', coalesce(c.counts, '{}'::jsonb),
              'note', coalesce(c.note, '')) order by st.room_no), '[]'::jsonb)
          from public.stays st
          left join public.menu_choices c on c.menu_id = m.id and c.stay_id = st.id
          where st.venue_id = tb.venue_id and public.stay_eats(st.board, st.arrival, st.departure, s.kind, m.date))
        else (
          select coalesce(jsonb_agg(jsonb_build_object(
              'stayId', st.id, 'roomNo', st.room_no, 'persons', r.adults + r.children, 'counts', coalesce(c.counts, '{}'::jsonb),
              'note', coalesce(c.note, '')) order by st.room_no), '[]'::jsonb)
          from public.reservations r
          join public.reservation_tables rt on rt.reservation_id = r.id and rt.table_id = tb.id
          join public.stays st on st.id = r.stay_id
          left join public.menu_choices c on c.menu_id = m.id and c.stay_id = st.id
          where r.date = m.date and r.service_id = m.service_id and r.status not in ('storniert', 'noshow'))
        end
      ) order by m.date, s.sort, s.start_time)
      from public.menus m join public.services s on s.id = m.service_id
      where m.venue_id = tb.venue_id and m.date between d0 and d0 + 1 and m.ordering <> 'aus'), '[]'::jsonb)
  );
end $$;

-- alte Fassung ohne Notiz entfernen (sonst wäre der Aufruf mehrdeutig)
drop function if exists public.guest_menu_save(text, uuid, uuid, jsonb);
create or replace function public.guest_menu_save(p_token text, p_menu uuid, p_stay uuid, p_counts jsonb, p_note text default '') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  tb record; m record; svc record; persons integer; k text; v jsonb; crs text; n integer;
  sums jsonb := '{}'::jsonb; clean jsonb := '{}'::jsonb;
  d0 date := (now() at time zone 'Europe/Rome')::date;
begin
  select t.id, t.venue_id into tb from public.dining_tables t where t.qr_token = p_token;
  if not found or coalesce(length(p_token), 0) < 16 then raise exception 'guest_menu: unbekannter Tisch'; end if;
  select * into m from public.menus where id = p_menu and venue_id = tb.venue_id;
  if not found or m.ordering <> 'offen' or m.date not between d0 and d0 + 1 then raise exception 'guest_menu: Auswahl ist geschlossen'; end if;
  select s.kind, s.free_seating into svc from public.services s where s.id = m.service_id;
  if svc.free_seating then
    select st.adults + st.children into persons from public.stays st
      where st.id = p_stay and st.venue_id = tb.venue_id and public.stay_eats(st.board, st.arrival, st.departure, svc.kind, m.date);
    if persons is null then raise exception 'guest_menu: Zimmer hat diese Mahlzeit nicht'; end if;
  else
    select r.adults + r.children into persons
      from public.reservations r join public.reservation_tables rt on rt.reservation_id = r.id and rt.table_id = tb.id
      where r.stay_id = p_stay and r.date = m.date and r.service_id = m.service_id and r.status not in ('storniert', 'noshow')
      limit 1;
    if persons is null then raise exception 'guest_menu: Zimmer sitzt nicht an diesem Tisch'; end if;
  end if;
  if jsonb_typeof(p_counts) <> 'object' then raise exception 'guest_menu: ungültige Auswahl'; end if;
  if length(coalesce(p_note, '')) > 500 then raise exception 'guest_menu: Notiz zu lang'; end if;
  for k, v in select key, value from jsonb_each(p_counts) loop
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) or (v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 50 then
      raise exception 'guest_menu: ungültige Anzahl';
    end if;
    n := (v #>> '{}')::integer;
    crs := null;
    select x->>'course' into crs from jsonb_array_elements(m.items) x where x->>'dishId' = k limit 1;
    if crs is null then raise exception 'guest_menu: Gericht nicht im Menü'; end if;
    if n > 0 then
      clean := clean || jsonb_build_object(k, n);
      sums := sums || jsonb_build_object(crs, coalesce((sums->>crs)::integer, 0) + n);
    end if;
  end loop;
  if exists (select 1 from jsonb_each_text(sums) where value::integer > persons) then
    raise exception 'guest_menu: mehr Gerichte als Personen';
  end if;
  insert into public.menu_choices (venue_id, menu_id, stay_id, counts, note) values (tb.venue_id, p_menu, p_stay, clean, trim(coalesce(p_note, '')))
    on conflict (menu_id, stay_id) do update set counts = excluded.counts, note = excluded.note;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.guest_menu(text) from public;
revoke all on function public.guest_menu_save(text, uuid, uuid, jsonb, text) from public;
grant execute on function public.guest_menu(text) to anon, authenticated;
grant execute on function public.guest_menu_save(text, uuid, uuid, jsonb, text) to anon, authenticated;
