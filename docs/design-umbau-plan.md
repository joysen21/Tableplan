# Plan: Design-Umbau (klarere Buttons, besser am Handy)

Stand: 07.10.2026 · Vorgehen: Phase für Phase auf eigenem Branch, nach jeder Phase Vercel-Vorschau prüfen, erst dann nach `main` (= live).

## Entscheidungen
- **Alle Rollen** (Service, Empfang, Admin, Küche) nutzen die App am Handy → Mobile-first.
- Icons: **lucide-react**, wichtige Aktionen immer Icon + Text.
- Handy-Navigation: **Leiste unten** (max. 4 Einträge + „Mehr“). Rollen mit nur einer Ansicht (Küche) bekommen keine Leiste.
- Keine Datenbank-Änderungen nötig.

## Befunde (Ist-Zustand)
- `.btn` weiß auf weißem Panel mit dünnem grauem Rand → kaum von Eingabefeldern zu unterscheiden.
- Kein sichtbarer Tastatur-Fokus, kein Drück-Feedback; `.on` (Zustand) sieht aus wie `.primary` (Aktion).
- `.btn.small` nur 32 px hoch (Kopfzeile, Raum-Tabs, Schließen-Kreuz) – unter 44 px Touch-Mindestmaß.
- Symbole als Unicode (◀ ☾ ⎋ ✕ 🚶) – uneinheitlich, ⎋ für Abmelden unverständlich.
- Kopfzeile bricht am Handy in 3–4 Zeilen um und bleibt sticky.
- `.ritem`, `.stay-chip`, `.g-bar` haben `touch-action:none` → Liste lässt sich beim Wischen über Einträge vermutlich nicht scrollen.
- Tischzuweisung nur per Ziehen.
- Eingabefelder 15 px → iOS zoomt beim Antippen hinein.
- Reservierungen: Tabelle mit 9 Spalten, 7 Filter.
- Modals mit `100vh` → Footer auf iOS teils verdeckt.
- Keine mobilen e2e-Tests.

## Phase 0 – Ausgangslage ✅
- [x] Screenshots aller Ansichten (Demo-Modus) Desktop + Handy → `docs/screens/vorher/`
- [x] Playwright: Projekte `desktop` und `mobile` (Pixel 7, Touch); Handy-Tests in `e2e/mobile.spec.ts`
- [x] Scroll-Problem bestätigt: Wischen über die Kennzahlen scrollt die Seite um ca. 350 px, Wischen über eine Reservierung um 0 px
- [x] Zeitleisten-Test war uhrzeitabhängig (morgens Frühstück ohne Reservierungen) → wählt jetzt fest „Abendessen“

Ergebnisse der Messung:
- Kopfzeile am Handy ca. 300 px hoch (≈ ⅓ des Bildschirms)
- Reservierungsseite am Handy ca. 13.000 px lang (Tabelle)
- Kein seitliches Scrollen der Gesamtseite (gut)
- Bekannte Probleme sind in `e2e/mobile.spec.ts` als `test.fail()` hinterlegt; sobald eine Phase sie behebt, wird daraus ein normaler Test.

Befehle:
- Tests mit installiertem Chrome: `PW_CHANNEL=chrome npm run e2e`
- Screenshots: `PW_CHANNEL=chrome SHOT_DIR=docs/screens/nachher npx playwright test screens`

## Phase 1 – Button- & Design-Grundlage
- [ ] Button-Varianten: `primary` (gefüllt), `secondary` (getönt), `ghost`, `danger`; Zustand `.on` als Segment-Optik
- [ ] `:focus-visible`-Ring, `:active`-Feedback, klarer `:disabled`-Zustand
- [ ] Touch-Geräte (`@media (pointer:coarse)`): min. 44 px, auch `.small`
- [ ] Eingabefelder 16 px; Inputs optisch von Buttons abgrenzen
- [ ] `lucide-react` einbinden, Unicode-Symbole ersetzen
- [ ] Hell- und Dunkel-Modus prüfen

## Phase 2 – Navigation & Kopfzeile
- [ ] Handy: kompakte Leiste oben (Datum ◀ ▶, Service, Sync-Status)
- [ ] Handy: Leiste unten mit Hauptansichten je Rolle + „Mehr“ (Einstellungen, Hell/Dunkel, Abmelden)
- [ ] Desktop: Kopfzeile aufräumen, Benutzermenü statt „Name ⎋“
- [ ] Safe-Area (iPhone-Home-Balken) berücksichtigen

## Phase 3 – Seiten mobil
- [ ] Live: Umschalter „Plan | Liste“, schwebender ＋-Button, Tippen-statt-Ziehen zur Tischzuweisung, Ziehen nur am Griff
- [ ] Reservierungen: Kartenansicht am Handy, Filter als Bottom-Sheet
- [ ] Zeitleiste: schmalere Namensspalte, größere Touch-Ziele
- [ ] Dialoge: am Handy volle Höhe, Footer fixiert, `dvh`
- [ ] Hotel, Berichte, Editor, Einstellungen nach gleichem Muster

## Phase 4 – Prüfen & Veröffentlichen
- [ ] `npm run typecheck`, `npm test`, `npm run e2e` (Desktop + Handy)
- [ ] Vorschau-Link testen (echte Geräte), dann Merge nach `main`
