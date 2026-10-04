# Tischplan – Tischplanung für Hotels & Restaurants

Ein Web-Tool für Empfang, Service und Küche: Raumplan, Reservierungen, Live-Tischplan, Zeitleiste, Hotelgäste mit festem Tisch und druckbare Berichte.
Es ist in reinem HTML/CSS/JavaScript geschrieben. Es gibt keinen Build-Schritt; der Ordner kann direkt im IIS (oder auf einem anderen Webserver) liegen.

## Betriebsarten

| Modus | Wann | Daten |
|---|---|---|
| **Cloud (Supabase)** | `config.js` mit Supabase-URL und Key ist vorhanden | zentral in Supabase; alle Geräte sind live synchron; Login per E-Mail |
| **Lokal** | keine `config.js` vorhanden | nur im Browser (localStorage); Login per Benutzer + PIN; gedacht für Demos |

## Funktionen

- **Raumplan-Editor:**
  - Räume, Tische (rund, quadratisch, rechteckig, Bank) und Deko
  - Grundriss als Hintergrundbild, Reviere, Tischkombinationen, Layout-Varianten
- **Reservierungen:**
  - Status-Workflow, Verweildauer je Personenzahl, Pacing, Seatings, Stammtische
  - Tischvorschläge und Konfliktprüfung
- **Live-Plan:**
  - farbige Tischstatus
  - Reservierungen per Ziehen zuweisen oder verschieben
  - Walk-ins, Tische zusammenlegen, trennen und sperren
- **Zeitleiste:** Tische × Uhrzeit; Uhrzeit, Tisch und Dauer per Ziehen ändern
- **Hotelgäste:**
  - Halb- und Vollpension mit automatischen Reservierungen für jede Nacht
  - fester Tisch für den ganzen Aufenthalt
  - Anreise- und Abreiselisten, CSV-Import
- **Berichte:** Tagesübersicht, Küchenvorschau/Briefing, Allergie-Liste, Hotel-Tischliste, Tischplan (Druck/PDF)
- **Rollen:** Admin, Empfang, Service, Küche
- **Sonstiges:** Änderungsprotokoll, Dark Mode, responsiv

## Projektstruktur

```
index.html            Einstieg
config.example.js     Vorlage für config.js (Supabase-Zugang, nicht im Repo)
css/app.css           Gestaltung
js/core.js            Konstanten, Hilfsfunktionen, Datenhaltung, Fachlogik (Konflikte, Vorschläge, Hotel)
js/demo.js            Demo-Daten
js/ui.js              Modal/Drag & Drop, Raumplan-SVG, Login, Kopfzeile, Live-Plan, Walk-in
js/views.js           Reservierungsformular, Zeitleiste, Liste, Hotelgäste, Berichte
js/admin.js           Raumplan-Editor, Einstellungen
js/cloud.js           Supabase: Login, Laden, Synchronisation, Realtime, Mitglieder
js/main.js            Start
vendor/supabase.js    supabase-js v2 (lokal, kein CDN nötig)
supabase/schema.sql   Datenbank-Schema inkl. Row Level Security
web.config            IIS-Einstellungen
```

## Einrichtung Supabase (einmalig)

1. **Schema einspielen:** Im Supabase-Dashboard unter *SQL Editor* den Inhalt von `supabase/schema.sql` ausführen. Das Skript kann mehrfach laufen.
2. **Anmeldung konfigurieren:** unter *Authentication → Sign In / Providers*:
   - **Allow new users to sign up** ausschalten. Nur eingeladene Benutzer kommen hinein.
   - *Email* aktiviert lassen.
3. **Adressen eintragen:** unter *Authentication → URL Configuration*:
   - **Site URL** auf die Adresse des Tools setzen, z. B. `https://server.kunde.it/tischplan/`
   - dieselbe Adresse auch unter *Redirect URLs* eintragen
   - Sonst führen die Links in Einladungs- und Passwort-Mails ins Leere.
4. **Ersten Benutzer einladen:** *Authentication → Users → Invite user*. Über den Link in der Mail legt der Benutzer im Tool sein Passwort fest.
5. **`config.js` anlegen:**
   - `config.example.js` kopieren und als `config.js` speichern.
   - **Project URL** und **anon/publishable Key** eintragen (*Project Settings → API*).
   - **Nie den `service_role`/secret Key verwenden.**
6. **Erste Anmeldung:**
   - Der erste Benutzer wählt *Ersteinrichtung: neuen Betrieb anlegen* und wird dadurch Admin.
   - Danach startet er mit Demo-Daten oder leer.
7. **Weitere Mitarbeiter:**
   - Zuerst in Supabase einladen (Schritt 4).
   - Dann im Tool unter *Einstellungen → Benutzer & Rollen* per E-Mail mit Rolle hinzufügen.

## Installation im IIS

1. Repository-Inhalt in einen Ordner kopieren, z. B. `C:\inetpub\wwwroot\tischplan\`. Der Ordner `supabase` wird über die `web.config` nicht ausgeliefert.
2. `config.js` dort ablegen (siehe oben).
3. Den Ordner im IIS als Anwendung oder virtuelles Verzeichnis einrichten. HTTPS wird empfohlen.

Updates: neue Dateien drüberkopieren, die `config.js` bleibt erhalten. Die `web.config` schaltet das Browser-Caching ab, damit Updates sofort wirken.

## Datenmodell

| Tabelle | Inhalt |
|---|---|
| `tp_betriebe` | Betriebe (mandantenfähig) |
| `tp_mitglieder` | Benutzer ↔ Betrieb mit Rolle (`admin`, `empfang`, `service`, `kueche`) |
| `tp_records` | alle Fachdaten als JSON-Datensätze je Sammlung (`coll`), siehe unten |

Die Sammlungen in `tp_records` sind: `rooms`, `tables`, `decor`, `combos`, `stations`, `services`, `layouts`, `stays`, `reservations`, `audit` und `meta`.

Die App überträgt beim Speichern nur geänderte Datensätze. Über Supabase Realtime erhalten alle anderen Geräte die Änderung sofort. Bei gleichzeitiger Bearbeitung desselben Datensatzes gewinnt die letzte Änderung.

### Rechte (Row Level Security)

| Rolle | Lesen | Schreiben |
|---|---|---|
| Admin | alles | alles, Mitglieder verwalten |
| Empfang | alles | Reservierungen, Hotelaufenthalte, Tische (Sperren), Protokoll |
| Service | alles | Reservierungen (Status), Protokoll |
| Küche | alles | – |

Benutzer anderer Betriebe sehen nichts. Die Rechte prüft die Datenbank selbst, nicht nur die Oberfläche.

## Hinweise

- Geladen werden Reservierungen der letzten 120 Tage und alle künftigen (einstellbar über `historyDays` in `config.js`). Ältere bleiben in der Datenbank.
- Ohne Internetverbindung werden Änderungen nicht gespeichert. Die Statusanzeige oben rechts zeigt das an, und das Tool versucht es automatisch erneut.
- Der anon-Key ist für den Browser gedacht und darf öffentlich sein. Die Daten schützen die Rechte in der Datenbank.
- Sicherung: *Einstellungen → Daten → Sicherung exportieren (JSON)*. Zusätzlich gibt es die Backups von Supabase.

## Offene Punkte (Phase 2/3)

Anbindung ans Hotelsystem (PMS), Warteliste mit Benachrichtigung, Gästeprofile mit Besuchshistorie, E-Mail/SMS an Gäste, Online-Buchungs-Widget, Auswertungen, Kassenanbindung, Mehrsprachigkeit (IT/EN – die Texte sind in `I18N` vorbereitet).
