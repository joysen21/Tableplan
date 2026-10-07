import { expect, test } from '@playwright/test';
import { goView, loginDemo } from './helpers';

/** Menüverwaltung (Desktop): Stammdaten, Tagesmenü, Zutatenliste, Allergen-Warnungen, Rechte */

test('Küche: Zutat und Gericht anlegen, Menü eintragen, Zutatenliste stimmt', async ({ page }) => {
  await loginDemo(page, 'Karl (Küche)');
  await goView(page, 'Menü');
  const tabs = page.getByRole('group', { name: 'Bereich' });

  await tabs.getByRole('button', { name: /^Zutaten/ }).click();
  await page.getByRole('button', { name: 'Zutat', exact: true }).click();
  await page.locator('.modal').getByLabel('Name *').fill('E2E Kürbis');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('.toast')).toContainText('Gespeichert');
  await expect(page.locator('table.list')).toContainText('E2E Kürbis');

  await tabs.getByRole('button', { name: /^Gerichte/ }).click();
  await page.getByRole('button', { name: 'Gericht', exact: true }).click();
  const dlg = page.locator('.modal');
  await dlg.getByLabel('Name *').fill('E2E Kürbissuppe');
  await dlg.getByLabel('Gang').selectOption({ label: 'Suppe' });
  await dlg.getByLabel('Zutat hinzufügen').selectOption({ label: 'E2E Kürbis (g)' });
  await dlg.getByLabel('Menge E2E Kürbis').fill('200');
  await dlg.getByLabel('Zutat hinzufügen').selectOption({ label: 'Sahne (ml)' });
  await dlg.getByLabel('Menge Sahne').fill('50');
  await expect(dlg.locator('.infobox')).toContainText('Milch');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('.toast')).toContainText('Gespeichert');

  // Woche ohne Demo-Menüs
  await tabs.getByRole('button', { name: 'Wochenplan' }).click();
  await page.getByRole('button', { name: 'Folgewoche' }).click();
  await page.getByRole('button', { name: 'Folgewoche' }).click();
  const create = page.getByRole('button', { name: /^Menü Abendessen .* anlegen$/ }).first();
  const label = (await create.getAttribute('aria-label'))!.replace(/ anlegen$/, '');
  await create.click();
  await dlg.getByLabel('Gericht hinzufügen').selectOption({ label: 'E2E Kürbissuppe' });
  await dlg.getByLabel('Portionen von Hand').check();
  await dlg.getByLabel('Portionen', { exact: true }).fill('40');
  await dlg.getByLabel('Puffer %').fill('0');
  await expect(dlg.locator('.menu-portions')).toContainText('40');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('.toast')).toContainText('Menü gespeichert');

  await page.getByRole('button', { name: label, exact: true }).click();
  await dlg.getByRole('button', { name: 'Zutatenliste anzeigen' }).click();
  await expect(page).toHaveURL(/\/berichte$/);
  const row = (name: string) => page.locator('.report table.list tr').filter({ has: page.locator('td:first-child', { hasText: new RegExp('^' + name + '$') }) });
  await expect(row('E2E Kürbis')).toContainText('8 kg'); // 40 × 200 g
  await expect(row('Sahne')).toContainText('2 l'); // 40 × 50 ml
});

test('Gast-Allergen erscheint als Warnung in der Küchenvorschau', async ({ page }) => {
  await loginDemo(page);
  await page.getByRole('button', { name: 'Reservierung', exact: true }).click();
  const dlg = page.locator('.modal');
  await dlg.getByLabel('Service').selectOption({ label: 'Abendessen' });
  await dlg.getByLabel('Name *').fill('E2E Allergie');
  await dlg.getByRole('button', { name: /Schalenfrüchte/ }).click();
  await expect(dlg.getByRole('button', { name: /Schalenfrüchte/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Speichern' }).click();
  const confirm = page.getByRole('button', { name: 'Trotzdem speichern' });
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) await confirm.click();
  await expect(page.locator('.toast')).toContainText('Gespeichert');

  await goView(page, 'Berichte');
  await page.locator('header').getByLabel('Service').selectOption({ label: 'Abendessen' });
  await page.getByRole('button', { name: 'Küchenvorschau / Briefing' }).click();
  // Demo-Abendmenü heute enthält den Apfelstrudel (Haselnüsse) und als Alternative das Sorbet
  await expect(page.locator('.allergen-warnings')).toContainText('E2E Allergie');
  await expect(page.locator('.allergen-warnings > div', { hasText: 'E2E Allergie' })).toContainText('Waldbeerensorbet');
});

test('Service sieht Menüs und Allergene, darf aber nichts ändern', async ({ page }) => {
  await loginDemo(page, 'Toni (Service)');
  await goView(page, 'Menü');
  await expect(page.getByRole('button', { name: 'Vorwoche übernehmen' })).toHaveCount(0);
  await page.locator('button.mw-cell').first().click();
  await expect(page.locator('.modal')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Speichern' })).toHaveCount(0);
  await expect(page.locator('.modal').getByLabel('Puffer %')).toBeDisabled();
  await page.getByRole('button', { name: 'Schließen' }).last().click();
  await page.getByRole('group', { name: 'Bereich' }).getByRole('button', { name: /^Gerichte/ }).click();
  await expect(page.getByRole('button', { name: 'Gericht', exact: true })).toHaveCount(0);
});
