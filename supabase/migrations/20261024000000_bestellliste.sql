-- =====================================================================
-- Modul Bestellliste: Lieferanten, Artikel, Bestellungen (Historie)
--   * Sichtbarkeit je Rolle: venues.module_roles (Admin immer), Modul an/aus über venues.modules
--   * Startdaten: Agostini und Vinothek Mairhofer mit ihren Artikellisten (Telefon zum Testen)
--   * Ausdrückliche Grants (Supabase vergibt ab 30.10.2026 keine Rechte mehr automatisch)
-- Im Supabase SQL Editor ausführen. Mehrfaches Ausführen ist unschädlich.
-- =====================================================================

alter table public.venues add column if not exists module_roles jsonb not null default '{}';

-- Darf der angemeldete Benutzer das Modul nutzen? Admin immer; sonst Modul an und Rolle zugewiesen
-- (ohne Zuweisung gelten die Standardrollen der App: Bestellliste → Küche)
create or replace function public.module_allowed(v uuid, m text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(v) = 'admin', false) or exists (
    select 1 from public.venues x where x.id = v and m = any(x.modules)
      and coalesce(x.module_roles -> m, case m when 'bestellliste' then '["kueche"]'::jsonb else '[]'::jsonb end) ? public.my_role(v))
$$;
revoke all on function public.module_allowed(uuid, text) from public;
grant execute on function public.module_allowed(uuid, text) to authenticated;

create table if not exists public.order_suppliers (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  phone       text not null default '',
  sort        integer not null default 0,
  updated_at  timestamptz not null default now()
);
create index if not exists order_suppliers_venue_idx on public.order_suppliers (venue_id);

