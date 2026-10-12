# Dienstplan-Modul – Plan

Zuschaltbares Modul in Tischplan (Einstellungen → Module) für Gastro- und Hotelbetriebe in Südtirol/Italien.
Mitarbeitende bekommen keinen Login, sondern nur Lesezugang (Link, Kalender-Abo, PDF). Keine Zeiterfassung, keine Lohndaten.

## Rechte
- **Admin**: alles, legt Bereiche an und weist Bereichsleitungen zu.
- **Bereichsleitung** (Zuweisung zusätzlich zur Rolle, `departments.lead_ids`): plant die eigenen Bereiche – Mitarbeitende,
  Positionen, Vorlagen, später Dienste, Abwesenheiten und das Veröffentlichen. Mehrere Leitungen je Bereich sind möglich, ebenso mehrere Bereiche je Person.
- **Bereichsübergreifend**: Planer sehen alle Mitarbeitenden und dürfen auch Kräfte aus anderen Bereichen einplanen, wenn sie die Position beherrschen.
- Durchgesetzt in der DB (`can_plan`, `is_planner`, RLS) und gleich nachgebildet in `src/domain/roster.ts` und im Demo-Repo.

## Etappen
1. ✅ **Grundgerüst**: Modul-Schalter, Bereiche & Leitungen, Positionen, Mitarbeitende (Vertrag, Saison, Wochenstunden), Schichtvorlagen (inkl. Teildienst, Nachtschicht)
   – Migration `20261012000000_dienstplan.sql`
2. **Wochenplan**: Raster Mitarbeitende × Tage, Drag & Drop der Vorlagen, Stundensummen gegenüber dem Soll, Konfliktprüfung
   (Ruhezeit 11 h, freier Tag pro Woche, Pause ab 6 h, Durchschnitt 48 h, Vertragszeit, Qualifikation) als einstellbare Warnungen; Doppelbelegung in der DB gesperrt
3. **Abwesenheiten** (Urlaub, krank, frei) und Urlaubskonto, Feiertage Italien/Südtirol
4. **Veröffentlichen** pro Bereich und Woche, Lesezugang über geheimen Link, PDF/Druck
5. **Tischplan-Bezug**: erwartete Gäste und Besetzungsvorschlag, „Heute im Dienst“ im Live-Plan
6. Danach: iCal-Abo, Stundenexport, italienische Oberfläche
