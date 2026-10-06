# CLAUDE.md – Projektwissen für Claude Code

## Projekt
Tischplan: Web-App zur Tischplanung für Hotels & Restaurants (Raumplan, Reservierungen, Live-Plan, Zeitleiste, Hotelgäste, Berichte).
React 18 + TypeScript (Vite), Zustand-Stores (zustand), Supabase (PostgreSQL, Auth, Realtime, Storage). Deployment: Vercel (Push auf `main` = live).
Oberfläche und Texte auf **Deutsch**. Arbeitssprache mit dem Nutzer: Deutsch.

## Befehle
- `npm run dev` – Entwicklungsserver (http://localhost:5173), mit `?demo` im Demo-Modus ohne Datenbank
- `npm run typecheck` – TypeScript prüfen (muss fehlerfrei sein)
- `npm test` – Unit-Tests (vitest, `src/**/*.test.ts`)
- `npm run e2e` – Playwright-Oberflächentests im Demo-Modus
- `npm run build` – Produktions-Build

Nach jeder Änderung: `npm run typecheck` und `npm test`; bei UI-Änderungen zusätzlich `npm run e2e`.

## Architektur
- `src/domain/` – reine Fachlogik ohne UI/DB (Konfliktprüfung, Tischvorschläge, Live-Status, Hotel-Planung). Neue Regeln hierhin + Unit-Test.
- `src/data/repo.ts` – Schnittstelle für den Datenzugriff; zwei Implementierungen: `supabaseRepo.ts` (live) und `demoRepo.ts` (Browser). **Beide** bei Änderungen anpassen.
- `src/data/mapping.ts` – Umwandlung DB-Zeile (snake_case) ↔ Fachobjekt (camelCase).
- `src/store/app.ts` – Datenstand + Schreiboperationen + Realtime-Ereignisse; `ui.ts` Bedienzustand; `dialogs.ts` globale Dialoge.
- `src/views/` Seiten, `src/forms/` Dialoge, `src/ui/` Bausteine (Raumplan-SVG, Modal, Drag & Drop).
- `supabase/migrations/` – Datenbankschema. **Schemaänderungen immer als neue Migrationsdatei** (z. B. `20261101000000_beschreibung.sql`), bestehende nicht ändern. Der Nutzer führt sie im Supabase SQL Editor aus – darauf hinweisen.

## Wichtige Regeln
- Doppelbuchungsschutz liegt in der DB (Exclusion Constraint `reservation_tables_no_overlap`). Nicht aufweichen.
- Reservierungen immer über `save_reservations` / `save_stay` (RPC, atomar) speichern, nicht direkt in Tabellen schreiben.
- Rollenrechte (admin, empfang, service, kueche) werden per RLS + Trigger in der DB erzwungen; UI-Rechte in `src/domain/constants.ts` (`ROLE_VIEWS`, `canEdit`) passend halten.
- Niemals Zugangsdaten committen: `.env.local` ist in `.gitignore`. Nur den anon/publishable Key verwenden, nie `service_role`.
- Texte zentral in `src/lib/i18n.ts` ergänzen, wo sinnvoll.

## Umgebungsvariablen
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (lokal in `.env.local`, live in Vercel → Settings → Environment Variables; nach Änderung in Vercel neu deployen).
