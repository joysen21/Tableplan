import { expect, test, goView, loginDemo } from './helpers';

test('Fälligkeiten: Dashboard, neue Fälligkeit mit neuer Gruppe, per Flag erledigen', async ({ page }) => {
  await loginDemo(page, 'Eva (Empfang)');
  // Meldung oben und Zahl im Menü
  await expect(page.locator('.due-banner')).toContainText('überfällig'); // am PC; am Handy nur die Zahl
  await expect(page.getByRole('link', { name: 'Fälligkeiten' }).locator('.nav-badge')).toBeVisible();
  await goView(page, 'Fälligkeiten');
  await expect(page.locator('.due-banner')).toHaveCount(0);
  const over = page.getByRole('region', { name: 'Überfällig' });
  await expect(over).toContainText('Feuerlöscher prüfen');
  await expect(page.getByRole('region', { name: 'Heute fällig' })).toContainText('Lüftungsanlage');
  await expect(page.getByRole('region', { name: 'Demnächst fällig' })).toContainText('Aufzug TÜV');
  await page.screenshot({ path: 'test-results/faelligkeiten.png' });

  // erledigen per Flag: Intervall 24 Monate → nächster Termin, nicht mehr überfällig
  await over.getByRole('button', { name: 'Feuerlöscher prüfen erledigt' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'nächster Termin' })).toBeVisible();
  await expect(over).not.toContainText('Feuerlöscher prüfen');

  // neue Fälligkeit mit neuer Gruppe
  await page.getByRole('button', { name: 'Neue Fälligkeit' }).click();
  const dlg = page.getByRole('dialog', { name: 'Neue Fälligkeit' });
  await dlg.getByLabel('Beschreibung *').fill('Legionellenprüfung');
  await dlg.getByLabel('Gruppe').selectOption('__neu');
  await dlg.getByLabel('Neue Gruppe').fill('Hygiene');
  await dlg.getByRole('button', { name: 'Anlegen' }).click();
  await expect(dlg.getByLabel('Gruppe')).toHaveValue(/.+/);
  const due = new Date(Date.now() + 5 * 86400000).toLocaleDateString('sv-SE');
  await dlg.getByLabel('Fälligkeit *').fill(due);
  await dlg.getByLabel('Intervall (Monate)').fill('12');
  await dlg.getByLabel('Erinnerung (Tage vorher)').fill('10');
  const staff = dlg.getByLabel('Verantwortlich');
  await expect(staff.locator('option')).not.toHaveCount(1);
  await staff.selectOption({ index: 1 });
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('region', { name: 'Demnächst fällig' })).toContainText('Legionellenprüfung');
  await expect(page.getByRole('region', { name: 'Demnächst fällig' })).toContainText('Hygiene');

  // Liste: alle, Filter nach Gruppe
  await page.getByRole('tab', { name: /Alle Fälligkeiten/ }).click();
  await page.getByLabel('Gruppe filtern').selectOption({ label: 'Hygiene' });
  await expect(page.locator('.due-row')).toHaveCount(1);
  // Filter Stand, Sortierung, Gruppierung
  await page.getByRole('button', { name: 'Filter zurücksetzen' }).click();
  await page.getByLabel('Stand filtern').selectOption('ueberfaellig');
  await expect(page.locator('.due-row')).toHaveCount(0); // Feuerlöscher wurde erledigt
  await page.getByLabel('Stand filtern').selectOption('aktiv');
  await page.getByLabel('Sortierung').selectOption('titel');
  await expect(page.locator('.due-row').first()).toContainText('Aufzug TÜV');
  await page.getByLabel('Gruppierung').selectOption('gruppe');
  await expect(page.getByRole('group', { name: 'Hygiene' }).locator('.due-row')).toHaveCount(1);
  await expect(page.locator('.due-group-head').first()).toContainText('Hygiene');
  await page.screenshot({ path: 'test-results/faelligkeiten-liste.png', fullPage: true });
  // Einstellungen bleiben nach dem Neuladen
  await page.reload();
  await page.getByRole('tab', { name: /Alle Fälligkeiten/ }).click();
  await expect(page.getByLabel('Gruppierung')).toHaveValue('gruppe');
});
