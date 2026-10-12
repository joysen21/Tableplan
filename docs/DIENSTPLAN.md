# Dienstplan-Modul – Plan

Zuschaltbares Modul in Tischplan (Einstellungen → Module) für Gastro- und Hotelbetriebe in Südtirol/Italien.
Mitarbeitende bekommen keinen Login, sondern nur Lesezugang (Link, Kalender-Abo, PDF). Keine Zeiterfassung, keine Lohndaten.

## Eigenständige App
Dieselbe Codebasis wird zusätzlich als **„Dienstplan“** gebaut (`VITE_APP=dienstplan`, eigenes Vercel-Projekt, gleiche Supabase-Datenbank und gleicher Login).
Sie zeigt nur Dienstplan und Einstellungen; Funktionen, die den ganzen Datenstand ersetzen (Demo-Daten, Sicherung einspielen), sind dort ausgeblendet.
Neue Funktionen landen automatisch in beiden Apps.

## Rechte
- **Admin**: alles, legt Bereiche an und weist Bereichsleitungen zu.
- **Bereichsleitung** (Zuweisung zusätzlich zur Rolle, `departments.lead_ids`): plant die eigenen Bereiche – Mitarbeitende,
  Positionen, Vorlagen, später Dienste, Abwesenheiten und das Veröffentlichen. Mehrere Leitungen je Bereich sind möglich, ebenso mehrere Bereiche je Person.
- **Bereichsübergreifend**: Planer sehen alle Mitarbeitenden und dürfen auch Kräfte aus anderen Bereichen einplanen, wenn sie die Position beherrschen.
- Durchgesetzt in der DB (`can_plan`, `is_planner`, RLS) und gleich nachgebildet in `src/domain/roster.ts` und im Demo-Repo.

## Etappen
1. ✅ **Grundgerüst**: Modul-Schalter, Bereiche & Leitungen, Positionen, Mitarbeitende, Schichtvorlagen – Migration `20261012000000_dienstplan.sql`
2. ✅ **Wochenplan**: Raster Mitarbeitende × Tage, Vorlagen-Pinsel und Drag & Drop, offene Schichten, Stundensummen gegen Soll, Tag- und Monatsansicht,
   Vorwoche übernehmen; Prüfhinweise (Ruhezeit, freier Tag, Pause, Wochenstunden, Vertragszeit, Qualifikation, Abwesenheit) – Regeln je Betrieb einstellbar;
   Doppelbelegung in der DB gesperrt (Trigger `shifts_no_overlap`)
3. ✅ **Abwesenheiten** (Urlaub, krank, frei, sonstige), Urlaubskonto (ohne Sonntage/Feiertage), Feiertage Italien + Pfingstmontag Südtirol
4. ✅ **Veröffentlichen** pro Bereich und Woche (mit Anzeige späterer Änderungen), Lesezugang über geheimen Link `/p/<token>` (DE/IT), Drucken
5. ✅ **Tischplan-Bezug**: erwartete Gäste je Tag (Spitzen-Service) und Besetzungsvorschlag je Bereich (Schlüssel + Mindestbesetzung), „Heute im Dienst“ im Live-Plan
6. ✅ **Kalender-Abo** (`api/ical/[token].js`, Vercel-Funktion), **Stundenexport** (CSV je Monat)
   – Migration `20261014000000_dienstplan_planung.sql` (Etappen 2–6)

## Offen
- Komplette Oberfläche auf Italienisch (bisher nur die Seite für die Mitarbeitenden)
- Eigene Domain für beide Apps: auf `…vercel.app` schützt der Vercel-Login auch Mitarbeiter-Link und Kalender-Abo