create table if not exists public.order_products (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  supplier_id uuid not null references public.order_suppliers(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  unit        text not null default '',
  grp         text not null default '',
  sort        integer not null default 0,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);
create index if not exists order_products_venue_idx on public.order_products (venue_id);

create table if not exists public.supplier_orders (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  supplier_id uuid not null references public.order_suppliers(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  text not null default '',
  items       jsonb not null default '[]',   -- [{ productId, name, unit, qty }]
  note        text not null default '',
  updated_at  timestamptz not null default now()
);
create index if not exists supplier_orders_venue_idx on public.supplier_orders (venue_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['order_suppliers', 'order_products', 'supplier_orders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.module_allowed(venue_id, ''bestellliste''))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.module_allowed(venue_id, ''bestellliste''))', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.module_allowed(venue_id, ''bestellliste'')) with check (public.module_allowed(venue_id, ''bestellliste''))', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.module_allowed(venue_id, ''bestellliste''))', t || '_delete', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

grant select, insert, update, delete on public.order_suppliers, public.order_products, public.supplier_orders to authenticated;
revoke all on public.order_suppliers, public.order_products, public.supplier_orders from anon;

-- Startdaten je Betrieb (nur wenn noch keine Lieferanten angelegt sind)
do $$
declare v record; sid uuid;
begin
  for v in select id from public.venues loop
    if exists (select 1 from public.order_suppliers where venue_id = v.id) then continue; end if;
    insert into public.order_suppliers (id, venue_id, name, phone, sort) values (gen_random_uuid(), v.id, 'Agostini', '+39 366 159 5025', 0) returning id into sid;
    insert into public.order_products (venue_id, supplier_id, name, grp, sort) values
      (v.id, sid, 'Orangensaft', 'Alkoholfreies & Bier', 0),
      (v.id, sid, 'Pfirsich Joga', 'Alkoholfreies & Bier', 1),
      (v.id, sid, 'Wasser ohne / mit Sprudel 0,75', 'Alkoholfreies & Bier', 2),
      (v.id, sid, 'Wasser ohne / mit Sprudel 0,5', 'Alkoholfreies & Bier', 3),
      (v.id, sid, 'Prosecco Cuvee', 'Alkoholfreies & Bier', 4),
      (v.id, sid, 'San Bitter Weiss / Rot', 'Alkoholfreies & Bier', 5),
      (v.id, sid, 'Pompelmosaft', 'Alkoholfreies & Bier', 6),
      (v.id, sid, 'Schweppes Bitter Lemon', 'Alkoholfreies & Bier', 7),
      (v.id, sid, 'Schweppes Ginger Ale', 'Alkoholfreies & Bier', 8),
      (v.id, sid, 'Schweppes Tonic Water/Wild Berry', 'Alkoholfreies & Bier', 9),
      (v.id, sid, 'Fever Three Tonic Water', 'Alkoholfreies & Bier', 10),
      (v.id, sid, 'Fever Three Ginger Beer', 'Alkoholfreies & Bier', 11),
      (v.id, sid, 'Fever Three Pink Grapefruit', 'Alkoholfreies & Bier', 12),
      (v.id, sid, 'Fentimans Rose Limonade', 'Alkoholfreies & Bier', 13),
      (v.id, sid, 'Passionsfrucht Tonic Limestone', 'Alkoholfreies & Bier', 14),
      (v.id, sid, 'Coca Cola "Zero"', 'Alkoholfreies & Bier', 15),
      (v.id, sid, 'Kiste Limonade 1l', 'Alkoholfreies & Bier', 16),
      (v.id, sid, 'Kiste Aranciata 1l', 'Alkoholfreies & Bier', 17),
      (v.id, sid, 'Kiste Coca Cola 1l', 'Alkoholfreies & Bier', 18),
      (v.id, sid, 'Kiste Apfelsaft 1l', 'Alkoholfreies & Bier', 19),
      (v.id, sid, 'Kiste Eistee 1l', 'Alkoholfreies & Bier', 20),
      (v.id, sid, 'Forst Alkoholfrei 0,0', 'Alkoholfreies & Bier', 21),
      (v.id, sid, 'Hefe Weihenstefan 0,0', 'Alkoholfreies & Bier', 22),
      (v.id, sid, 'Forst Felsenkeller', 'Alkoholfreies & Bier', 23),
      (v.id, sid, 'Hefe Weihenstefan 0,5', 'Bier & Spirituosen', 24),
      (v.id, sid, 'Bier Dunkel 0,33 Sixtus', 'Bier & Spirituosen', 25),
      (v.id, sid, 'Fass Bier', 'Bier & Spirituosen', 26),
      (v.id, sid, 'Averna', 'Bier & Spirituosen', 27),
      (v.id, sid, 'Braulio', 'Bier & Spirituosen', 28),
      (v.id, sid, 'Cynar', 'Bier & Spirituosen', 29),
      (v.id, sid, 'Fernet Branca / Menta', 'Bier & Spirituosen', 30),
      (v.id, sid, 'Montenegro', 'Bier & Spirituosen', 31),
      (v.id, sid, 'Ramazotti', 'Bier & Spirituosen', 32),
      (v.id, sid, 'Amaretto', 'Bier & Spirituosen', 33),
      (v.id, sid, 'Bailys', 'Bier & Spirituosen', 34),
      (v.id, sid, 'Contreau', 'Bier & Spirituosen', 35),
      (v.id, sid, 'Bacardi 8y', 'Bier & Spirituosen', 36),
      (v.id, sid, 'Grand Marnier', 'Bier & Spirituosen', 37),
      (v.id, sid, 'Limoncello', 'Bier & Spirituosen', 38),
      (v.id, sid, 'Sambuca', 'Bier & Spirituosen', 39),
      (v.id, sid, 'Villa Laviosa Nosselar / Enzian', 'Bier & Spirituosen', 40),
      (v.id, sid, 'Chardonnay Walcher', 'Bier & Spirituosen', 41),
      (v.id, sid, 'Pircher Obstler', 'Bier & Spirituosen', 42),
      (v.id, sid, 'Pircher Williams', 'Bier & Spirituosen', 43),
      (v.id, sid, 'Unterthurner Waldler', 'Bier & Spirituosen', 44),
      (v.id, sid, 'Vinschgauer Marillenbrand Stocker', 'Bier & Spirituosen', 45),
      (v.id, sid, 'Absolut / Uro Edelschwarz', 'Bier & Spirituosen', 46),
      (v.id, sid, 'Tequila', 'Bier & Spirituosen', 47);
    insert into public.order_suppliers (id, venue_id, name, phone, sort) values (gen_random_uuid(), v.id, 'Vinothek Mairhofer', '+39 366 159 5025', 1) returning id into sid;
    insert into public.order_products (venue_id, supplier_id, name, grp, sort) values
      (v.id, sid, 'Weissburgunder "Festival"', 'Weißwein & Rosé', 0),
      (v.id, sid, 'Weissburgunder Terlan', 'Weißwein & Rosé', 1),
      (v.id, sid, 'Weissburgunder Platt & Rigl', 'Weißwein & Rosé', 2),
      (v.id, sid, 'Riesling Laimburg', 'Weißwein & Rosé', 3),
      (v.id, sid, 'Riesling Vinschgau', 'Weißwein & Rosé', 4),
      (v.id, sid, 'Grüner Veltliner Eisacktal', 'Weißwein & Rosé', 5),
      (v.id, sid, 'Grüner Veltliner Ebner', 'Weißwein & Rosé', 6),
      (v.id, sid, 'Sauvignon "Cosmas"', 'Weißwein & Rosé', 7),
      (v.id, sid, 'Sauvignon "Winkl"', 'Weißwein & Rosé', 8),
      (v.id, sid, 'Sauvignon "Myra"', 'Weißwein & Rosé', 9),
      (v.id, sid, 'Chardonnay Lageder', 'Weißwein & Rosé', 10),
      (v.id, sid, 'Chardonnay "Cardellino"', 'Weißwein & Rosé', 11),
      (v.id, sid, 'Chardonnay "Belasy"', 'Weißwein & Rosé', 12),
      (v.id, sid, 'Pinot Grigio "Soll"', 'Weißwein & Rosé', 13),
      (v.id, sid, 'Pinot Grigio Penon', 'Weißwein & Rosé', 14),
      (v.id, sid, 'Pinot Grigio "Unterebner"', 'Weißwein & Rosé', 15),
      (v.id, sid, 'Gewürztraminer "Damian"', 'Weißwein & Rosé', 16),
      (v.id, sid, 'Goldmuskateller Kaltern', 'Weißwein & Rosé', 17),
      (v.id, sid, 'Moscato Giallo Manincor', 'Weißwein & Rosé', 18),
      (v.id, sid, 'Kerner "Aristos" Eisacktal', 'Weißwein & Rosé', 19),
      (v.id, sid, 'Kerner Neustift', 'Weißwein & Rosé', 20),
      (v.id, sid, 'Sylvaner Eisacktal', 'Weißwein & Rosé', 21),
      (v.id, sid, 'Terlaner Cuvee', 'Weißwein & Rosé', 22),
      (v.id, sid, 'Stoan Cuvee', 'Weißwein & Rosé', 23),
      (v.id, sid, 'Lugana Ca dei Frati', 'Weißwein & Rosé', 24),
      (v.id, sid, 'Bianco di Custoza', 'Weißwein & Rosé', 25),
      (v.id, sid, 'Gavi di Gavi', 'Weißwein & Rosé', 26),
      (v.id, sid, 'Lagrein Rosé Pischl', 'Weißwein & Rosé', 27),
      (v.id, sid, 'Rosé Innerleiterhof Schenna', 'Weißwein & Rosé', 28),
      (v.id, sid, 'Giardino Rosé', 'Weißwein & Rosé', 29),
      (v.id, sid, 'Rosa dei Frati', 'Weißwein & Rosé', 30),
      (v.id, sid, 'Vernatsch "Fass Nr. 9"', 'Rotwein', 31),
      (v.id, sid, 'Vernatsch "Quintessenz"', 'Rotwein', 32),
      (v.id, sid, 'St. Magdalener "Huck am Bach"', 'Rotwein', 33),
      (v.id, sid, 'St. Magdalener "Classico" Waldgries', 'Rotwein', 34),
      (v.id, sid, 'Zweigelt Ebner', 'Rotwein', 35),
      (v.id, sid, 'Blauburgunder Ploner Marling', 'Rotwein', 36),
      (v.id, sid, 'Blauburgunder Englar', 'Rotwein', 37),
      (v.id, sid, 'Lagrein Waldgries', 'Rotwein', 38),
      (v.id, sid, 'Lagrein Villa Schmid', 'Rotwein', 39),
      (v.id, sid, 'Lagrein "Prestige Line"', 'Rotwein', 40),
      (v.id, sid, 'Merlot Elena Walch', 'Rotwein', 41),
      (v.id, sid, 'Merlot Riserva Laimburg', 'Rotwein', 42),
      (v.id, sid, 'Merlot Tramin', 'Rotwein', 43),
      (v.id, sid, 'Cabernet Sauvignon Tramin', 'Rotwein', 44),
      (v.id, sid, 'Cabernet Franc "Puit"', 'Rotwein', 45),
      (v.id, sid, 'Cabernet Riserva "Staffes"', 'Rotwein', 46),
      (v.id, sid, 'T-Rot Cuvee', 'Rotwein', 47),
      (v.id, sid, 'Zeder Cuvee', 'Rotwein', 48),
      (v.id, sid, 'Amistar Cuvee', 'Rotwein', 49),
      (v.id, sid, 'Reserve del Conte IGT', 'Rotwein', 50),
      (v.id, sid, 'Primitivo di Manduria', 'Rotwein', 51),
      (v.id, sid, 'Primitivo di Manduria il BACCA', 'Rotwein', 52),
      (v.id, sid, 'Rosso di Montepulciano', 'Rotwein', 53),
      (v.id, sid, 'Chianti Nipozzano Riserva', 'Rotwein', 54),
      (v.id, sid, 'Brunello di Montalcino', 'Rotwein', 55),
      (v.id, sid, 'Ripassa Valpolicella Superiore', 'Rotwein', 56),
      (v.id, sid, 'Amaro Cavolo', 'Rotwein', 57),
      (v.id, sid, 'Barbera d''Asti Montebruna', 'Rotwein', 58),
      (v.id, sid, 'Barbaresco Tradizione "Marchesi"', 'Rotwein', 59),
      (v.id, sid, 'Barolo "Marchesi"', 'Rotwein', 60),
      (v.id, sid, 'Lagavulin 8 y', 'Spirituosen', 61),
      (v.id, sid, 'Ballantines', 'Spirituosen', 62),
      (v.id, sid, 'Remy Martin', 'Spirituosen', 63),
      (v.id, sid, 'Bushmills', 'Spirituosen', 64),
      (v.id, sid, 'Vecchia Romagna', 'Spirituosen', 65),
      (v.id, sid, 'Lagavulin', 'Spirituosen', 66),
      (v.id, sid, 'Puni Nova / Gold', 'Spirituosen', 67),
      (v.id, sid, 'Monkey Shoulder', 'Spirituosen', 68),
      (v.id, sid, 'Jack Daniels', 'Spirituosen', 69),
      (v.id, sid, 'Buffalo', 'Spirituosen', 70),
      (v.id, sid, 'Ter Lignum', 'Spirituosen', 71),
      (v.id, sid, 'Abbagnac Kloster Neustift', 'Spirituosen', 72),
      (v.id, sid, 'Birnenschnaps Schenna', 'Spirituosen', 73),
      (v.id, sid, 'Altitude Amaro Schenna', 'Spirituosen', 74),
      (v.id, sid, 'Vernablanc Schenna', 'Schaumwein & weitere Weine', 75),
      (v.id, sid, 'Comitissa Pas Dosè Riserva', 'Schaumwein & weitere Weine', 76),
      (v.id, sid, 'Arunda Rosé Brut Millesimato', 'Schaumwein & weitere Weine', 77),
      (v.id, sid, 'Prosecco Carmina', 'Schaumwein & weitere Weine', 78),
      (v.id, sid, 'Prosecco Rosé Millesimato', 'Schaumwein & weitere Weine', 79),
      (v.id, sid, 'Bollinger Special Cuvèe', 'Schaumwein & weitere Weine', 80),
      (v.id, sid, 'Bellavista Grande Cuvee Alma', 'Schaumwein & weitere Weine', 81),
      (v.id, sid, 'Vernaccia di San Gimigiano', 'Schaumwein & weitere Weine', 82),
      (v.id, sid, 'K-White Cuvee', 'Schaumwein & weitere Weine', 83),
      (v.id, sid, 'Chardonnay "Festival"', 'Schaumwein & weitere Weine', 84),
      (v.id, sid, 'Rosalie Rose', 'Schaumwein & weitere Weine', 85),
      (v.id, sid, 'Vernatsch Meran', 'Schaumwein & weitere Weine', 86),
      (v.id, sid, 'Alano Toggenburg', 'Schaumwein & weitere Weine', 87),
      (v.id, sid, 'Lagrein / Blauburgunder "Zemmer"', 'Schaumwein & weitere Weine', 88),
      (v.id, sid, 'Aperol / Campari', 'Sonstiges', 89),
      (v.id, sid, 'Martini Rot / Weiß', 'Sonstiges', 90),
      (v.id, sid, 'Ramazotti Rosato', 'Sonstiges', 91),
      (v.id, sid, 'Lillet Weiß/Rot', 'Sonstiges', 92),
      (v.id, sid, 'Italicus', 'Sonstiges', 93),
      (v.id, sid, 'Walcher St. Magdalena', 'Grappa / Rum', 94),
      (v.id, sid, 'Nonino Chardonnay', 'Grappa / Rum', 95),
      (v.id, sid, 'Berta Monpra', 'Grappa / Rum', 96),
      (v.id, sid, 'Prosecco Andrea de Ponte', 'Grappa / Rum', 97),
      (v.id, sid, 'Morbida Smooth Poli', 'Grappa / Rum', 98),
      (v.id, sid, 'Ron Zacapa 23 Centenario', 'Grappa / Rum', 99),
      (v.id, sid, 'Diplomatico Riserva', 'Grappa / Rum', 100);
  end loop;
end $$;
