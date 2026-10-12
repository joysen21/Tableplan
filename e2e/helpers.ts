import { expect, test as base, type Page } from '@playwright/test';

export { expect };

/** Festgelegte Uhrzeit für alle Oberflächentests (heute, Europe/Berlin): Die Demo-Daten richten den Status
 *  der Reservierungen nach der aktuellen Uhrzeit (vergangene = platziert/abgeschlossen) – ohne feste Uhrzeit
 *  hingen die Tests von der Tageszeit ab. Mit E2E_TIME=HH:MM lässt sich die Uhrzeit zum Prüfen variieren. */
export const TEST_TIME = process.env.E2E_TIME || '16:00';

/** Zeitpunkt „heute HH:MM“ in Europe/Berlin (unabhängig von der Zeitzone des Testrechners) */
export function berlinToday(hhmm = TEST_TIME): Date {
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  for (const off of ['+01:00', '+02:00']) {
    const d = new Date(`${day}T${hhmm}:00${off}`);
    if (d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }) === hhmm) return d;
  }
  throw new Error('Ungültige Testuhrzeit: ' + hhmm);
}

/** test mit festgelegter Browser-Uhrzeit: die Zeit läuft ab „heute TEST_TIME“ normal weiter, Timer bleiben echt */
export const test = base.extend<{ fixedClock: void }>({
  fixedClock: [async ({ page }, use) => {
    await page.clock.setSystemTime(berlinToday());
    await use();
  }, { auto: true }]
});

export const VIEWS = ['Live-Plan', 'Zeitleiste', 'Reservierungen', 'Hotelgäste', 'Menü', 'Dienstplan', 'Berichte', 'Raumplan-Editor', 'Einstellungen'];

/** Demo-Modus mit frischen Daten starten und als Demo-Benutzer anmelden */
export async function loginDemo(page: Page, who = 'Anna (Admin)', theme?: 'light' | 'dark') {
  await page.goto('/?demo');
  await page.evaluate(th => { localStorage.removeItem('tischplan.demo.v2'); if (th) localStorage.setItem('tischplan.theme', th); }, theme);
  await page.goto('/?demo');
  await page.getByRole('button', { name: new RegExp(who.replace(/[()]/g, '.')) }).click();
  await expect(page.locator('header')).toBeVisible();
}

/** Ansicht öffnen – über die Navigation oder (am Handy) über das „Mehr“-Menü */
export async function goView(page: Page, name: string) {
  const link = page.getByRole('link', { name, exact: true });
  if (await link.isVisible()) return link.click();
  await page.getByRole('button', { name: 'Mehr' }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
