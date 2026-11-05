import { expect, goView, loginDemo, test } from './helpers';

/** Raumplan exportieren und (in denselben bzw. einen anderen Betrieb) wieder importieren */
test('Raumplan exportieren, als neue Räume importieren und Raum ersetzen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await loginDemo(page);
  await goView(page, 'Raumplan-Editor');
  const rooms = await page.evaluate(() => (Object.values(JSON.parse(localStorage.getItem('tischplan.demo.v2')!).data)[0] as any).rooms.map((r: any) => r.name) as string[]);

  // Export
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Raumplan exportieren' }).click();
  const file = await (await dl).path();
  expect((await dl).suggestedFilename()).toMatch(/^raumplan-.*\.json$/);
  await expect(page.locator('.toast')).toContainText('Raumplan exportiert');

  // Import in denselben Betrieb: gleiche Namen, Reservierungen ab heute sperren „Ersetzen“
  await page.getByLabel('Raumplan-Datei wählen').setInputFiles(file);
  const dlg = page.getByRole('dialog', { name: 'Raumplan importieren' });
  await expect(dlg.getByRole('listitem')).toHaveCount(rooms.length);
  await expect(dlg).toContainText('existiert schon');
  await page.screenshot({ path: 'test-results/raumplan-import.png' });
  const locked = dlg.getByRole('listitem').filter({ hasText: 'ab heute' });
  if (await locked.count()) await expect(locked.first().getByRole('button', { name: 'Ersetzen' })).toBeDisabled();
  await dlg.getByRole('button', { name: 'Importieren' }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Raumplan importiert');
  await expect(page.locator('.toolbox select').first().locator('option')).toHaveCount(rooms.length * 2);
  await expect(page.locator('.toolbox select').first()).toContainText(`${rooms[0]} (2)`);

  // ohne Reservierungen: ersten Raum ersetzen → Anzahl Räume bleibt
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('tischplan.demo.v2')!);
    const v = Object.values(db.data)[0] as any; v.reservations = []; v.stays = [];
    localStorage.setItem('tischplan.demo.v2', JSON.stringify(db));
  });
  await page.reload();
  await goView(page, 'Raumplan-Editor');
  await page.getByLabel('Raumplan-Datei wählen').setInputFiles(file);
  const row = dlg.getByRole('listitem', { name: rooms[0], exact: true });
  await row.getByRole('button', { name: 'Ersetzen' }).click();
  await expect(dlg).toContainText('gleichnamige Tische erhalten');
  // übrige Räume: Neu anlegen (Standard)
  await dlg.getByRole('button', { name: 'Importieren' }).click();
  await expect(page.locator('.toast')).toContainText(`${rooms[0]} (ersetzt)`);
  await expect(page.locator('.toolbox select').first().locator('option')).toHaveCount(rooms.length * 3 - 1);

  // falsche Datei
  await page.getByLabel('Raumplan-Datei wählen').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await expect(page.locator('.toast')).toContainText('Keine gültige Raumplan-Datei');
  // auch in den Einstellungen
  await goView(page, 'Einstellungen');
  await page.getByText('Daten & Sicherung').click();
  await expect(page.getByRole('button', { name: 'Raumplan exportieren' })).toBeVisible();
  expect(errors).toEqual([]);
});
