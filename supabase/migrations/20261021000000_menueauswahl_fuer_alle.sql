-- =====================================================================
-- Menüauswahl für alle Gäste: neben Hotelzimmern (stay_id) auch externe
-- Reservierungen (reservation_id) – im Reservierungsformular und per QR-Code.
-- Externe Gäste erscheinen im QR ohne Namen als „Tisch …“.
-- Im Supabase SQL Editor ausführen. Mehrfaches Ausführen ist unschädlich.
-- =====================================================================

alter table public.menu_choices alter column stay_id drop not null;
alter table public.menu_choices add column if not exists reservation_id uuid references public.reservations(id) on delete cascade;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menu_choices_party_check') then
    alter table public.menu_choices add constraint menu_choices_party_check check (stay_id is not null or reservation_id is not null);
  end if;
end $$;
create unique index if not exists menu_choices_reservation_idx on public.menu_choices (menu_id, reservation_id) where reservation_id is not null;

-- Gäste-Ansicht: am Tisch zusätzlich externe Reservierungen (resId, ohne Namen)
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
              'stayId', st.id, 'resId', null, 'roomNo', st.room_no, 'persons', st.adults + st.children, 'counts', coalesce(c.counts, '{}'::jsonb),
              'note', coalesce(c.note, '')) order by st.room_no), '[]'::jsonb)
          from public.stays st
          left join public.menu_choices c on c.menu_id = m.id and c.stay_id = st.id
          where st.venue_id = tb.venue_id and public.stay_eats(st.board, st.arrival, st.departure, s.kind, m.date))
        else (
          select coalesce(jsonb_agg(p.j order by p.ord, p.sortkey), '[]'::jsonb) from (
            select 0 as ord, st.room_no as sortkey, jsonb_build_object(
                'stayId', st.id, 'resId', null, 'roomNo', st.room_no, 'persons', r.adults + r.children, 'counts', coalesce(c.counts, '{}'::jsonb),
                'note', coalesce(c.note, '')) as j
              from public.reservations r
              join public.reservation_tables rt on rt.reservation_id = r.id and rt.table_id = tb.id
              join public.stays st on st.id = r.stay_id
              left join public.menu_choices c on c.menu_id = m.id and c.stay_id = st.id
              where r.date = m.date and r.service_id = m.service_id and r.status not in ('storniert', 'noshow')
            union all
            select 1, r.time::text || r.id::text, jsonb_build_object(
                'stayId', null, 'resId', r.id, 'roomNo', '', 'persons', r.adults + r.children, 'counts', coalesce(c.counts, '{}'::jsonb),
                'note', coalesce(c.note, ''))
              from public.reservations r
              join public.reservation_tables rt on rt.reservation_id = r.id and rt.table_id = tb.id
              left join public.menu_choices c on c.menu_id = m.id and c.reservation_id = r.id
              where r.stay_id is null and r.date = m.date and r.service_id = m.service_id and r.status not in ('storniert', 'noshow')
          ) p)
        end
      ) order by m.date, s.sort, s.start_time)
      from public.menus m join public.services s on s.id = m.service_id
      where m.venue_id = tb.venue_id and m.date between d0 and d0 + 1 and m.ordering <> 'aus'), '[]'::jsonb)
  );
end $$;

-- Auswahl speichern: Hotelzimmer (p_stay) oder externe Reservierung am Tisch (p_res)
drop function if exists public.guest_menu_save(text, uuid, uuid, jsonb, text);
create or replace function public.guest_menu_save(p_token text, p_menu uuid, p_stay uuid, p_counts jsonb, p_note text default '', p_res uuid default null) returns jsonb
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
  if p_res is not null then
    -- externe Reservierung: muss an diesem Tisch sitzen (nicht bei freier Platzwahl)
    select r.adults + r.children into persons
      from public.reservations r join public.reservation_tables rt on rt.reservation_id = r.id and rt.table_id = tb.id
      where r.id = p_res and r.stay_id is null and r.date = m.date and r.service_id = m.service_id and r.status not in ('storniert', 'noshow');
    if persons is null or svc.free_seating then raise exception 'guest_menu: Reservierung sitzt nicht an diesem Tisch'; end if;
  elsif svc.free_seating then
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
  if p_res is not null then
    insert into public.menu_choices (venue_id, menu_id, stay_id, reservation_id, counts, note)
      values (tb.venue_id, p_menu, null, p_res, clean, trim(coalesce(p_note, '')))
      on conflict (menu_id, reservation_id) where reservation_id is not null do update set counts = excluded.counts, note = excluded.note;
  else
    insert into public.menu_choices (venue_id, menu_id, stay_id, counts, note) values (tb.venue_id, p_menu, p_stay, clean, trim(coalesce(p_note, '')))
      on conflict (menu_id, stay_id) do update set counts = excluded.counts, note = excluded.note;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.guest_menu(text) from public;
revoke all on function public.guest_menu_save(text, uuid, uuid, jsonb, text, uuid) from public;
grant execute on function public.guest_menu(text) to anon, authenticated;
grant execute on function public.guest_menu_save(text, uuid, uuid, jsonb, text, uuid) to anon, authenticated;
