-- Verpflegungsarten je Betrieb editierbar (Einstellungen → Verpflegungsarten): Kürzel, Bezeichnung,
-- inbegriffene Mahlzeiten (meals) und Mahlzeiten mit Tischreservierung (tables).
-- Ohne Eintrag gelten die bisherigen Arten UF / HP / VP / AI.

alter table public.venues add column if not exists board_config jsonb;   -- [{ key, label, meals: [..], tables: [..] }]

-- feste Liste UF/HP/VP/AI aufheben – Kürzel frei (1–10 Zeichen)
alter table public.stays drop constraint if exists stays_board_check;
alter table public.stays add constraint stays_board_check check (length(trim(board)) between 1 and 10);

-- Isst der Gast diese Mahlzeit? Nach der Verpflegungsart des Betriebs; ohne Eintrag wie bisher (stay_eats)
create or replace function public.stay_eats_v(p_venue uuid, p_board text, p_arrival date, p_departure date, p_kind text, p_date date) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb;
begin
  select e into cfg from public.venues v, jsonb_array_elements(coalesce(v.board_config, '[]'::jsonb)) e
    where v.id = p_venue and e->>'key' = p_board limit 1;
  if cfg is null then return public.stay_eats(p_board, p_arrival, p_departure, p_kind, p_date); end if;
  if not coalesce(cfg->'meals' ? p_kind, false) then return false; end if;
  return case when p_kind = 'fruehstueck' then p_arrival < p_date and p_date <= p_departure
              else p_arrival <= p_date and p_date < p_departure end;
end $$;
revoke all on function public.stay_eats_v(uuid, text, date, date, text, date) from public;
grant execute on function public.stay_eats_v(uuid, text, date, date, text, date) to authenticated;

-- QR-Speisekarte: gleiche Funktionen wie in 20261023000000, Mahlzeiten jetzt nach der Verpflegungsart des Betriebs
create or replace function public.guest_menu(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  sc record;
  d0 date := (now() at time zone 'Europe/Rome')::date;
begin
  select * into sc from public.guest_scope(p_token);
  if not found then return null; end if;
  return jsonb_build_object(
    'venue', (select jsonb_build_object('name', v.name, 'branding', v.branding) from public.venues v where v.id = sc.venue_id),
    'table', case when sc.table_id is null then null else jsonb_build_object('name', sc.table_name) end,
    'menus', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'date', m.date, 'service', s.name, 'kind', s.kind, 'state', public.menu_state(m.ordering, m.date, m.venue_id), 'pick', s.free_seating or sc.table_id is null,
        'items', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'course', x.it->>'course', 'dishId', x.it->>'dishId',
              'name', coalesce(dh.name, x.it->>'name'), 'nameIt', coalesce(dh.name_it, ''), 'nameEn', coalesce(dh.name_en, ''),
              'diet', coalesce(to_jsonb(dh.diet), '[]'::jsonb), 'allergens', coalesce(x.it->'allergens', '[]'::jsonb)) order by x.ord), '[]'::jsonb)
          from jsonb_array_elements(m.items) with ordinality as x(it, ord)
          left join public.dishes dh on dh.id::text = x.it->>'dishId'),
        'rooms', case when s.free_seating then (
          select coalesce(jsonb_agg(jsonb_build_object(
              'stayId', st.id, 'resId', null, 'roomNo', st.room_no, 'persons', st.adults + st.children, 'counts', coalesce(c.counts, '{}'::jsonb),
              'note', coalesce(c.note, '')) order by st.room_no), '[]'::jsonb)
          from public.stays st
          left join public.menu_choices c on c.menu_id = m.id and c.stay_id = st.id
          where st.venue_id = sc.venue_id and public.stay_eats_v(sc.venue_id, st.board, st.arrival, st.departure, s.kind, m.date))
        else (
          select coalesce(jsonb_agg(p.j order by p.ord, p.sortkey), '[]'::jsonb) from (
            select 0 as ord, st.room_no as sortkey, jsonb_build_object(
                'stayId', st.id, 'resId', null, 'roomNo', st.room_no, 'persons', r.adults + r.children, 'counts', coalesce(c.counts, '{}'::jsonb),
                'note', coalesce(c.note, '')) as j
              from public.reservations r
              join public.stays st on st.id = r.stay_id
              left join public.menu_choices c on c.menu_id = m.id and c.stay_id = st.id
              where r.venue_id = sc.venue_id and r.date = m.date and r.service_id = m.service_id and r.status not in ('storniert', 'noshow')
                and (sc.table_id is null or exists (select 1 from public.reservation_tables rt where rt.reservation_id = r.id and rt.table_id = sc.table_id))
            union all
            -- externe Gäste ohne Namen: erkennbar nur am Tisch
            select 1, x.tables || r.id::text, jsonb_build_object(
                'stayId', null, 'resId', r.id, 'roomNo', '', 'tableName', x.tables, 'persons', r.adults + r.children, 'counts', coalesce(c.counts, '{}'::jsonb),
                'note', coalesce(c.note, ''))
              from public.reservations r
              cross join lateral (select string_agg(t.name, '+' order by t.name) as tables from public.reservation_tables rt
                join public.dining_tables t on t.id = rt.table_id where rt.reservation_id = r.id) x
              left join public.menu_choices c on c.menu_id = m.id and c.reservation_id = r.id
              where r.venue_id = sc.venue_id and r.stay_id is null and r.date = m.date and r.service_id = m.service_id and r.status not in ('storniert', 'noshow')
                and x.tables is not null
                and (sc.table_id is null or exists (select 1 from public.reservation_tables rt where rt.reservation_id = r.id and rt.table_id = sc.table_id))
          ) p)
        end
      ) order by m.date, s.sort, s.start_time)
      from public.menus m join public.services s on s.id = m.service_id
      where m.venue_id = sc.venue_id and m.date between d0 and d0 + 1 and public.menu_state(m.ordering, m.date, m.venue_id) <> 'aus'), '[]'::jsonb)
  );
