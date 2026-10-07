# Menüverwaltung – Umsetzungsplan

Ziel: pro Tag und Service ein Menü eintragen, daraus die Zutatenliste (hochgerechnet auf die Gästezahl)
und die Allergen-Übersicht ausgeben; Gästeallergien als Auswahl der 14 EU-Allergene mit Warnungen.

## Entscheidungen
- **Menüform:** pro Gang ein oder mehrere Gerichte (Wahl, z. B. Fisch oder Fleisch). Festes Menü = genau ein Gericht je Gang.
- **Portionen:** automatisch = Personen aller nicht stornierten Reservierungen des Service (Hotelgäste mit HP/VP sind
  über `planStay` schon als Reservierungen enthalten) + Puffer in %; die Küche kann die Zahl pro Menü überschreiben.
- **Rechte:** Küche + Admin bearbeiten Zutaten, Gerichte und Menüs; Empfang und Service lesen.
- **Allergien:** schon in Phase 1 als Auswahl (14 EU-Allergene nach LMIV, VO (EU) 1169/2011); der bisherige Freitext bleibt als Notiz.

## Datenmodell (neue Migration `supabase/migrations/20261008000000_menue.sql`)
| Tabelle | Felder (zusätzlich `id`, `venue_id`, `created_at`, `updated_at`) |
|---|---|
| `ingredients` | `name`, `unit` (`g` · `ml` · `stk`), `allergens text[]`, `traces text[]` (kann Spuren enthalten) |
| `dishes` | `name`, `name_it`, `name_en`, `course`, `diet text[]` (vegetarisch, vegan), `notes`, `ingredients jsonb` = `[{ ingredientId, qty }]` Menge **pro Portion** |
| `menus` | `date`, `service_id`, `portions` (null = automatisch), `buffer_pct`, `notes`, `items jsonb` = `[{ course, dishId, share, name, allergens }]`; eindeutig je (`venue_id`, `date`, `service_id`) |
| `reservations`, `stays` | neue Spalte `allergens text[] not null default '{}'` |

- Allergen-Codes: `gluten, krebstiere, eier, fisch, erdnuesse, soja, milch, schalenfruechte, sellerie, senf, sesam, sulfite, lupinen, weichtiere`.
- `items[].name/allergens` = Momentaufnahme beim Speichern → vergangene Menüs bleiben unverändert, wenn ein Rezept später geändert wird.
- Rechte: `can_write` erweitern (`kueche` → `ingredients`, `dishes`, `menus`); RLS-Policies wie bei den übrigen Tabellen;
  Tabellen in die Realtime-Publikation; `save_reservations` / `save_stay` übernehmen `allergens`.
- Gerichte/Zutaten, die noch verwendet werden, lassen sich nicht löschen (Prüfung in der Fachlogik + Hinweis).

## Fachlogik (`src/domain/menu.ts` + `menu.test.ts`)
- `dishAllergens(d, dish)` – Allergene/Spuren aus den Zutaten ableiten
- `expectedPortions(d, date, serviceId)` – Personen aus Reservierungen (ohne storniert/No-Show)
- `menuPortions(d, menu)` – Überschreibung oder automatisch + Puffer, aufgerundet
- `ingredientList(d, menu)` – Menge pro Portion × Portionen × Anteil der Wahl, je Zutat summiert, Einheiten lesbar (g → kg, ml → l)
- `allergenConflicts(d, menu, reservations)` – Gast-Allergen × Gericht; meldet, ob es im Gang eine Alternative ohne das Allergen gibt
- `guessAllergens(text)` – Vorschlag aus dem bisherigen Freitext („Nüsse“ → Schalenfrüchte), damit vorhandene Daten schnell übernommen werden

## Phase 1
- [x] Migration + Typen (`types.ts`), Mapping (`mapping.ts`), Repo-Schnittstelle, `supabaseRepo` **und** `demoRepo`, Store (`app.ts`)
- [x] Fachlogik + Unit-Tests
- [x] Neue Ansicht **„Menü“** (`/menue`): Wochenansicht mit Tagen × Services; Menü eintragen (Gänge, Gerichte suchen, Anteile bei Wahl),
      Portionen (automatisch / überschreiben, Puffer), „Vorwoche kopieren“
- [x] Stammdaten in der Ansicht „Menü“: Reiter **Gerichte** (Rezept mit Zutaten und Mengen pro Portion) und **Zutaten** (Einheit, Allergene, Spuren)
- [x] Rollen: `ROLE_VIEWS` (admin, kueche, empfang, service sehen „Menü“), neues `canEditMenu` (admin, kueche)
- [x] Reservierung & Hotelgast: Allergen-Auswahl (Chips) + Freitext-Notiz; Vorschlag aus vorhandenem Freitext
- [x] Berichte: **Zutatenliste** (druckbar, nach Zutat oder nach Gericht), **Allergen-Übersicht** (Gericht × Allergen),
      **Küchenvorschau** zeigt Menü + Warnungen („T7 Huber: Schalenfrüchte – Dessert enthält Haselnüsse, Alternative: Sorbet“)
- [x] Demo-Daten: einige Zutaten, Gerichte und Menüs für die nächsten Tage
- [x] Tests: `npm run typecheck`, `npm test`, `npm run e2e` (neue Tests: Menü anlegen, Zutatenliste, Allergen-Warnung)
- [x] Hinweis an den Nutzer: Migration im Supabase SQL Editor ausführen

## Phase 2 (später)
- Druckbare Speisekarte (DE/IT/EN) mit Allergen-Kennzeichnung
- Vorbestellung pro Gast bei Wahlmenüs (ersetzt die geschätzten Anteile)
- Einkaufsliste über mehrere Tage, Lagerbestand, Wareneinsatz/Kosten pro Portion
