# Tischplan – Tischplanung für Hotels & Restaurants

Web-App für Empfang, Service und Küche: Raumplan, Reservierungen, Live-Tischplan, Zeitleiste, Hotelgäste mit festem Tisch und druckbare Berichte.

**Technik:** React 18 + TypeScript (Vite) · Supabase (PostgreSQL, Auth, Realtime, Storage) · Hosting auf Vercel oder Netlify

---

## Funktionen

- **Raumplan-Editor:**
  - Räume, Tische (rund, quadratisch, rechteckig, Bank) und Deko
  - Grundriss-Bild (Supabase Storage), Reviere, feste Tischkombinationen, Layout-Varianten
- **Reservierungen:**
  - Status-Workflow, Verweildauer je Personenzahl, Pacing, Seatings, wöchentliche Stammtische, Tischvorschläge
  - Konfliktprüfung mit Hinweisen
- **Live-Plan:**
  - farbige Tischstatus
  - Reservierungen per Ziehen zuweisen oder verschieben
  - Walk-ins (die Dauer wird automatisch gekürzt, wenn der Tisch später reserviert ist)
  - Tische zusammenlegen, trennen und sperren
- **Zeitleiste:** Tische × Uhrzeit; Uhrzeit, Tisch und Dauer per Ziehen ändern
- **Hotelgäste:**
  - Halb- und Vollpension mit automatischen Reservierungen für jede Nacht
  - fester Tisch für den ganzen Aufenthalt (belegte Nächte werden gemeldet)
  - Anreise- und Abreiselisten, CSV-Import
- **Berichte:** Tagesübersicht, Küchenvorschau/Briefing, Allergie-Liste, Hotel-Tischliste, Tischplan – druckbar bzw. als PDF
- **Rollen:**
  - Admin, Empfang, Service, Küche
  - Die Rechte werden **in der Datenbank** durchgesetzt (Row Level Security + Trigger).
- **Live-Abgleich:** Alle Geräte sind sofort synchron (Supabase Realtime).
- **Sonstiges:** Änderungsprotokoll, Sicherung (Export/Import), Dark Mode, Bedienung per Touch

### Doppelbuchungsschutz

Ein Tisch kann nie von zwei aktiven Reservierungen gleichzeitig belegt sein. Das prüft die Datenbank selbst (Exclusion Constraint auf `reservation_tables`), auch wenn zwei Geräte im selben Moment speichern. Die Oberfläche zeigt Belegungen schon vorher an und blockiert das Speichern. Andere Hinweise (Tisch zu klein, Pacing, Sperre, möglicher doppelter Gast) lassen sich nach Rückfrage übergehen.

---

## Schnellstart lokal

```bash
npm install
npm run dev          # http://localhost:5173
```

Ohne Supabase-Zugang startet die App im **Demo-Modus**: Die Daten liegen im Browser, die Anmeldung erfolgt per Rollenwahl. Mit `?demo` in der Adresse lässt sich der Demo-Modus auch bei vorhandener Konfiguration erzwingen.

Für Supabase eine Datei `.env.local` anlegen (Vorlage: `.env.example`):

```
VITE_SUPABASE_URL=https://<projekt>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

> Nur den **anon/publishable** Key verwenden, **niemals** den `service_role`/secret Key.

---

## Einrichtung Supabase (einmalig)

1. **Schema:**
   - Im Dashboard unter *SQL Editor* den Inhalt von `supabase/migrations/20261005000000_init.sql` ausführen. Das Skript kann mehrfach laufen.
   - Es legt Tabellen, Rechte, Funktionen, den Storage-Bucket `floorplans` und die Realtime-Freigabe an.
2. **Anmeldung** (*Authentication → Sign In / Providers*):
   - **Allow new users to sign up** ausschalten.
   - *Email* aktiviert lassen.
3. **Adressen** (*Authentication → URL Configuration*):
   - **Site URL** = Adresse der App, z. B. `https://tischplan.vercel.app`
   - Unter **Redirect URLs** dieselbe Adresse sowie `http://localhost:5173/**` für die Entwicklung eintragen.
4. **Ersten Benutzer anlegen:** *Authentication → Users → Add user*. Entweder mit Passwort und „Auto Confirm User“ anlegen, oder per „Invite user“ einladen; dann setzt er das Passwort über den Link selbst.
5. **Erste Anmeldung in der App:**
   - *Ersteinrichtung: neuen Betrieb anlegen* wählen. Dieser Benutzer wird Admin.
   - Danach mit Demo-Daten oder leer starten.
