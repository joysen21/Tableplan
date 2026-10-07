-- =====================================================================
-- Bearbeitungskonflikte: Reservierung nicht mit veraltetem Stand überschreiben
--
-- Der Client schickt pro Reservierung den Stand mit, den er bearbeitet hat
-- (expected_updated_at = updated_at beim Öffnen). Hat inzwischen jemand anderes
-- gespeichert (z. B. Service setzt „Platziert“), wird das Speichern abgelehnt
-- (Fehlercode 40001) und die App führt die Änderungen zusammen.
-- Ohne expected_updated_at (neue Reservierung, ältere App-Version) wie bisher.
-- Im Supabase SQL Editor ausführen. Mehrfaches Ausführen ist unschädlich.
-- =====================================================================

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
        occasion, allergies, allergens, notes, highchair, vip, source, status, wishes, stay_id, manual_table, series_id, seated_at, finished_at)
    values (rid, p_venue, (it->>'date')::date, (it->>'service_id')::uuid, (it->>'time')::time, (it->>'duration')::int,
        coalesce((it->>'adults')::int, 0), coalesce((it->>'children')::int, 0), it->>'name', coalesce(it->>'phone', ''), coalesce(it->>'email', ''),
        coalesce(it->>'occasion', ''), coalesce(it->>'allergies', ''),
        coalesce(array(select jsonb_array_elements_text(coalesce(it->'allergens', '[]'::jsonb))), '{}'),
        coalesce(it->>'notes', ''), coalesce((it->>'highchair')::boolean, false),
        coalesce((it->>'vip')::boolean, false), coalesce(it->>'source', 'Telefon'), coalesce(it->>'status', 'bestaetigt'),
        coalesce(array(select jsonb_array_elements_text(coalesce(it->'wishes', '[]'::jsonb))), '{}'),
        (it->>'stay_id')::uuid, coalesce((it->>'manual_table')::boolean, false), (it->>'series_id')::uuid,
        (it->>'seated_at')::int, (it->>'finished_at')::int)
    on conflict (id) do update set
        date = excluded.date, service_id = excluded.service_id, time = excluded.time, duration = excluded.duration,
        adults = excluded.adults, children = excluded.children, name = excluded.name, phone = excluded.phone, email = excluded.email,
        occasion = excluded.occasion, allergies = excluded.allergies, allergens = excluded.allergens, notes = excluded.notes, highchair = excluded.highchair,
        vip = excluded.vip, source = excluded.source, status = excluded.status, wishes = excluded.wishes, stay_id = excluded.stay_id,
        manual_table = excluded.manual_table, series_id = excluded.series_id, seated_at = excluded.seated_at, finished_at = excluded.finished_at
      where r.venue_id = p_venue;
    insert into public.reservation_tables (reservation_id, table_id, venue_id, period, active)
      select rid, t, p_venue, 'empty'::tsrange, false from unnest(tids) t
      where not exists (select 1 from public.reservation_tables x where x.reservation_id = rid and x.table_id = t);
  end loop;
  return coalesce((select jsonb_agg(public.reservation_json(i)) from unnest(ids) i), '[]'::jsonb);
end $$;
