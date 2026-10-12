import { expect, test, type Page } from '@playwright/test';
import { goView, loginDemo } from './helpers';

/** Dienstplan Etappe 1 (Desktop): Modul-Schalter, Bereiche & Leitungen, Stammdaten, Rechte der Bereichsleitungen */

const errors: string[] = [];
test.beforeEach(({ page }) => { page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(() => { expect(errors, errors.join('\n')).toEqual([]); errors.length = 0; });

/** Benutzer wechseln, ohne die Demo-Daten zurückzusetzen */
async function switchUser(page: Page, who: string) {
  await page.evaluate(() => sessionStorage.removeItem('tischplan.demo.user'));
  await page.goto('/?demo');
  await page.getByRole('button', { name: new RegExp(who.replace(/[()]/g, '.')) }).click();
  await expect(page.locator('header')).toBeVisible();
}
const nav = (page: Page) => page.locator('header nav.topnav');

test('Admin: Bereich anlegen, Leitung zuweisen – die neue Leitung plant ihren Bereich', async ({ page }) => {
  await loginDemo(page);
  await expect(nav(page).getByRole('link', { name: 'Dienstplan' })).toBeVisible();
  await goView(page, 'Einstellungen');
  await page.getByLabel('Neuer Bereich').fill('Housekeeping');
  await page.getByRole('button', { name: 'Bereich', exact: true }).click();
  const leads = page.getByRole('group', { name: 'Leitung Housekeeping' });
  await leads.getByRole('button', { name: 'Eva (Empfang)' }).click();
  await expect(leads.getByRole('button', { name: 'Eva (Empfang)' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.dept-card').first().screenshot({ path: 'test-results/dienstplan-bereich.png' });

  // Eva (Empfang) sieht den Dienstplan nur als Leitung von Housekeeping
  await switchUser(page, 'Eva (Empfang)');
  await goView(page, 'Dienstplan');
  await page.getByRole('button', { name: 'Mitarbeiter/in' }).click();
  const dlg = page.locator('.modal');
  await expect(dlg.getByLabel('Stammbereich').locator('option')).toHaveText(['Housekeeping']);
  await dlg.getByLabel('Name *').fill('E2E Zimmerfrau');
  await expect(dlg.getByLabel('Kürzel')).toHaveAttribute('placeholder', 'EZ');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('.toast')).toContainText('Gespeichert');
  await page.getByLabel('Bereichsfilter').selectOption({ label: 'Housekeeping' });
  await expect(page.locator('table.list tbody tr')).toHaveCount(1);
  await expect(page.locator('table.list')).toContainText('E2E Zimmerfrau');
});

test('Küchenleitung: Vorlage mit Teildienst und Position anlegen, Service nur ansehen', async ({ page }) => {
  await loginDemo(page, 'Karl (Küche)');
  await goView(page, 'Dienstplan');
  await page.screenshot({ path: 'test-results/dienstplan-mitarbeitende.png' });

  // fremder Bereich: nur Ansicht
  await page.locator('table.list tr', { hasText: 'Toni Gruber' }).click();
  await expect(page.locator('.modal .infobox')).toContainText('nur Ansicht');
  await expect(page.getByRole('button', { name: 'Speichern' })).toHaveCount(0);
  await expect(page.locator('.modal').getByLabel('Name *')).toBeDisabled();
  await page.getByRole('button', { name: 'Schließen' }).last().click();

  // Schichtvorlage mit Teildienst
  const tabs = page.getByRole('group', { name: 'Bereich' });
  await tabs.getByRole('button', { name: 'Schichtvorlagen' }).click();
  await page.getByRole('button', { name: 'Vorlage', exact: true }).first().click();
  const dlg = page.locator('.modal');
  await expect(dlg.getByRole('combobox', { name: /^Bereich/ }).locator('option')).toHaveText(['Küche']);
  await dlg.getByLabel('Name *').fill('E2E Teildienst');
  await dlg.getByLabel('Beginn', { exact: true }).fill('09:00');
  await dlg.getByLabel('Ende', { exact: true }).fill('13:00');
  await dlg.getByLabel('Pause (Min.)').fill('0');
  await dlg.getByLabel('Teildienst (zweiter Block am selben Tag)').check();
  await dlg.getByLabel('Beginn 2. Block').fill('17:00');
  await dlg.getByLabel('Ende 2. Block').fill('21:30');
  await expect(dlg.locator('.infobox')).toContainText('Arbeitszeit: 8,5 h');
  await dlg.getByLabel('Ende 2. Block').fill('17:00');
  await expect(dlg.locator('.warnbox')).toContainText('zweiten Blocks');
  await dlg.getByLabel('Ende 2. Block').fill('21:30');
  await page.screenshot({ path: 'test-results/dienstplan-vorlage.png' });
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('.toast')).toContainText('Gespeichert');
  await expect(page.locator('.roster-tpl-group', { hasText: 'Küche' })).toContainText('09:00–13:00 + 17:00–21:30');
  await page.screenshot({ path: 'test-results/dienstplan-vorlagen.png' });

  // Position in der Küche anlegen; im Service gibt es keine Eingabefelder
  await tabs.getByRole('button', { name: 'Positionen' }).click();
  await page.getByLabel('Neue Position Küche').fill('Patissier');
  await page.getByLabel('Neue Position Küche').press('Enter');
  await expect(page.getByRole('textbox', { name: 'Position Patissier' })).toBeVisible();
  await expect(page.getByLabel('Neue Position Service')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/dienstplan-positionen.png' });
});

test('Ohne Leitung kein Dienstplan; Modul ausschalten blendet ihn aus', async ({ page }) => {
  await loginDemo(page, 'Eva (Empfang)');
  await expect(nav(page).getByRole('link', { name: 'Dienstplan' })).toHaveCount(0);
  await switchUser(page, 'Anna (Admin)');
  await goView(page, 'Einstellungen');
  await page.getByRole('checkbox', { name: 'Dienstplan' }).uncheck();
  await expect(nav(page).getByRole('link', { name: 'Dienstplan' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Bereiche & Leitungen' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Dienstplan' }).check();
  await expect(nav(page).getByRole('link', { name: 'Dienstplan' })).toBeVisible();
});