6. **Weitere Mitarbeiter:**
   - zuerst in Supabase anlegen oder einladen (Schritt 4)
   - dann in der App unter *Einstellungen → Benutzer & Rollen* per E-Mail mit Rolle hinzufügen

Der Prototyp nutzte die Tabellen `tp_*`. Sie stören nicht und können mit `supabase/cleanup_prototype.sql` entfernt werden.

---

## Deployment auf Vercel (empfohlen)

1. Auf [vercel.com](https://vercel.com) mit GitHub anmelden.
2. *Add New → Project* wählen und das Repository importieren. Vercel erkennt Vite automatisch; die Einstellungen stehen in `vercel.json`.
3. Unter *Environment Variables* `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` eintragen.
4. Auf *Deploy* klicken. Jeder Push auf `main` veröffentlicht danach automatisch; Pull Requests bekommen eine Vorschau-Adresse.
5. Die Vercel-Adresse in Supabase als *Site URL* bzw. *Redirect URL* eintragen (siehe oben).

**Netlify** funktioniert gleich (`netlify.toml` liegt bei).

**IIS:** `npm run build` ausführen und den Ordner `dist/` kopieren. Der IIS braucht das *URL Rewrite*-Modul, damit alle Pfade auf `index.html` zeigen.

---

## Projektstruktur

```
src/
  domain/      Fachlogik ohne UI: Typen, Konflikte, Vorschläge, Hotel-Planung, Demo-Daten (+ Unit-Tests)
  data/        Datenzugriff: Schnittstelle (repo.ts), Supabase-Implementierung, Demo-Implementierung
  store/       Zustand (zustand): Daten des Betriebs, Bedienzustand, Dialoge
  views/       Seiten: Live-Plan, Zeitleiste, Reservierungen, Hotel, Berichte, Editor, Einstellungen
  forms/       Dialoge: Reservierung, Tisch-Popup, Walk-in, Sperre, Aufenthalt, CSV-Import
  ui/          Bausteine: Raumplan-SVG, Modal, Drag & Drop, Rückmeldungen
supabase/
  migrations/  Datenbankschema inkl. Row Level Security
e2e/           Oberflächentests (Playwright, Demo-Modus)
prototype/     Erster HTML-Prototyp (archiviert)
```

### Datenmodell

| Tabelle | Inhalt |
|---|---|
| `venues`, `members` | Betriebe; Benutzer mit Rolle je Betrieb |
| `rooms`, `dining_tables`, `decor`, `stations`, `table_combos`, `layouts` | Raumplan |
| `services`, `table_blocks` | Services (Zeiten, Verweildauer, Pacing, Seatings) und Tischsperren |
| `stays` | Hotelaufenthalte (Zimmer, Verpflegung, fester Tisch) |
| `reservations`, `reservation_tables` | Reservierungen und Tischbelegung (mit Doppelbuchungsschutz) |
| `audit_log` | Änderungsprotokoll |

Zusammenhängende Änderungen speichert die Datenbank atomar über die Funktionen `save_reservations` und `save_stay`: entweder alles oder nichts.

### Rechte

| Rolle | Lesen | Schreiben |
|---|---|---|
| Admin | alles | alles, Mitglieder verwalten |
| Empfang | alles | Reservierungen, Hotelaufenthalte, Tischsperren, Protokoll |
| Service | alles | nur Status von Reservierungen (per Trigger erzwungen) |
| Küche | alles | – |

---

## Tests

```bash
npm run typecheck    # TypeScript
npm test             # Unit-Tests der Fachlogik (vitest)
npm run e2e          # Oberflächentests im Demo-Modus (Playwright)
```

Den Integrationstest gegen eine echte Datenbank (`src/data/supabaseRepo.int.test.ts`) gibt es zusätzlich. Er läuft gegen PostgreSQL mit dem Schema und PostgREST und wird über diese Variablen aktiviert:

```bash
TP_INT_URL=http://localhost:3002 TP_INT_SECRET=<jwt-secret> TP_INT_VENUE=<venue-uuid> npx vitest run src/data
```

---

## Offene Punkte (nächste Ausbaustufen)

- Online-Buchungs-Widget für Gäste (Supabase Edge Function + öffentliche Verfügbarkeit)
- Automatische E-Mail/SMS-Bestätigungen und Erinnerungen
- Warteliste mit Benachrichtigung, Gästeprofile mit Besuchshistorie
- Auswertungen (Auslastung, No-Show-Quote, Quellen)
- Anbindung an Hotelsystem (PMS) und Kasse
- Mehrsprachigkeit IT/EN (die Texte liegen bereits zentral in `src/lib/i18n.ts`)
