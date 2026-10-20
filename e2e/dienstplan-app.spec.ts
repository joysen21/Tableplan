import { expect, test, loginDemo } from './helpers';

/** Eigenständige Dienstplan-App (Build mit VITE_APP=dienstplan, Port 4174) */

const errors: string[] = [];
test.beforeEach(({ page }) => { page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(() => { expect(errors, errors.join('\n')).toEqual([]); errors.length = 0; });

test('Admin: nur Dienstplan und Einstellungen, ohne Tischplan-Funktionen', async ({ page }) => {
  await page.goto('/?demo');
  await expect(page).toHaveTitle('Dienstplan');
  await expect(page.getByRole('heading', { name: 'Dienstplan – Demo-Modus' })).toBeVisible();
  await loginDemo(page);
  await expect(page).toHaveURL(/\/dienstplan$/);
  await expect(page.locator('nav.topnav a')).toHaveText(['Dienstplan', 'Einstellungen']);
  await expect(page.locator('.roster-grid')).toContainText('Karl Pichler');
  await page.screenshot({ path: 'test-results/dienstplan-app.png' });

  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await expect(page.getByRole('heading', { name: 'Bereiche & Leitungen' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Dienstplan' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Service', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Demo-Daten neu erzeugen' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Sicherung exportieren/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/dienstplan-app-einstellungen.png', fullPage: true });

  // Tischplan-Adressen leiten auf den Dienstplan um
  await page.goto('/live');
  await expect(page).toHaveURL(/\/dienstplan$/);
});

test('Bereichsleitung sieht nur den Dienstplan, ohne Leitung gibt es einen Hinweis', async ({ page }) => {
  await loginDemo(page, 'Karl (Küche)');
  await expect(page.locator('nav.topnav a')).toHaveText(['Dienstplan']);
  // Eva hat keine Bereichsleitung → statt der App ein Hinweis (ohne Kopfzeile)
  await page.evaluate(() => sessionStorage.removeItem('tischplan.demo.user'));
  await page.goto('/?demo');
  await page.getByRole('button', { name: /Eva .Empfang./ }).click();
  await expect(page.getByText('keiner Bereichsleitung zugeordnet')).toBeVisible();
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByRole('heading', { name: 'Dienstplan – Demo-Modus' })).toBeVisible();
});
