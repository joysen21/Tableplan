-- =====================================================================
-- Gäste-Speisekarte per QR-Code
--   * Hotelgäste scannen den QR-Code auf ihrem (festen) Tisch, wählen ihr Zimmer
--     und je Gang, wie oft welches Gericht → die Küche kennt die Portionen.
--   * Gäste sind NICHT angemeldet: Zugriff nur über die zwei Funktionen guest_menu /
--     guest_menu_save mit dem geheimen Tisch-Token aus dem QR-Code.
--   * Die Küche öffnet/schließt die Auswahl je Menü (menus.ordering).
--   * Erscheinungsbild (Logo, Titelbild, Farbe, Text) je Betrieb in venues.branding.
-- Im Supabase SQL Editor ausführen. Mehrfaches Ausführen ist unschädlich.
-- =====================================================================

-- 1) Spalten ------------------------------------------------------------
alter table public.venues add column if not exists branding jsonb not null default '{}';

-- geheimer Token je Tisch (steht im QR-Code); bestehende Tische bekommen automatisch einen
alter table public.dining_tables add column if not exists qr_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists dining_tables_qr_token_idx on public.dining_tables (qr_token);

-- aus = Gäste sehen das Menü nicht · offen = Gäste wählen · geschlossen = nur noch anzeigen
alter table public.menus add column if not exists ordering text not null default 'aus';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menus_ordering_check') then
    alter table public.menus add constraint menus_ordering_check check (ordering in ('aus', 'offen', 'geschlossen'));
  end if;
end $$;

-- 2) Auswahl der Gäste: je Menü und Zimmer die Anzahl je Gericht ----------
create table if not exists public.menu_choices (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  menu_id     uuid not null references public.menus(id) on delete cascade,
  stay_id     uuid not null references public.stays(id) on delete cascade,
  counts      jsonb not null default '{}',   -- { "<dishId>": Anzahl }
  updated_at  timestamptz not null default now(),
  unique (menu_id, stay_id)
);
create index if not exists menu_choices_venue_idx on public.menu_choices (venue_id);

drop trigger if exists menu_choices_touch on public.menu_choices;
create trigger menu_choices_touch before update on public.menu_choices for each row execute function public.touch_updated_at();

-- 3) Rechte: Küche und Empfang dürfen die Auswahl auch von Hand korrigieren
create or replace function public.can_write(v uuid, tbl text) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.my_role(v)
    when 'admin'   then true
    when 'empfang' then tbl in ('reservations', 'reservation_tables', 'stays', 'table_blocks', 'menu_choices', 'audit_log')
    when 'service' then tbl in ('reservations', 'audit_log')
    when 'kueche'  then tbl in ('ingredients', 'dishes', 'menus', 'menu_choices', 'audit_log')
    else false
  end
$$;

alter table public.menu_choices enable row level security;
drop policy if exists menu_choices_select on public.menu_choices;
create policy menu_choices_select on public.menu_choices for select to authenticated using (public.my_role(venue_id) is not null);
drop policy if exists menu_choices_insert on public.menu_choices;
create policy menu_choices_insert on public.menu_choices for insert to authenticated with check (public.can_write(venue_id, 'menu_choices'));
drop policy if exists menu_choices_update on public.menu_choices;
create policy menu_choices_update on public.menu_choices for update to authenticated
  using (public.can_write(venue_id, 'menu_choices')) with check (public.can_write(venue_id, 'menu_choices'));
drop policy if exists menu_choices_delete on public.menu_choices;
create policy menu_choices_delete on public.menu_choices for delete to authenticated using (public.can_write(venue_id, 'menu_choices'));
grant select, insert, update, delete on public.menu_choices to authenticated;

-- 4) Gäste-Zugriff (ohne Anmeldung, nur mit Tisch-Token) -------------------
-- Heute und morgen (Ortszeit Südtirol), nur Menüs, die die Küche freigegeben hat.
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
        'id', m.id, 'date', m.date, 'service', s.name, 'kind', s.kind, 'state', m.ordering,
        'items', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'course', x.it->>'course', 'dishId', x.it->>'dishId',
              'name', coalesce(dh.name, x.it->>'name'), 'nameIt', coalesce(dh.name_it, ''), 'nameEn', coalesce(dh.name_en, ''),
              'diet', coalesce(to_jsonb(dh.diet), '[]'::jsonb), 'allergens', coalesce(x.it->'allergens', '[]'::jsonb)) order by x.ord), '[]'::jsonb)
          from jsonb_array_elements(m.items) with ordinality as x(it, ord)
          left join public.dishes dh on dh.id::text = x.it->>'dishId'),
        'rooms', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'stayId', st.id, 'roomNo', st.room_no, 'persons', r.adults + r.children, 'counts', coalesce(c.counts, '{}'::jsonb)) order by st.room_no), '[]'::jsonb)
          from public.reservations r
          join public.reservation_tables rt on rt.reservation_id = r.id and rt.table_id = tb.id
          join public.stays st on st.id = r.stay_id
          left join public.menu_choices c on c.menu_id = m.id and c.stay_id = st.id
          where r.date = m.date and r.service_id = m.service_id and r.status not in ('storniert', 'noshow'))
      ) order by m.date, s.sort, s.start_time)
      from public.menus m join public.services s on s.id = m.service_id
      where m.venue_id = tb.venue_id and m.date between d0 and d0 + 1 and m.ordering <> 'aus'), '[]'::jsonb)
  );
end $$;

-- Auswahl eines Zimmers speichern. Prüft: Tisch-Token, Menü offen, Zimmer sitzt an diesem Tisch,
-- nur Gerichte des Menüs, je Gang höchstens so viele wie Personen.
create or replace function public.guest_menu_save(p_token text, p_menu uuid, p_stay uuid, p_counts jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  tb record; m record; persons integer; k text; v jsonb; crs text; n integer;
  sums jsonb := '{}'::jsonb; clean jsonb := '{}'::jsonb;
  d0 date := (now() at time zone 'Europe/Rome')::date;
begin
  select t.id, t.venue_id into tb from public.dining_tables t where t.qr_token = p_token;
  if not found or coalesce(length(p_token), 0) < 16 then raise exception 'guest_menu: unbekannter Tisch'; end if;
  select * into m from public.menus where id = p_menu and venue_id = tb.venue_id;
  if not found or m.ordering <> 'offen' or m.date not between d0 and d0 + 1 then raise exception 'guest_menu: Auswahl ist geschlossen'; end if;
  select r.adults + r.children into persons
    from public.reservations r join public.reservation_tables rt on rt.reservation_id = r.id and rt.table_id = tb.id
    where r.stay_id = p_stay and r.date = m.date and r.service_id = m.service_id and r.status not in ('storniert', 'noshow')
    limit 1;
  if persons is null then raise exception 'guest_menu: Zimmer sitzt nicht an diesem Tisch'; end if;
  if jsonb_typeof(p_counts) <> 'object' then raise exception 'guest_menu: ungültige Auswahl'; end if;
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
  insert into public.menu_choices (venue_id, menu_id, stay_id, counts) values (tb.venue_id, p_menu, p_stay, clean)
    on conflict (menu_id, stay_id) do update set counts = excluded.counts;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.guest_menu(text) from public;
revoke all on function public.guest_menu_save(text, uuid, uuid, jsonb) from public;
grant execute on function public.guest_menu(text) to anon, authenticated;
grant execute on function public.guest_menu_save(text, uuid, uuid, jsonb) to anon, authenticated;

-- 5) Live-Aktualisierung für die Küche ------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_choices') then
    alter publication supabase_realtime add table public.menu_choices;
  end if;
end $$;