end $$;

-- Auswahl speichern: Hotelzimmer (p_stay) oder externe Reservierung (p_res); mit Tisch-Schlüssel nur an diesem Tisch
create or replace function public.guest_menu_save(p_token text, p_menu uuid, p_stay uuid, p_counts jsonb, p_note text default '', p_res uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  sc record; m record; svc record; persons integer; k text; v jsonb; crs text; n integer;
  sums jsonb := '{}'::jsonb; clean jsonb := '{}'::jsonb;
  d0 date := (now() at time zone 'Europe/Rome')::date;
begin
  select * into sc from public.guest_scope(p_token);
  if not found then raise exception 'guest_menu: unbekannter QR-Code'; end if;
  select * into m from public.menus where id = p_menu and venue_id = sc.venue_id;
  if not found or public.menu_state(m.ordering, m.date, m.venue_id) <> 'offen' or m.date not between d0 and d0 + 1 then raise exception 'guest_menu: Auswahl ist geschlossen'; end if;
  select s.kind, s.free_seating into svc from public.services s where s.id = m.service_id;
  if p_res is not null then
    select r.adults + r.children into persons from public.reservations r
      where r.id = p_res and r.venue_id = sc.venue_id and r.stay_id is null and r.date = m.date and r.service_id = m.service_id
        and r.status not in ('storniert', 'noshow')
        and exists (select 1 from public.reservation_tables rt where rt.reservation_id = r.id and (sc.table_id is null or rt.table_id = sc.table_id));
    if persons is null or svc.free_seating then raise exception 'guest_menu: Reservierung nicht gefunden'; end if;
  elsif svc.free_seating then
    select st.adults + st.children into persons from public.stays st
      where st.id = p_stay and st.venue_id = sc.venue_id and public.stay_eats_v(sc.venue_id, st.board, st.arrival, st.departure, svc.kind, m.date);
    if persons is null then raise exception 'guest_menu: Zimmer hat diese Mahlzeit nicht'; end if;
  else
    select r.adults + r.children into persons from public.reservations r
      where r.stay_id = p_stay and r.venue_id = sc.venue_id and r.date = m.date and r.service_id = m.service_id and r.status not in ('storniert', 'noshow')
        and (sc.table_id is null or exists (select 1 from public.reservation_tables rt where rt.reservation_id = r.id and rt.table_id = sc.table_id))
      limit 1;
    if persons is null then raise exception 'guest_menu: Zimmer hat für dieses Menü keine Reservierung'; end if;
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
  if p_res is not null then
    insert into public.menu_choices (venue_id, menu_id, stay_id, reservation_id, counts, note)
      values (sc.venue_id, p_menu, null, p_res, clean, trim(coalesce(p_note, '')))
      on conflict (menu_id, reservation_id) where reservation_id is not null do update set counts = excluded.counts, note = excluded.note;
  else
    insert into public.menu_choices (venue_id, menu_id, stay_id, counts, note) values (sc.venue_id, p_menu, p_stay, clean, trim(coalesce(p_note, '')))
      on conflict (menu_id, stay_id) do update set counts = excluded.counts, note = excluded.note;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.guest_menu(text) from public;
revoke all on function public.guest_menu_save(text, uuid, uuid, jsonb, text, uuid) from public;
grant execute on function public.guest_menu(text) to anon, authenticated;
grant execute on function public.guest_menu_save(text, uuid, uuid, jsonb, text, uuid) to anon, authenticated;
