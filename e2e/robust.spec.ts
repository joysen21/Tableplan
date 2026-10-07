import { expect, test, type Page } from '@playwright/test';
import { loginDemo } from './helpers';

/** Robustheit: Bearbeitungskonflikte und Auffangnetz bei Anzeigefehlern (Desktop) */

/** Demo-Datenstand im Browser lesen/ändern (simuliert ein anderes Gerät ohne Live-Abgleich) */
function changeStored(page: Page, fn: string, arg: unknown) {
  return page.evaluate(([src, a]) => {
    const db = JSON.parse(localStorage.getItem('tischplan.demo.v2')!);
    const venue = Object.values(db.data)[0] as any;
    const out = new Function('venue', 'arg', src)(venue, a);
    localStorage.setItem('tischplan.demo.v2', JSON.stringify(db));
    return out;
  }, [fn, arg] as const);
}
async function confirmWarnings(page: Page) {
  const btn = page.getByRole('button', { name: 'Trotzdem speichern' });
  if (await btn.isVisible({ timeout: 800 }).catch(() => false)) await btn.click();
}

test('Gleichzeitige Änderung: fremder Status bleibt erhalten, eigene Notiz wird ergänzt', async ({ page }) => {
  await loginDemo(page);
  // bestätigte Reservierung der nächsten Tage mit eindeutigem Namen
  const target = await changeStored(page, `
    const day = new Date().toLocaleDateString('sv-SE'), end = new Date(Date.now() + 5 * 864e5).toLocaleDateString('sv-SE');
    const r = venue.reservations.find(x => x.date >= day && x.date <= end && x.status === 'bestaetigt' && !x.stayId
      && venue.reservations.filter(y => y.name === x.name).length === 1);
    return { id: r.id, name: r.name };`, null) as { id: string; name: string };

  await page.getByRole('link', { name: 'Reservierungen' }).click();
  await page.getByLabel('Suche').fill(target.name);
  await page.locator('tr.clickable', { hasText: target.name }).first().click();
  const dlg = page.locator('.modal');
  await dlg.getByLabel('Notizen', { exact: true }).fill('E2E Notiz');

  // währenddessen setzt jemand anderes den Gast auf „Platziert“
  await changeStored(page, `
    const r = venue.reservations.find(x => x.id === arg);
    r.status = 'platziert'; r.seatedAt = 1140; r.updatedAt = new Date().toISOString();`, target.id);

  await page.getByRole('button', { name: 'Speichern' }).click();
  await confirmWarnings(page);
  await expect(page.locator('.toast.err')).toContainText('inzwischen');
  await expect(dlg.getByRole('status')).toContainText('gerade von jemand anderem geändert');

  await page.getByRole('button', { name: 'Speichern' }).click();
  await confirmWarnings(page);
  await expect(page.locator('.toast')).toContainText('Gespeichert');
  const after = await changeStored(page, 'const r = venue.reservations.find(x => x.id === arg); return { status: r.status, notes: r.notes, seatedAt: r.seatedAt };', target.id);
  expect(after).toEqual({ status: 'platziert', notes: 'E2E Notiz', seatedAt: 1140 });
});

test('Anzeigefehler: Fehlerseite statt weißer Seite, andere Ansichten funktionieren weiter', async ({ page }) => {
  await loginDemo(page);
  await changeStored(page, 'venue.reservations.forEach(r => { r.tableIds = null; });', null);
  await page.reload();
  await expect(page.locator('.error-page')).toContainText('Da ist etwas schiefgelaufen');
  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Neu laden' })).toBeVisible();
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await expect(page.locator('.error-page')).toHaveCount(0);
  await expect(page.locator('main .panel').first()).toBeVisible();
});
