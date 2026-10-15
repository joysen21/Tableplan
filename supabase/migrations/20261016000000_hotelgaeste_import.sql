-- =====================================================================
-- Hotelgäste-Import (CSV aus dem Hotelprogramm, z. B. ASA-Zimmerliste)
-- Kennung des Aufenthalts im Hotelprogramm, damit ein wiederholter Import
-- denselben Aufenthalt wiederfindet (feste Tische, Essenszeiten bleiben erhalten).
-- =====================================================================

alter table public.stays add column if not exists external_id text;
create unique index if not exists stays_external_idx on public.stays (venue_id, external_id) where external_id is not null;

-- save_stay: external_id mitspeichern (fehlt sie im Aufruf, bleibt die bestehende Kennung)
create or replace function public.save_stay(p_venue uuid, p_stay jsonb, p_items jsonb, p_delete uuid[] default '{}') returns jsonb
language plpgsql security invoker set search_path = public as $$
declare sid uuid := coalesce((p_stay->>'id')::uuid, gen_random_uuid()); res jsonb;
begin
  insert into public.stays as s (id, venue_id, room_no, name, adults, children, arrival, departure, board, phone, allergies, allergens, notes, vip, times, table_ids, external_id)
  values (sid, p_venue, p_stay->>'room_no', p_stay->>'name', coalesce((p_stay->>'adults')::int, 1), coalesce((p_stay->>'children')::int, 0),
      (p_stay->>'arrival')::date, (p_stay->>'departure')::date, coalesce(p_stay->>'board', 'HP'), coalesce(p_stay->>'phone', ''),
      coalesce(p_stay->>'allergies', ''), coalesce(array(select jsonb_array_elements_text(coalesce(p_stay->'allergens', '[]'::jsonb))), '{}'),
      coalesce(p_stay->>'notes', ''), coalesce((p_stay->>'vip')::boolean, false),
      coalesce(p_stay->'times', '{}'::jsonb), coalesce(array(select (jsonb_array_elements_text(coalesce(p_stay->'table_ids', '[]'::jsonb)))::uuid), '{}'),
      nullif(p_stay->>'external_id', ''))
  on conflict (id) do update set room_no = excluded.room_no, name = excluded.name, adults = excluded.adults, children = excluded.children,
      arrival = excluded.arrival, departure = excluded.departure, board = excluded.board, phone = excluded.phone, allergies = excluded.allergies,
      allergens = excluded.allergens, notes = excluded.notes, vip = excluded.vip, times = excluded.times, table_ids = excluded.table_ids,
      external_id = coalesce(excluded.external_id, s.external_id)
    where s.venue_id = p_venue;
  res := public.save_reservations(p_venue, p_items, p_delete);
  return jsonb_build_object('stay', (select to_jsonb(s) from public.stays s where s.id = sid), 'reservations', res);
end $$;
